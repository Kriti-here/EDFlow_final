"""Purpose code adviser orchestration (B12).

Turns the pure advice in ``app/services/purpose_adviser.py`` into durable,
reviewable proposals and owns the recommendation lifecycle. Historic scoring
learns only from *committed* codes (``Invoice.purpose_code_source`` of ``user``
or ``adviser_accepted``); proposed/rejected/superseded recommendations are never
used as evidence.

``PurposeRecommendation`` owns the review lifecycle, but ``Invoice.purpose_code``
stays the authoritative committed value and is written in exactly one place: the
explicit ``accept`` action below (AGENTS.md rule 2). No AI, no EDF generation,
no agent and no frontend here (AGENTS.md rules 2 and 6).
"""

from __future__ import annotations

import json
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    FiraDocument,
    FiraLine,
    Invoice,
    MatchRecord,
    PurposeRecommendation,
    utcnow,
)
from ..rules import engine as rules_engine
from ..rules.loader import load_rules
from . import audit, purpose_adviser
from .purpose_adviser import (
    ACCEPTED,
    PROPOSED,
    REJECTED,
    SUPERSEDED,
    HistoryEntry,
    InvoiceInput,
    Recommendation,
)

# Sources that count as a human-committed decision, used for historic learning.
COMMITTED_SOURCES = ("user", "adviser_accepted")
# The source stamped on the invoice when a recommendation is accepted.
ADVISER_ACCEPTED_SOURCE = "adviser_accepted"

# Membership mirrors the reserved example domains used by the synthetic corpus.
_SYNTHETIC_EMAIL_SUFFIXES = ("@example.com", "@example.org", "@example.net")

_TERMINAL_STATUSES = (ACCEPTED, REJECTED)


class PurposeNotFound(Exception):
    """Raised when a requested recommendation does not exist."""


class PurposeTransitionError(Exception):
    """Raised when a lifecycle transition is not allowed from the current status."""


# ---------------------------------------------------------------------------
# ORM -> engine inputs
# ---------------------------------------------------------------------------
def _invoice_refs(db: Session, invoice_id: int | None) -> list[Invoice]:
    query = select(Invoice).order_by(Invoice.id)
    if invoice_id is not None:
        query = query.where(Invoice.id == invoice_id)
    return list(db.scalars(query))


def _history(db: Session, stopwords: list[str]) -> list[HistoryEntry]:
    """Committed codes only -- never learn from proposals or rejections."""
    rows = db.scalars(
        select(Invoice).where(
            Invoice.purpose_code.is_not(None),
            Invoice.purpose_code_source.in_(COMMITTED_SOURCES),
        )
    )
    return [
        HistoryEntry(
            client_id=row.client_id,
            code=str(row.purpose_code),
            tokens=frozenset(
                purpose_adviser.normalize_tokens(row.service_description, stopwords)
            ),
        )
        for row in rows
    ]


def _fira_echo(db: Session) -> tuple[dict[int, set[str]], dict[int, bool]]:
    """invoice_id -> echoed purpose codes, and invoice_id -> any synthetic echo."""
    line_info = {
        row.id: (row.purpose_code, row.document_id)
        for row in db.scalars(select(FiraLine))
    }
    doc_synthetic = {
        row.id: row.is_synthetic for row in db.scalars(select(FiraDocument))
    }
    codes: dict[int, set[str]] = {}
    synthetic: dict[int, bool] = {}
    for match in db.scalars(select(MatchRecord)):
        if match.invoice_id is None or match.fira_line_id not in line_info:
            continue
        purpose_code, document_id = line_info[match.fira_line_id]
        if purpose_code:
            codes.setdefault(match.invoice_id, set()).add(purpose_code)
        if doc_synthetic.get(document_id, False):
            synthetic[match.invoice_id] = True
    return codes, synthetic


def _is_synthetic(invoice: Invoice, echo_synthetic: bool) -> bool:
    """True when the invoice's evidence comes from the synthetic corpus."""
    email = (invoice.client.email if invoice.client else "") or ""
    if email.lower().endswith(_SYNTHETIC_EMAIL_SUFFIXES):
        return True
    if any(payment.data_source == "synthetic" for payment in invoice.payments):
        return True
    return echo_synthetic


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _apply(
    row: PurposeRecommendation,
    rec: Recommendation,
    *,
    version: str,
    is_synthetic: bool,
) -> None:
    row.rank = rec.rank
    row.confidence_bp = rec.confidence_bp
    row.confidence_band = rec.confidence_band
    row.source = rec.source
    row.score_json = json.dumps(rec.score, sort_keys=True)
    row.matched_keywords_json = json.dumps(rec.matched_keywords)
    row.rationale = rec.rationale
    row.engine_version = version
    row.is_synthetic = is_synthetic
    row.last_seen_at = utcnow()


