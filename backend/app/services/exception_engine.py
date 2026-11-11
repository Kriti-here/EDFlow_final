"""Deterministic exception derivation engine (B13).

Pure and side-effect free: it takes plain inputs (match records, the FIRA line
map, the invoice/payment ledger) plus the YAML exception configuration and
returns the set of exceptions that *should* exist right now. Persistence, the
review lifecycle, auto-close and audit live in
``app/services/exception_service.py``.

An exception is a projection, never a new source of truth: the engine only reads
match records and ledger rows and never mutates them (``MatchRecord`` stays
authoritative). The same inputs always yield the same set, and the ``dedupe_key``
of each exception is stable so derivation is idempotent.

Categories (eight, all YAML-gated):

* line-level, mirroring ``MatchRecord.match_type`` one-for-one:
  ``unmatched``, ``ambiguous``, ``duplicate``, ``fx_variance``, ``missing_reference``;
* ledger-level gaps: ``missing_fira`` (paid but never seen in a FIRA),
  ``missing_payment`` (matched in a FIRA but never recorded as paid) and
  ``orphan_payment`` (a recorded payment linked to no invoice).

There is no AI, no network and no EDF generation here (AGENTS.md rules 2 and 6).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

# Severities (mirror the YAML vocabulary).
LOW = "low"
MEDIUM = "medium"
HIGH = "high"
CRITICAL = "critical"

# Lifecycle statuses owned by the exception table.
OPEN = "open"
ACKNOWLEDGED = "acknowledged"
RESOLVED = "resolved"
DISMISSED = "dismissed"

# Origins.
SOURCE_MATCH = "match_record"
SOURCE_LEDGER = "ledger"

# The actor recorded when the system closes an exception by itself.
SYSTEM_ACTOR = "system"

# Line-level categories are exactly the match types that warrant review.
LINE_CATEGORIES = (
    "unmatched",
    "ambiguous",
    "duplicate",
    "fx_variance",
    "missing_reference",
)


@dataclass(frozen=True)
class MatchRef:
    """One stored match decision, flattened for the exception engine."""

    id: int
    fira_line_id: int
    match_type: str
    status: str
    confidence_bp: int
    invoice_id: int | None
    payment_id: int | None


@dataclass(frozen=True)
class LineRef:
    """One FIRA line, enough to link an exception back to its document."""

    id: int
    document_id: int
    line_no: int
    is_synthetic: bool


@dataclass(frozen=True)
class InvoiceRef:
    """One ledger invoice."""

    id: int
    number: str


@dataclass(frozen=True)
class PaymentRef:
    """One ledger payment."""

    id: int
    invoice_id: int | None
    capture_id: str
    is_synthetic: bool


@dataclass
class DerivedException:
    """The engine's verdict: one exception that should currently exist."""

    category: str
    severity: str
    dedupe_key: str
    source: str
    match_id: int | None = None
    fira_line_id: int | None = None
    fira_document_id: int | None = None
    invoice_id: int | None = None
    payment_id: int | None = None
    confidence_bp: int = 0
    summary: str = ""
    details: dict = field(default_factory=dict)
    is_synthetic: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def category_enabled(category: str, config: dict) -> bool:
    """True when the YAML enables this category."""
    spec = (config.get("categories") or {}).get(category) or {}
    return bool(spec.get("enabled", False))


def severity_for(category: str, config: dict) -> str:
    """Category severity from YAML, falling back to the configured default."""
    spec = (config.get("categories") or {}).get(category) or {}
    return str(spec.get("severity") or config.get("default_severity") or MEDIUM).lower()


def dedupe_key(
    category: str,
    *,
    line_id: int | None = None,
    invoice_id: int | None = None,
    payment_id: int | None = None,
) -> str:
    """Stable identity for an exception so re-derivation updates rather than duplicates.

    A line-level category is keyed by its FIRA line; a ledger-level category by the
    invoice or payment it concerns.
    """
    if line_id is not None:
        return f"{category}:line:{line_id}"
    if invoice_id is not None:
        return f"{category}:invoice:{invoice_id}"
    if payment_id is not None:
        return f"{category}:payment:{payment_id}"
    return f"{category}:unknown"


# ---------------------------------------------------------------------------
# Engine entry point
# ---------------------------------------------------------------------------
def derive_exceptions(
    match_records: list[MatchRef],
    lines_by_id: dict[int, LineRef],
    invoices: list[InvoiceRef],
    payments: list[PaymentRef],
    *,
    config: dict,
) -> list[DerivedException]:
    """Return every exception that should currently exist, deterministically."""
    found: list[DerivedException] = []
    found.extend(_from_match_records(match_records, lines_by_id, config))
    found.extend(_ledger_gaps(match_records, invoices, payments, config))
    return sorted(found, key=lambda exc: exc.dedupe_key)


