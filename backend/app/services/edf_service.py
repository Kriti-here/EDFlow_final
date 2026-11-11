"""EDF pack orchestration (B16): generation, validation, approval and export.

This service owns the pack lifecycle (``draft -> approved -> exported``, plus
``void``) and is the only place that writes ``EDFPack`` / ``EDFPackLine`` rows.
It assembles frozen reference inputs from the ledger, calls the pure
``edf_engine`` and stores a canonical, SHA-256-hashed snapshot on approval. Every
transition is written to the hash-chained audit log.

A pack is a *worksheet*, never a filing: this service never contacts a bank or the
RBI and never sends anything. No AI, no agent (AGENTS.md rules 2 and 6).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    EDFPack,
    EDFPackLine,
    ExceptionRecord,
    ExporterProfile,
    FiraLine,
    Invoice,
    MatchRecord,
    Payment,
)
from ..rules import engine as rules_engine
from . import audit
from .edf_engine import (
    BuiltPack,
    ClientRef,
    ExceptionRef,
    ExporterRef,
    InvoiceRef,
    PaymentRef,
    build_pack,
)

STATUS_DRAFT = "draft"
STATUS_APPROVED = "approved"
STATUS_EXPORTED = "exported"
STATUS_VOID = "void"
_TERMINAL = (STATUS_APPROVED, STATUS_EXPORTED)


class EDFPackNotFound(Exception):
    """Raised when a requested pack does not exist."""


class EDFPackTransitionError(Exception):
    """Raised when a lifecycle transition is not allowed."""


# ---- Canonical serialisation ------------------------------------------------------


def _canonical(obj: Any) -> str:
    """Stable JSON (sorted keys, no spaces) so snapshots hash deterministically."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def snapshot_hash(snapshot_json: str) -> str:
    """SHA-256 of the canonical snapshot text (stored on approval)."""
    return hashlib.sha256(snapshot_json.encode("utf-8")).hexdigest()


# ---- Ledger -> reference inputs ---------------------------------------------------


def _exporter_ref(db: Session, cfg: dict[str, Any]) -> ExporterRef:
    profile = db.scalars(select(ExporterProfile).order_by(ExporterProfile.id)).first()
    if profile is None:
        return ExporterRef(legal_name="")
    return ExporterRef(
        legal_name=profile.legal_name,
        entity_type=profile.entity_type,
        pan=profile.pan,
        gstin=profile.gstin,
        ad_bank_name=profile.ad_bank_name,
        ad_code=profile.ad_code,
        ie_code=profile.ie_code,
        address=profile.address,
        sac_code=profile.sac_code,
    )


def _invoice_refs(db: Session, *, sac_default: str | None) -> list[InvoiceRef]:
    refs: list[InvoiceRef] = []
    for inv in db.scalars(select(Invoice).order_by(Invoice.issue_date, Invoice.number)):
        refs.append(
            InvoiceRef(
                id=inv.id,
                number=inv.number,
                issue_date=inv.issue_date,
                currency=inv.currency,
                amount=Decimal(inv.amount),
                service_description=inv.service_description,
                contract_ref=inv.contract_ref,
                contract_date=inv.contract_date,
                purpose_code=inv.purpose_code,
                sac_code=inv.sac_code or sac_default,
                status=inv.status,
                client=ClientRef(
                    name=inv.client.name,
                    country=inv.client.country,
                    address=inv.client.address,
                ),
            )
        )
    return refs


def _payment_refs(db: Session) -> list[PaymentRef]:
    return [
        PaymentRef(
            id=pay.id,
            invoice_id=pay.invoice_id,
            capture_id=pay.paypal_capture_id,
            currency=pay.currency,
            net=Decimal(pay.net) if pay.net is not None else None,
        )
        for pay in db.scalars(select(Payment).order_by(Payment.id))
    ]