def run_adviser(
    db: Session,
    *,
    invoice_id: int | None = None,
    actor: str = "user",
    rules: dict | None = None,
) -> dict:
    """Recompute purpose-code proposals; create, refresh and supersede rows."""
    rules = rules or load_rules()
    config = rules_engine.purpose_adviser_config(rules=rules)
    version = config["engine_version"]

    history = _history(db, config.get("stopwords") or [])
    echo_codes, echo_synthetic = _fira_echo(db)
    invoices = _invoice_refs(db, invoice_id)
    scope = {invoice.id for invoice in invoices}

    existing = {
        (row.invoice_id, row.code): row
        for row in db.scalars(select(PurposeRecommendation))
        if row.invoice_id in scope
    }

    created = updated = superseded = preserved = 0
    seen: set[tuple[int, str]] = set()
    bands: Counter = Counter()
    with_proposals = 0

    for invoice in invoices:
        recommendations = purpose_adviser.recommend_for_invoice(
            InvoiceInput(
                id=invoice.id,
                number=invoice.number,
                client_id=invoice.client_id,
                service_description=invoice.service_description,
                contract_ref=invoice.contract_ref,
            ),
            history=history,
            fira_echo_codes=echo_codes.get(invoice.id, set()),
            config=config,
        )
        if recommendations:
            with_proposals += 1
        synthetic = _is_synthetic(invoice, echo_synthetic.get(invoice.id, False))
        for rec in recommendations:
            bands[rec.confidence_band] += 1
            key = (invoice.id, rec.code)
            seen.add(key)
            row = existing.get(key)
            if row is None:
                row = PurposeRecommendation(
                    invoice_id=invoice.id, code=rec.code, status=PROPOSED
                )
                db.add(row)
                _apply(row, rec, version=version, is_synthetic=synthetic)
                db.flush()
                created += 1
                audit.append(
                    db,
                    actor,
                    "purpose.proposed",
                    "purpose_recommendation",
                    row.id,
                    {
                        "invoice_id": invoice.id,
                        "code": rec.code,
                        "band": rec.confidence_band,
                    },
                )
                continue
            if row.status in _TERMINAL_STATUSES:
                # A human decision is never overwritten by re-derivation.
                preserved += 1
                continue
            _apply(row, rec, version=version, is_synthetic=synthetic)
            row.status = PROPOSED
            updated += 1

    # Proposals that fell out of the advice become superseded (terminal rows stay).
    for key, row in existing.items():
        if key in seen or row.status != PROPOSED:
            continue
        row.status = SUPERSEDED
        superseded += 1

    db.flush()
    summary = {
        "engine_version": version,
        "invoices_scanned": len(invoices),
        "invoices_with_proposals": with_proposals,
        "created": created,
        "updated": updated,
        "superseded": superseded,
        "preserved": preserved,
        "by_band": dict(bands),
    }
    audit.append(db, actor, "purpose_adviser.run", "purpose_run", version, summary)
    db.commit()
    return summary


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def get_recommendation(db: Session, rec_id: int) -> PurposeRecommendation:
    row = db.get(PurposeRecommendation, rec_id)
    if row is None:
        raise PurposeNotFound(f"recommendation {rec_id} not found")
    return row


def _require_proposed(row: PurposeRecommendation, action: str) -> None:
    if row.status != PROPOSED:
        raise PurposeTransitionError(
            f"cannot {action} a recommendation that is already {row.status}"
        )


def accept(
    db: Session, rec_id: int, *, actor: str = "user", note: str | None = None
) -> PurposeRecommendation:
    """Accept a proposal: the only path that commits Invoice.purpose_code."""
    row = get_recommendation(db, rec_id)
    _require_proposed(row, "accept")
    invoice = db.get(Invoice, row.invoice_id)
    if invoice is not None:
        invoice.purpose_code = row.code
        invoice.purpose_code_source = ADVISER_ACCEPTED_SOURCE
    row.status = ACCEPTED
    row.accepted_at = utcnow()
    row.accepted_by = actor
    row.decision_note = note

    siblings = db.scalars(
        select(PurposeRecommendation).where(
            PurposeRecommendation.invoice_id == row.invoice_id,
            PurposeRecommendation.id != row.id,
            PurposeRecommendation.status == PROPOSED,
        )
    )
    for sibling in siblings:
        sibling.status = SUPERSEDED

    db.flush()
    audit.append(
        db,
        actor,
        "purpose.accepted",
        "purpose_recommendation",
        row.id,
        {"invoice_id": row.invoice_id, "code": row.code, "note": note},
    )
    db.commit()
    return row


def reject(
    db: Session, rec_id: int, *, actor: str = "user", note: str | None = None
) -> PurposeRecommendation:
    """Reject a proposal without committing anything to the invoice."""
    row = get_recommendation(db, rec_id)
    _require_proposed(row, "reject")
    row.status = REJECTED
    row.rejected_at = utcnow()
    row.rejected_by = actor
    row.decision_note = note
    db.flush()
    audit.append(
        db,
        actor,
        "purpose.rejected",
        "purpose_recommendation",
        row.id,
        {"invoice_id": row.invoice_id, "code": row.code, "note": note},
    )
    db.commit()
    return row


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def list_recommendations(
    db: Session,
    *,
    invoice_id: int | None = None,
    code: str | None = None,
    status: str | None = None,
    band: str | None = None,
    limit: int = 200,
) -> list[PurposeRecommendation]:
    """List recommendations, best rank first, optionally filtered."""
    query = select(PurposeRecommendation).order_by(
        PurposeRecommendation.invoice_id, PurposeRecommendation.rank
    )
    if invoice_id is not None:
        query = query.where(PurposeRecommendation.invoice_id == invoice_id)
    if code:
        query = query.where(PurposeRecommendation.code == code)
    if status:
        query = query.where(PurposeRecommendation.status == status)
    if band:
        query = query.where(PurposeRecommendation.confidence_band == band)
    return list(db.scalars(query.limit(min(max(limit, 1), 500))).all())


def summary(db: Session) -> dict:
    """Aggregate recommendation counts by status, band and code."""
    rows = db.scalars(select(PurposeRecommendation)).all()
    by_status = Counter(row.status for row in rows)
    return {
        "total": len(rows),
        "proposed": by_status.get(PROPOSED, 0),
        "accepted": by_status.get(ACCEPTED, 0),
        "rejected": by_status.get(REJECTED, 0),
        "superseded": by_status.get(SUPERSEDED, 0),
        "by_status": dict(by_status),
        "by_band": dict(Counter(row.confidence_band for row in rows)),
        "by_code": dict(Counter(row.code for row in rows)),
    }