def _from_match_records(
    match_records: list[MatchRef],
    lines_by_id: dict[int, LineRef],
    config: dict,
) -> list[DerivedException]:
    out: list[DerivedException] = []
    for match in match_records:
        category = match.match_type
        if category not in LINE_CATEGORIES or not category_enabled(category, config):
            continue
        line = lines_by_id.get(match.fira_line_id)
        out.append(
            DerivedException(
                category=category,
                severity=severity_for(category, config),
                dedupe_key=dedupe_key(category, line_id=match.fira_line_id),
                source=SOURCE_MATCH,
                match_id=match.id,
                fira_line_id=match.fira_line_id,
                fira_document_id=line.document_id if line else None,
                invoice_id=match.invoice_id,
                payment_id=match.payment_id,
                confidence_bp=match.confidence_bp,
                summary=_line_summary(category, line),
                details={
                    "match_type": match.match_type,
                    "match_status": match.status,
                    "line_no": line.line_no if line else None,
                },
                is_synthetic=bool(line.is_synthetic) if line else False,
            )
        )
    return out


def _ledger_gaps(
    match_records: list[MatchRef],
    invoices: list[InvoiceRef],
    payments: list[PaymentRef],
    config: dict,
) -> list[DerivedException]:
    out: list[DerivedException] = []

    payments_by_invoice: dict[int, list[PaymentRef]] = defaultdict(list)
    for payment in payments:
        if payment.invoice_id is not None:
            payments_by_invoice[payment.invoice_id].append(payment)

    matched_line: dict[int, MatchRef] = {}
    for match in match_records:
        if match.invoice_id is not None:
            matched_line.setdefault(match.invoice_id, match)

    if category_enabled("missing_fira", config):
        for invoice in invoices:
            paid = payments_by_invoice.get(invoice.id, [])
            if paid and invoice.id not in matched_line:
                out.append(
                    DerivedException(
                        category="missing_fira",
                        severity=severity_for("missing_fira", config),
                        dedupe_key=dedupe_key("missing_fira", invoice_id=invoice.id),
                        source=SOURCE_LEDGER,
                        invoice_id=invoice.id,
                        summary=(
                            f"Invoice {invoice.number} has {len(paid)} payment(s) but "
                            "never appears in a FIRA statement."
                        ),
                        details={
                            "invoice_number": invoice.number,
                            "payments": len(paid),
                        },
                        is_synthetic=any(p.is_synthetic for p in paid),
                    )
                )

    if category_enabled("missing_payment", config):
        for invoice in invoices:
            match = matched_line.get(invoice.id)
            if match is not None and not payments_by_invoice.get(invoice.id):
                out.append(
                    DerivedException(
                        category="missing_payment",
                        severity=severity_for("missing_payment", config),
                        dedupe_key=dedupe_key("missing_payment", invoice_id=invoice.id),
                        source=SOURCE_LEDGER,
                        match_id=match.id,
                        fira_line_id=match.fira_line_id,
                        invoice_id=invoice.id,
                        confidence_bp=match.confidence_bp,
                        summary=(
                            f"Invoice {invoice.number} is matched in a FIRA but has no "
                            "recorded payment."
                        ),
                        details={"invoice_number": invoice.number},
                    )
                )

    if category_enabled("orphan_payment", config):
        for payment in payments:
            if payment.invoice_id is None:
                out.append(
                    DerivedException(
                        category="orphan_payment",
                        severity=severity_for("orphan_payment", config),
                        dedupe_key=dedupe_key("orphan_payment", payment_id=payment.id),
                        source=SOURCE_LEDGER,
                        payment_id=payment.id,
                        summary=(
                            f"Payment {payment.capture_id} is not linked to any invoice."
                        ),
                        details={"paypal_capture_id": payment.capture_id},
                        is_synthetic=payment.is_synthetic,
                    )
                )
    return out


def _line_summary(category: str, line: LineRef | None) -> str:
    where = f"FIRA line {line.line_no}" if line else "FIRA line"
    return {
        "unmatched": f"{where} references an invoice that does not exist in the ledger.",
        "ambiguous": f"{where} could not be resolved to a single invoice.",
        "duplicate": f"{where} duplicates an earlier FIRA line.",
        "fx_variance": f"{where} realised INR deviates from the reference rate.",
        "missing_reference": f"{where} carries no invoice reference.",
    }.get(category, f"{where} needs review.")