def _fira_inr(db: Session) -> dict[int, Decimal]:
    """invoice_id -> realised INR (net) from the first matched FIRA line."""
    out: dict[int, Decimal] = {}
    matches = db.scalars(
        select(MatchRecord)
        .where(
            MatchRecord.invoice_id.is_not(None), MatchRecord.fira_line_id.is_not(None)
        )
        .order_by(MatchRecord.id)
    )
    for match in matches:
        if match.invoice_id in out:
            continue
        line = db.get(FiraLine, match.fira_line_id)
        if line is not None and line.net_amount_inr is not None:
            out[match.invoice_id] = Decimal(line.net_amount_inr)
    return out


def _open_exceptions(db: Session) -> list[ExceptionRef]:
    return [
        ExceptionRef(category=exc.category, severity=exc.severity)
        for exc in db.scalars(
            select(ExceptionRecord).where(ExceptionRecord.status == "open")
        )
    ]


def _is_synthetic(db: Session) -> bool:
    return any(pay.data_source == "synthetic" for pay in db.scalars(select(Payment)))


# ---- Build / persist --------------------------------------------------------------


def _build(
    db: Session, *, year: int, month: int, rules: dict[str, Any] | None
) -> BuiltPack:
    cfg = rules_engine.edf_pack_config(rules=rules)
    reference_rates = rules_engine.matching_fx_rates(rules=rules)
    exporter = _exporter_ref(db, cfg)
    return build_pack(
        exporter=exporter,
        invoices=_invoice_refs(db, sac_default=exporter.sac_code),
        payments=_payment_refs(db),
        fira_inr=_fira_inr(db),
        open_exceptions=_open_exceptions(db),
        reference_rates=reference_rates,
        cfg=cfg,
        year=year,
        month=month,
        is_synthetic=_is_synthetic(db),
        rules=rules,
    )


def _apply(pack: EDFPack, built: BuiltPack) -> None:
    """Copy a built pack onto the ORM row, replacing the line set in place."""
    snapshot = built.snapshot
    pack.period_start = built.period_start
    pack.period_end = built.period_end
    pack.line_count = len(snapshot["section_2b_services"])
    pack.exporter_snapshot_json = _canonical(snapshot["section_1_general_information"])
    pack.totals_json = _canonical(snapshot["totals"])
    pack.validation_json = _canonical(built.validation)
    pack.pack_ready = built.ready
    pack.snapshot_json = _canonical(snapshot)
    pack.engine_version = built.engine_version
    pack.is_synthetic = built.is_synthetic

    pack.lines.clear()
    for line in snapshot["section_2b_services"]:
        pack.lines.append(
            EDFPackLine(
                sequence=line["sequence"],
                invoice_id=line["invoice_id"],
                payment_id=line["payment_id"],
                client_name=line["client_name"],
                client_country=line["client_country"],
                invoice_number=line["invoice_number"],
                invoice_date=date.fromisoformat(line["invoice_date"]),
                currency=line["currency"],
                amount=Decimal(line["amount"]),
                net_realisable_value=Decimal(line["net_realisable_value"]),
                nrv_currency=line["nrv_currency"],
                nrv_source=line["nrv_source"],
                contract_ref=line["contract_ref"],
                contract_date=(
                    date.fromisoformat(line["contract_date"])
                    if line["contract_date"]
                    else None
                ),
                description=line["description"],
                sac_code=line["sac_code"],
                remarks=line["remarks"],
            )
        )


def generate_pack(
    db: Session,
    *,
    year: int,
    month: int,
    actor: str = "user",
    note: str | None = None,
    rules: dict[str, Any] | None = None,
) -> EDFPack:
    """Create or refresh the draft pack for a calendar month (idempotent)."""
    if not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")
    pack = db.scalars(
        select(EDFPack).where(
            EDFPack.period_year == year, EDFPack.period_month == month
        )
    ).first()
    if pack is not None and pack.status in _TERMINAL:
        raise EDFPackTransitionError(
            f"Pack {year}-{month:02d} is {pack.status}; revoke it before regenerating"
        )
    if pack is None:
        pack = EDFPack(period_year=year, period_month=month)
        db.add(pack)
    pack.status = STATUS_DRAFT
    if note is not None:
        pack.note = note

    built = _build(db, year=year, month=month, rules=rules)
    _apply(pack, built)
    db.flush()
    audit.append(
        db,
        actor,
        "edf_pack.generated",
        "edf_pack",
        pack.id,
        {
            "period": f"{year}-{month:02d}",
            "lines": pack.line_count,
            "pack_ready": pack.pack_ready,
            "engine_version": pack.engine_version,
        },
    )
    db.commit()
    return pack


