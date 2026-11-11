"""Deterministic EDF pack builder (B16): pure functions, no I/O, no network.

This module maps a month of raised invoices onto the RBI EDF worksheet
(Sections 1, 2B and 4). It is deliberately side-effect free: it takes frozen
reference dataclasses and returns plain dicts, so it is fully unit-testable and
reproducible. Every constant and policy value comes from ``rules/india_export.yaml``
via the caller (AGENTS.md rule 6). There is no AI, no agent and no filing: the
output is a worksheet for the exporter's bank or CA.

Money is ``Decimal`` only; nothing is ever a float. All rendered amounts are
strings so a snapshot is byte-for-byte stable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from ..rules import engine as rules_engine

# Net-realisable-value provenance labels (never silently mixed).
NRV_PAYPAL = "paypal"
NRV_ACTUAL = "actual"
NRV_SIMULATED = "simulated"
NRV_EXPECTED = "expected"

# Validation levels.
BLOCKING = "blocking"
WARNING = "warning"
INFO = "info"


# ---- Frozen reference inputs ------------------------------------------------------


@dataclass(frozen=True)
class ClientRef:
    """The Section 2B service recipient (a synthetic/real client, never PII here)."""

    name: str
    country: str | None
    address: str | None = None


@dataclass(frozen=True)
class ExporterRef:
    """The Section 1 exporter identity."""

    legal_name: str
    entity_type: str | None = None
    pan: str | None = None
    gstin: str | None = None
    ad_bank_name: str | None = None
    ad_code: str | None = None
    ie_code: str | None = None
    address: str | None = None
    sac_code: str | None = None


@dataclass(frozen=True)
class InvoiceRef:
    """One invoice, resolved against its client. Money is Decimal."""

    id: int
    number: str
    issue_date: date
    currency: str
    amount: Decimal
    service_description: str
    contract_ref: str | None
    contract_date: date | None
    purpose_code: str | None
    sac_code: str | None
    status: str
    client: ClientRef


@dataclass(frozen=True)
class PaymentRef:
    """A recorded PayPal payment used for the Net Realisable value."""

    id: int
    invoice_id: int | None
    capture_id: str
    currency: str | None
    net: Decimal | None


@dataclass(frozen=True)
class Nrv:
    """The resolved Net Realisable value for one line, with its provenance."""

    value: Decimal
    currency: str
    source: str


@dataclass(frozen=True)
class ExceptionRef:
    """An open exception used by the completeness validation."""

    category: str
    severity: str


# ---- Small deterministic helpers --------------------------------------------------


_ONES = (
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
)
_TENS = (
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
)


def _two(n: int) -> str:
    """Words for 1..99."""
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return _TENS[tens] + (f" {_ONES[ones]}" if ones else "")


def _under_1000(n: int) -> str:
    """Words for 1..999 using the hundred/ten/one grouping."""
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_two(rest))
    return " ".join(parts)


def _indian(n: int) -> str:
    """Words for a non-negative integer using the Indian crore/lakh/thousand system."""
    if n == 0:
        return ""
    parts: list[str] = []
    crore, rest = divmod(n, 10_000_000)
    lakh, rest = divmod(rest, 100_000)
    thousand, rest = divmod(rest, 1_000)
    if crore:
        parts.append(f"{_indian(crore)} Crore")
    if lakh:
        parts.append(f"{_two(lakh)} Lakh")
    if thousand:
        parts.append(f"{_two(thousand)} Thousand")
    if rest:
        parts.append(_under_1000(rest))
    return " ".join(parts)


def amount_in_words(amount: Decimal) -> str:
    """Render an INR amount in words (Indian numbering), two decimals rounded."""
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rupees = int(amount)
    paise = int((amount - Decimal(rupees)) * 100)
    words = f"Indian Rupees {_indian(rupees) or 'Zero'}"
    if paise:
        words += f" and {_two(paise)} Paise"
    return f"{words} Only"


def period_bounds(year: int, month: int) -> tuple[date, date]:
    """First and last calendar day of a month."""
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1)
    return start, end - timedelta(days=1)


def select_invoices(
    invoices: list[InvoiceRef],
    *,
    year: int,
    month: int,
    included_statuses: list[str],
) -> list[InvoiceRef]:
    """Invoices raised in the period, deterministically ordered by (date, number)."""
    allowed = {s.upper() for s in included_statuses}
    picked = [
        inv
        for inv in invoices
        if inv.issue_date.year == year
        and inv.issue_date.month == month
        and inv.status.upper() in allowed
    ]
    return sorted(picked, key=lambda i: (i.issue_date, i.number))


def resolve_nrv(
    invoice: InvoiceRef,
    payments: list[PaymentRef],
    fira_inr: dict[int, Decimal],
) -> Nrv:
    """Resolve the Net Realisable value, preferring PayPal net then realised INR.

    Precedence: a recorded PayPal payment's ``net`` in billing currency, else the
    matched FIRA credit in INR, else the invoiced amount labelled ``expected``.
    """
    pays = [p for p in payments if p.invoice_id == invoice.id and p.net is not None]
    if pays:
        chosen = min(pays, key=lambda p: p.id)
        return Nrv(Decimal(chosen.net), chosen.currency or invoice.currency, NRV_PAYPAL)
    if invoice.id in fira_inr:
        return Nrv(Decimal(fira_inr[invoice.id]), "INR", NRV_ACTUAL)
    return Nrv(Decimal(invoice.amount), invoice.currency, NRV_EXPECTED)


def _money(value: Decimal | None) -> str | None:
    """Two-decimal string, so a snapshot is stable and float-free."""
    if value is None:
        return None
    return str(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _join_address(name: str | None, address: str | None) -> str:
    name = (name or "").strip()
    address = (address or "").strip()
    if name and address:
        return f"{name}, {address}"
    return name or address or ""


def _contract_text(invoice: InvoiceRef, placeholder: str) -> str:
    ref = (invoice.contract_ref or "").strip()
    when = invoice.contract_date.isoformat() if invoice.contract_date else ""
    if ref and when:
        return f"{ref} dated {when}"
    if ref:
        return ref
    if when:
        return f"dated {when}"
    return placeholder


def _remarks(payment: PaymentRef | None, nrv: Nrv) -> str:
    if payment is not None:
        return f"PayPal capture {payment.capture_id}"
    if nrv.source == NRV_ACTUAL:
        return "Realised via matched FIRA credit"
    return ""


def _line_from(
    sequence: int,
    invoice: InvoiceRef,
    nrv: Nrv,
    payment: PaymentRef | None,
    *,
    cfg: dict[str, Any],
) -> dict[str, Any]:
    """Build one Section 2B row (plus internal provenance fields)."""
    return {
        "sequence": sequence,
        "invoice_id": invoice.id,
        "payment_id": payment.id if payment else None,
        "client_name": invoice.client.name,
        "client_country": invoice.client.country,
        "service_recipient_name_address": _join_address(
            invoice.client.name, invoice.client.address
        ),
        "country": invoice.client.country,
        "invoice_number": invoice.number,
        "invoice_date": invoice.issue_date.isoformat(),
        "currency": invoice.currency,
        "amount": _money(invoice.amount),
        "net_realisable_value": _money(nrv.value),
        "nrv_currency": nrv.currency,
        "nrv_source": nrv.source,
        "contract_ref": invoice.contract_ref,
        "contract_date": invoice.contract_date.isoformat()
        if invoice.contract_date
        else None,
        "contract_no_and_date": _contract_text(invoice, cfg["date_placeholder"]),
        "description": invoice.service_description,
        "sac_code": invoice.sac_code,
        "remarks": _remarks(payment, nrv),
        # Internal (not a Section 2B column) -- used by validation only.
        "purpose_code": invoice.purpose_code,
    }


def _totals(
    lines: list[dict[str, Any]], reference_rates: dict[str, Decimal]
) -> dict[str, Any]:
    """Currency-wise invoice/NRV totals plus an INR total from the YAML rates."""
    by_currency: dict[str, Decimal] = {}
    nrv_by_currency: dict[str, Decimal] = {}
    total_inr = Decimal("0")
    unconvertible: list[str] = []
    simulated = False
    for line in lines:
        currency = line["currency"]
        amount = Decimal(line["amount"])
        by_currency[currency] = by_currency.get(currency, Decimal("0")) + amount
        nrv = Decimal(line["net_realisable_value"])
        nrv_ccy = line["nrv_currency"]
        nrv_by_currency[nrv_ccy] = nrv_by_currency.get(nrv_ccy, Decimal("0")) + nrv
        if nrv_ccy == "INR":
            total_inr += nrv
        elif nrv_ccy in reference_rates:
            total_inr += nrv * reference_rates[nrv_ccy]
            simulated = True
        else:
            unconvertible.append(nrv_ccy)
    return {
        "line_count": len(lines),
        "by_currency": {k: _money(v) for k, v in sorted(by_currency.items())},
        "nrv_by_currency": {k: _money(v) for k, v in sorted(nrv_by_currency.items())},
        "total_inr": _money(total_inr.quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
        "total_inr_simulated": simulated,
        "unconvertible_currencies": sorted(set(unconvertible)),
    }


# ---- Section 1 / 4 assembly --------------------------------------------------------


def _section_1(
    exporter: ExporterRef,
    lines: list[dict[str, Any]],
    totals: dict[str, Any],
    *,
    year: int,
    month: int,
    cfg: dict[str, Any],
) -> dict[str, Any]:
    descriptions = sorted(
        {line["description"] for line in lines if line["description"]}
    )
    return {
        "type_of_export": cfg["trade_type"],
        "form_no": f"EDF-{year}-{month:02d}",
        "shipping_bill_no_date": cfg["date_placeholder"],
        "mode_of_transport_delivery": cfg["mode_of_transport"],
        "category_of_exporter": cfg["category_of_exporter"],
        "ad_code": exporter.ad_code,
        "ie_code": exporter.ie_code,
        "gstin": exporter.gstin,
        "pan": exporter.pan,
        "ad_name_address": exporter.ad_bank_name,
        "exporters_name_address": _join_address(exporter.legal_name, exporter.address),
        "mode_of_realisation": cfg["mode_of_realisation"],
        "consignee_name_address": cfg["consignee_for_multiple"],
        "third_party_name_address": None,
        "relationship_exporter_third_party": None,
        "country_of_final_destination": cfg["country_for_multiple"],
        "port_of_discharge": cfg["date_placeholder"],
        "name_of_the_ad": exporter.ad_bank_name,
        "description_of_goods_services": "; ".join(descriptions),
        "total_fob_services_value_in_words": amount_in_words(
            Decimal(totals["total_inr"])
        ),
    }


def _section_4(
    lines: list[dict[str, Any]], *, cfg: dict[str, Any], rules: dict[str, Any]
) -> dict[str, Any]:
    """Section 4 declaration. The realisation date is the latest across the lines."""
    due_dates = [
        rules_engine.realisation_due_date(
            date.fromisoformat(line["invoice_date"]), line["currency"], rules=rules
        )
        for line in lines
    ]
    latest = max(due_dates).isoformat() if due_dates else cfg["date_placeholder"]
    template = cfg["declaration_template"]
    declaration = template.format(realisation_date=latest) if template else ""
    return {
        "declaration": declaration,
        "realisation_date": latest,
        "worksheet_note": cfg["worksheet_note"],
    }


# ---- Validation --------------------------------------------------------------------


def _item(key: str, level: str, ok: bool, message: str) -> dict[str, Any]:
    return {"key": key, "level": level, "ok": ok, "message": message}


def validate_pack(
    *,
    exporter: ExporterRef,
    lines: list[dict[str, Any]],
    totals: dict[str, Any],
    cfg: dict[str, Any],
    reference_rates: dict[str, Decimal],
    open_exceptions: list[ExceptionRef],
) -> list[dict[str, Any]]:
    """Deterministic completeness checklist. ``pack_ready`` == no blocking failure."""
    items: list[dict[str, Any]] = []

    missing_identity = [
        name
        for name, value in (
            ("legal_name", exporter.legal_name),
            ("pan", exporter.pan),
            ("gstin", exporter.gstin),
            ("ad_code", exporter.ad_code),
            ("ad_name_address", exporter.ad_bank_name),
        )
        if not value
    ]
    items.append(
        _item(
            "exporter_identity",
            BLOCKING,
            not missing_identity,
            "Exporter Section 1 identity complete"
            if not missing_identity
            else f"Missing exporter identity: {', '.join(missing_identity)}",
        )
    )

    missing_purpose = [l["invoice_number"] for l in lines if not l["purpose_code"]]
    items.append(
        _item(
            "purpose_code",
            BLOCKING,
            not missing_purpose,
            "Every invoice has a committed purpose code"
            if not missing_purpose
            else f"Invoices without a purpose code: {', '.join(missing_purpose)}",
        )
    )

    missing_sac = [l["invoice_number"] for l in lines if not l["sac_code"]]
    items.append(
        _item(
            "sac_code",
            BLOCKING,
            not missing_sac,
            "Every invoice has a SAC code"
            if not missing_sac
            else f"Invoices without a SAC code: {', '.join(missing_sac)}",
        )
    )

    missing_nrv = [l["invoice_number"] for l in lines if not l["net_realisable_value"]]
    items.append(
        _item(
            "net_realisable_value",
            BLOCKING,
            not missing_nrv,
            "Every invoice has a Net Realisable value"
            if not missing_nrv
            else f"Invoices without a Net Realisable value: {', '.join(missing_nrv)}",
        )
    )

    blocking_set = set(cfg["blocking_exception_categories"])
    blocking = [e for e in open_exceptions if e.category in blocking_set]
    items.append(
        _item(
            "blocking_exceptions",
            BLOCKING,
            not blocking,
            "No open blocking exceptions"
            if not blocking
            else "Open blocking exceptions: "
            + ", ".join(f"{e.category} ({e.severity})" for e in blocking),
        )
    )

    reconciled = all(
        Decimal(str(total))
        == sum(
            (Decimal(l["amount"]) for l in lines if l["currency"] == currency),
            Decimal("0"),
        )
        for currency, total in totals["by_currency"].items()
    )
    items.append(
        _item(
            "totals_reconcile",
            BLOCKING,
            reconciled,
            "Line amounts reconcile to the Section 1 totals"
            if reconciled
            else "Line amounts do not reconcile to the Section 1 totals",
        )
    )

    items.append(
        _item(
            "trade_type",
            INFO,
            cfg["trade_type"] == "Service",
            f"Trade type: {cfg['trade_type']}",
        )
    )

    items.append(
        _item(
            "ie_code",
            WARNING,
            bool(exporter.ie_code),
            "IE code present"
            if exporter.ie_code
            else "IE code not provided (conditional)",
        )
    )

    items.append(
        _item(
            "realisation_period",
            WARNING,
            not totals["unconvertible_currencies"],
            "Realisation period resolvable for every currency"
            if not totals["unconvertible_currencies"]
            else "No INR reference rate for: "
            + ", ".join(totals["unconvertible_currencies"]),
        )
    )

    non_blocking = [e for e in open_exceptions if e.category not in blocking_set]
    items.append(
        _item(
            "non_blocking_exceptions",
            WARNING,
            not non_blocking,
            "No open non-blocking exceptions"
            if not non_blocking
            else "Open non-blocking exceptions: "
            + ", ".join(f"{e.category}" for e in non_blocking),
        )
    )
    return items


def pack_ready(validation: list[dict[str, Any]]) -> bool:
    """A pack is ready when no blocking check has failed."""
    return all(item["ok"] for item in validation if item["level"] == BLOCKING)


# ---- Top-level build ---------------------------------------------------------------


@dataclass
class BuiltPack:
    """The immutable result of a deterministic build."""

    engine_version: str
    period_year: int
    period_month: int
    period_start: date
    period_end: date
    is_synthetic: bool
    snapshot: dict[str, Any] = field(default_factory=dict)
    validation: list[dict[str, Any]] = field(default_factory=list)
    ready: bool = False


def build_pack(
    *,
    exporter: ExporterRef,
    invoices: list[InvoiceRef],
    payments: list[PaymentRef],
    fira_inr: dict[int, Decimal],
    open_exceptions: list[ExceptionRef],
    reference_rates: dict[str, Decimal],
    cfg: dict[str, Any],
    year: int,
    month: int,
    is_synthetic: bool = False,
    rules: dict[str, Any] | None = None,
) -> BuiltPack:
    """Build the complete EDF worksheet deterministically from the ledger refs."""
    start, end = period_bounds(year, month)
    selected = select_invoices(
        invoices, year=year, month=month, included_statuses=cfg["included_statuses"]
    )
    by_invoice_payment: dict[int, PaymentRef] = {}
    for pay in sorted(payments, key=lambda p: p.id):
        if pay.invoice_id is not None:
            by_invoice_payment.setdefault(pay.invoice_id, pay)

    lines: list[dict[str, Any]] = []
    for seq, invoice in enumerate(selected, start=1):
        nrv = resolve_nrv(invoice, payments, fira_inr)
        lines.append(
            _line_from(seq, invoice, nrv, by_invoice_payment.get(invoice.id), cfg=cfg)
        )

    totals = _totals(lines, reference_rates)
    section_1 = _section_1(exporter, lines, totals, year=year, month=month, cfg=cfg)
    section_4 = _section_4(lines, cfg=cfg, rules=rules)
    validation = validate_pack(
        exporter=exporter,
        lines=lines,
        totals=totals,
        cfg=cfg,
        reference_rates=reference_rates,
        open_exceptions=open_exceptions,
    )

    snapshot = {
        "note": cfg["worksheet_note"],
        "engine_version": cfg["engine_version"],
        "synthetic": is_synthetic,
        "period": {
            "year": year,
            "month": month,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "section_1_general_information": section_1,
        "section_2b_services": lines,
        "section_4_declaration": section_4,
        "totals": totals,
        "validation": validation,
        "pack_ready": pack_ready(validation),
    }
    return BuiltPack(
        engine_version=cfg["engine_version"],
        period_year=year,
        period_month=month,
        period_start=start,
        period_end=end,
        is_synthetic=is_synthetic,
        snapshot=snapshot,
        validation=validation,
        ready=pack_ready(validation),
    )