def validate_pack(
    db: Session,
    pack_id: int,
    *,
    actor: str = "user",
    rules: dict[str, Any] | None = None,
) -> EDFPack:
    """Re-run the completeness checklist against the current ledger state."""
    pack = get_pack(db, pack_id)
    if pack.status in _TERMINAL:
        raise EDFPackTransitionError(
            f"Pack is {pack.status}; revoke it before re-validating"
        )
    built = _build(db, year=pack.period_year, month=pack.period_month, rules=rules)
    _apply(pack, built)
    db.flush()
    audit.append(
        db,
        actor,
        "edf_pack.validated",
        "edf_pack",
        pack.id,
        {
            "period": f"{pack.period_year}-{pack.period_month:02d}",
            "pack_ready": pack.pack_ready,
        },
    )
    db.commit()
    return pack


# ---- Reads ------------------------------------------------------------------------


def get_pack(db: Session, pack_id: int) -> EDFPack:
    pack = db.get(EDFPack, pack_id)
    if pack is None:
        raise EDFPackNotFound(f"EDF pack {pack_id} not found")
    return pack


def list_packs(
    db: Session,
    *,
    year: int | None = None,
    month: int | None = None,
    status: str | None = None,
    limit: int = 200,
) -> list[EDFPack]:
    stmt = select(EDFPack).order_by(
        EDFPack.period_year.desc(), EDFPack.period_month.desc()
    )
    if year is not None:
        stmt = stmt.where(EDFPack.period_year == year)
    if month is not None:
        stmt = stmt.where(EDFPack.period_month == month)
    if status is not None:
        stmt = stmt.where(EDFPack.status == status)
    return list(db.scalars(stmt.limit(limit)))


def summary(db: Session) -> dict[str, Any]:
    packs = list(db.scalars(select(EDFPack)))
    by_status: dict[str, int] = {}
    for pack in packs:
        by_status[pack.status] = by_status.get(pack.status, 0) + 1
    return {"count": len(packs), "by_status": by_status}


# ---- Lifecycle --------------------------------------------------------------------


def approve_pack(
    db: Session,
    pack_id: int,
    *,
    actor: str = "user",
    note: str | None = None,
) -> EDFPack:
    """Freeze a ready draft, storing the SHA-256 of its snapshot."""
    pack = get_pack(db, pack_id)
    if pack.status != STATUS_DRAFT:
        raise EDFPackTransitionError(f"Cannot approve a pack in status '{pack.status}'")
    if not pack.pack_ready:
        raise EDFPackTransitionError(
            "Pack has blocking validation failures; resolve them before approving"
        )
    pack.status = STATUS_APPROVED
    pack.approved_at = datetime.now(timezone.utc)
    pack.approved_by = actor
    pack.approved_snapshot_hash = snapshot_hash(pack.snapshot_json)
    if note is not None:
        pack.note = note
    audit.append(
        db,
        actor,
        "edf_pack.approved",
        "edf_pack",
        pack.id,
        {
            "period": f"{pack.period_year}-{pack.period_month:02d}",
            "snapshot_hash": pack.approved_snapshot_hash,
        },
    )
    db.commit()
    return pack


def revoke_pack(
    db: Session, pack_id: int, *, actor: str = "user", note: str | None = None
) -> EDFPack:
    """Void an approved/exported pack so it can be regenerated."""
    pack = get_pack(db, pack_id)
    if pack.status not in _TERMINAL:
        raise EDFPackTransitionError(f"Cannot revoke a pack in status '{pack.status}'")
    pack.status = STATUS_VOID
    if note is not None:
        pack.note = note
    audit.append(
        db,
        actor,
        "edf_pack.revoked",
        "edf_pack",
        pack.id,
        {"period": f"{pack.period_year}-{pack.period_month:02d}"},
    )
    db.commit()
    return pack


# ---- Export rendering -------------------------------------------------------------


def render_csv(snapshot: dict[str, Any]) -> str:
    """Section 2B as CSV, for a CA or bank to read in a spreadsheet."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "S.No",
            "Service recipient",
            "Country",
            "Invoice No",
            "Invoice Date",
            "Currency",
            "Amount",
            "Net Realisable value",
            "NRV Currency",
            "NRV Source",
            "Contract No. and Date",
            "Description of services",
            "SAC Code",
            "Remarks",
        ]
    )
    for line in snapshot["section_2b_services"]:
        writer.writerow(
            [
                line["sequence"],
                line["service_recipient_name_address"],
                line["country"] or "",
                line["invoice_number"],
                line["invoice_date"],
                line["currency"],
                line["amount"],
                line["net_realisable_value"],
                line["nrv_currency"],
                line["nrv_source"],
                line["contract_no_and_date"],
                line["description"],
                line["sac_code"] or "",
                line["remarks"],
            ]
        )
    return buffer.getvalue()


def render_pdf(snapshot: dict[str, Any]) -> bytes:
    """A one-page worksheet PDF, clearly marked as an unfiled draft."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    page = landscape(A4)
    width, height = page
    pdf = canvas.Canvas(buffer, pagesize=page)
    pdf.setTitle(
        f"EDF worksheet {snapshot['period']['year']}-{snapshot['period']['month']:02d}"
    )
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(24, height - 30, f"EDF WORKSHEET {snapshot['note']}")
    pdf.setFont("Helvetica", 8)
    if snapshot.get("synthetic"):
        pdf.drawString(24, height - 42, "SYNTHETIC - NOT A REAL DOCUMENT")
    pdf.drawString(
        24,
        height - 54,
        f"Engine {snapshot['engine_version']}   "
        f"Period {snapshot['period']['start']} to {snapshot['period']['end']}   "
        f"Total (INR) {snapshot['totals']['total_inr']}",
    )
    y = height - 76
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(24, y, "S.No  Invoice       Currency  Amount     NRV        SAC")
    pdf.setFont("Helvetica", 8)
    for line in snapshot["section_2b_services"]:
        y -= 13
        if y < 40:
            pdf.showPage()
            y = height - 40
        pdf.drawString(
            24,
            y,
            f"{line['sequence']:>4}  {line['invoice_number']:<13} "
            f"{line['currency']:<8} {line['amount']:<10} "
            f"{line['net_realisable_value']:<10} {line['sac_code'] or '-'}",
        )
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def export_document(
    db: Session, pack_id: int, *, fmt: str = "json", actor: str = "user"
) -> dict[str, Any]:
    """Render an approved pack; mark it exported on first download."""
    fmt = fmt.lower()
    if fmt not in ("json", "csv", "pdf"):
        raise ValueError("format must be one of: json, csv, pdf")
    pack = get_pack(db, pack_id)
    if pack.status not in _TERMINAL:
        raise EDFPackTransitionError("Only an approved pack can be exported")
    snapshot = json.loads(pack.snapshot_json)
    filename = (
        f"EDF_{pack.period_year}_{pack.period_month:02d}_{pack.engine_version}.{fmt}"
    )
    if fmt == "json":
        payload: Any = snapshot
        media_type = "application/json"
    elif fmt == "csv":
        payload = render_csv(snapshot)
        media_type = "text/csv"
    else:
        payload = render_pdf(snapshot)
        media_type = "application/pdf"

    if pack.status == STATUS_APPROVED:
        pack.status = STATUS_EXPORTED
        pack.exported_at = datetime.now(timezone.utc)
        pack.exported_by = actor
    audit.append(
        db,
        actor,
        "edf_pack.exported",
        "edf_pack",
        pack.id,
        {"format": fmt, "filename": filename},
    )
    db.commit()
    return {
        "filename": filename,
        "format": fmt,
        "engine_version": pack.engine_version,
        "media_type": media_type,
        "payload": payload,
    }
