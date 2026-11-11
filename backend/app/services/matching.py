"""Deterministic FIRA -> ledger matching engine (B11).

Pure and side-effect free: it takes plain inputs (FIRA lines, invoices, payments,
the matching rules and FX rates) and returns decisions. Persistence and audit
live in ``app/services/match_service.py``.

Design rules:

* money and rates use ``Decimal`` only (never float);
* every weight and threshold is read from ``rules/india_export.yaml`` -- nothing
  regulatory or tunable is hardcoded (AGENTS.md rule 6);
* the engine is deterministic and explainable: the same inputs always produce
  the same decision, and each decision carries the signals that produced it;
* conservative identity: a FIRA line with no invoice reference is NEVER
  auto-matched (it can only become ``missing_reference`` or ``ambiguous``);
* ``payment_id`` is only attached when confidence is high AND exactly one
  payment candidate exists;
* there is no AI, no network and no exception engine here (AGENTS.md rule 2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from ..rules import engine as rules_engine

# Match classifications (mirror the B9 ground-truth contract).
EXACT = "exact"
FX_VARIANCE = "fx_variance"
SPLIT = "split"
DUPLICATE = "duplicate"
MISSING_REFERENCE = "missing_reference"
UNMATCHED = "unmatched"
AMBIGUOUS = "ambiguous"
AMOUNT_MISMATCH = "amount_mismatch"

# Statuses written to MatchRecord.status.
MATCHED = "matched"
MATCHED_WITH_VARIANCE = "matched_with_variance"
DUPLICATE_STATUS = "duplicate"
EXCEPTION = "exception"
NEEDS_REVIEW = "needs_review"

HIGH = "high"
MEDIUM = "medium"
LOW = "low"

_PUNCT = re.compile(r"[^a-z0-9\s]")
_WS = re.compile(r"\s+")
_CENTS = Decimal("0.01")


@dataclass(frozen=True)
class LineInput:
    """One extracted FIRA line, flattened for the engine."""

    id: int
    document_id: int
    line_no: int
    invoice_reference: str | None
    currency: str | None
    gross_amount: Decimal | None
    net_amount_inr: Decimal | None
    value_date: date | None
    remitter_name: str | None
    remitter_country: str | None
    utr: str | None = None
    is_synthetic: bool = False


@dataclass(frozen=True)
class InvoiceInput:
    """One ledger invoice."""

    id: int
    number: str
    currency: str
    amount: Decimal
    client_name: str
    issue_date: date
    due_date: date


@dataclass(frozen=True)
class PaymentInput:
    """One ledger payment."""

    id: int
    invoice_id: int | None
    currency: str | None
    gross: Decimal | None
    net: Decimal | None


@dataclass
class MatchDecision:
    """The engine's verdict for a single FIRA line."""

    line_id: int
    match_type: str
    status: str
    confidence_bp: int
    confidence_band: str
    candidates: list[str] = field(default_factory=list)
    invoice_id: int | None = None
    invoice_number: str | None = None
    payment_id: int | None = None
    duplicate_of_line_id: int | None = None
    split_group: str | None = None
    split_part: int | None = None
    split_parts_total: int | None = None
    fx_expected_rate: Decimal | None = None
    fx_actual_rate: Decimal | None = None
    fx_variance_bp: int | None = None
    score: dict[str, int] = field(default_factory=dict)
    rationale: str = ""


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _quantize(value: Decimal, places: str = "0.01") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def normalize_ref(value: str | None) -> str:
    """Invoice references compare case-insensitively and whitespace-insensitively."""
    return (value or "").strip().upper()


def normalize_name(value: str | None, suffixes: list[str]) -> str:
    """Lower-case, drop punctuation and trailing legal suffixes, collapse spaces."""
    text = _PUNCT.sub(" ", (value or "").lower())
    tokens = [t for t in _WS.sub(" ", text).split() if t and t not in suffixes]
    return " ".join(tokens)


def band_for(bp: int, *, high_bp: int, medium_bp: int) -> str:
    if bp >= high_bp:
        return HIGH
    if bp >= medium_bp:
        return MEDIUM
    return LOW


def _score(weights: dict[str, int], **signals: bool) -> tuple[int, dict[str, int]]:
    fired = {
        name: int(weights[name])
        for name, ok in signals.items()
        if ok and name in weights
    }
    return sum(fired.values()), fired


# ---------------------------------------------------------------------------
# Duplicate + split pre-passes (global across every FIRA document)
# ---------------------------------------------------------------------------
def duplicate_index(lines: list[LineInput]) -> dict[int, int]:
    """Map duplicate line id -> id of the first line with the same signature.

    A line is a duplicate only when it carries a UTR (so blank UTRs never collide)
    and its UTR, currency, gross amount, value date and reference match an earlier
    line exactly.
    """
    seen: dict[tuple, int] = {}
    duplicates: dict[int, int] = {}
    for line in sorted(lines, key=lambda item: (item.document_id, item.line_no)):
        if not line.utr:
            continue
        key = (
            line.utr.strip().upper(),
            line.currency,
            line.gross_amount,
            line.value_date,
            normalize_ref(line.invoice_reference),
        )
        if key in seen:
            duplicates[line.id] = seen[key]
        else:
            seen[key] = line.id
    return duplicates


def split_groups(
    lines: list[LineInput],
    invoices_by_number: dict[str, InvoiceInput],
    duplicates: set[int],
) -> dict[int, tuple[str, int, int]]:
    """Map line id -> (invoice number, part, parts_total) for genuine splits.

    A split exists when two or more non-duplicate lines reference the same
    invoice and their gross amounts sum exactly to the invoice amount (in the
    invoice currency).
    """
    grouped: dict[str, list[LineInput]] = {}
    for line in lines:
        if line.id in duplicates:
            continue
        ref = normalize_ref(line.invoice_reference)
        if not ref:
            continue
        grouped.setdefault(ref, []).append(line)

    result: dict[int, tuple[str, int, int]] = {}
    for ref, group in grouped.items():
        invoice = invoices_by_number.get(ref)
        if invoice is None or len(group) < 2:
            continue
        total = sum(
            (line.gross_amount for line in group if line.gross_amount is not None),
            Decimal(0),
        )
        same_currency = all(line.currency == invoice.currency for line in group)
        if total == invoice.amount and same_currency:
            ordered = sorted(group, key=lambda item: (item.document_id, item.line_no))
            for index, line in enumerate(ordered, start=1):
                result[line.id] = (invoice.number, index, len(ordered))
    return result


# ---------------------------------------------------------------------------
# Engine entry point
# ---------------------------------------------------------------------------
def match_lines(
    lines: list[LineInput],
    invoices: list[InvoiceInput],
    payments: list[PaymentInput],
    *,
    rules: dict | None = None,
    fx_rates: dict[str, Decimal] | None = None,
) -> list[MatchDecision]:
    """Match every FIRA line to the ledger, deterministically and globally."""
    cfg = rules_engine.matching_config(rules=rules)
    rates = (
        fx_rates
        if fx_rates is not None
        else rules_engine.matching_fx_rates(rules=rules)
    )

    invoices_by_number = {invoice.number.upper(): invoice for invoice in invoices}
    payments_by_invoice: dict[int, list[PaymentInput]] = {}
    for payment in payments:
        if payment.invoice_id is not None:
            payments_by_invoice.setdefault(payment.invoice_id, []).append(payment)

    duplicates = duplicate_index(lines)
    splits = split_groups(lines, invoices_by_number, set(duplicates))

    context = _Context(
        cfg=cfg,
        rates=rates,
        invoices=invoices,
        invoices_by_number=invoices_by_number,
        payments_by_invoice=payments_by_invoice,
        duplicates=duplicates,
        splits=splits,
    )
    return [
        _decide(line, context)
        for line in sorted(lines, key=lambda item: (item.document_id, item.line_no))
    ]


@dataclass
class _Context:
    cfg: dict
    rates: dict[str, Decimal]
    invoices: list[InvoiceInput]
    invoices_by_number: dict[str, InvoiceInput]
    payments_by_invoice: dict[int, list[PaymentInput]]
    duplicates: dict[int, int]
    splits: dict[int, tuple[str, int, int]]


def _decide(line: LineInput, ctx: _Context) -> MatchDecision:
    if line.id in ctx.duplicates:
        return _duplicate(line, ctx)

    ref = normalize_ref(line.invoice_reference)
    if not ref:
        return _reference_less(line, ctx)

    invoice = ctx.invoices_by_number.get(ref)
    if invoice is None:
        return _unmatched(line, ctx)

    if line.id in ctx.splits:
        return _split(line, invoice, ctx)

    return _referenced(line, invoice, ctx)


# ---- branch: duplicate -------------------------------------------------------
def _duplicate(line: LineInput, ctx: _Context) -> MatchDecision:
    original_id = ctx.duplicates[line.id]
    ref = normalize_ref(line.invoice_reference)
    invoice = ctx.invoices_by_number.get(ref) if ref else None
    bp, fired = _score(ctx.cfg["weights_bp"], reference_present=bool(ref))
    return MatchDecision(
        line_id=line.id,
        match_type=DUPLICATE,
        status=DUPLICATE_STATUS,
        confidence_bp=bp,
        confidence_band=band_for(
            bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"]
        ),
        candidates=[invoice.number] if invoice else [],
        duplicate_of_line_id=original_id,
        score=fired,
        rationale="Identical UTR, amount, date and reference to an earlier FIRA line.",
    )


# ---- branch: reference present but invoice missing ---------------------------
def _unmatched(line: LineInput, ctx: _Context) -> MatchDecision:
    bp, fired = _score(ctx.cfg["weights_bp"], reference_present=True)
    return MatchDecision(
        line_id=line.id,
        match_type=UNMATCHED,
        status=EXCEPTION,
        confidence_bp=bp,
        confidence_band=band_for(
            bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"]
        ),
        score=fired,
        rationale="Reference points to an invoice that does not exist in the ledger.",
    )


# ---- branch: no reference (never auto-matched) -------------------------------
def _identity_matches(invoice: InvoiceInput, line: LineInput, ctx: _Context) -> bool:
    """Conservative identity: same normalised client/remitter name, currency and amount."""
    if invoice.currency != line.currency or line.gross_amount is None:
        return False
    if invoice.amount != line.gross_amount:
        return False
    suffixes = ctx.cfg["remitter_legal_suffixes"]
    return normalize_name(invoice.client_name, suffixes) == normalize_name(
        line.remitter_name, suffixes
    )


def _reference_less(line: LineInput, ctx: _Context) -> MatchDecision:
    candidates = [inv for inv in ctx.invoices if _identity_matches(inv, line, ctx)]
    numbers = sorted(inv.number for inv in candidates)
    bp, fired = _score(
        ctx.cfg["weights_bp"],
        amount_match=any(inv.amount == line.gross_amount for inv in candidates),
        currency_match=any(inv.currency == line.currency for inv in candidates),
        remitter_match=bool(candidates),
    )
    band = band_for(bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"])
    if candidates:
        return MatchDecision(
            line_id=line.id,
            match_type=AMBIGUOUS,
            status=NEEDS_REVIEW,
            confidence_bp=bp,
            confidence_band=band,
            candidates=numbers,
            score=fired,
            rationale=(
                "No invoice reference; identity signals are not sufficient to link "
                f"{len(numbers)} candidate invoice(s). A human must choose."
            ),
        )
    return MatchDecision(
        line_id=line.id,
        match_type=MISSING_REFERENCE,
        status=NEEDS_REVIEW,
        confidence_bp=bp,
        confidence_band=band,
        score=fired,
        rationale="No invoice reference on the FIRA line; a human must link it.",
    )


# ---- branch: split -----------------------------------------------------------
def _payment_candidates(
    invoice: InvoiceInput, line: LineInput, ctx: _Context
) -> list[PaymentInput]:
    tolerance = ctx.cfg["amount_tolerance"]
    out: list[PaymentInput] = []
    for payment in ctx.payments_by_invoice.get(invoice.id, []):
        if payment.currency != line.currency:
            continue
        if payment.gross is None or line.gross_amount is None:
            continue
        if abs(payment.gross - line.gross_amount) <= tolerance:
            out.append(payment)
    return out


def _attach_payment(
    invoice: InvoiceInput, line: LineInput, ctx: _Context, *, high_confidence: bool
) -> int | None:
    """Attach a payment only when confident and the candidate is unique."""
    if not high_confidence:
        return None
    candidates = _payment_candidates(invoice, line, ctx)
    return candidates[0].id if len(candidates) == 1 else None


def _split(line: LineInput, invoice: InvoiceInput, ctx: _Context) -> MatchDecision:
    group, part, parts_total = ctx.splits[line.id]
    bp, fired = _score(
        ctx.cfg["weights_bp"],
        reference_present=True,
        reference_resolved=True,
        amount_match=True,  # the parts sum to the invoice amount
        currency_match=invoice.currency == line.currency,
        remitter_match=normalize_name(
            invoice.client_name, ctx.cfg["remitter_legal_suffixes"]
        )
        == normalize_name(line.remitter_name, ctx.cfg["remitter_legal_suffixes"]),
        date_within_window=_within_window(
            line.value_date, invoice, ctx.cfg["date_window_days"]
        ),
    )
    high = (
        band_for(bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"]) == HIGH
    )
    payment_id = _attach_payment(invoice, line, ctx, high_confidence=high)
    fx = _fx_variance(line, invoice, payment_id, ctx)
    return MatchDecision(
        line_id=line.id,
        match_type=SPLIT,
        status=MATCHED,
        confidence_bp=bp,
        confidence_band=band_for(
            bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"]
        ),
        candidates=[invoice.number],
        invoice_id=invoice.id,
        invoice_number=invoice.number,
        payment_id=payment_id,
        split_group=group,
        split_part=part,
        split_parts_total=parts_total,
        fx_expected_rate=fx["expected_rate"] if fx else None,
        fx_actual_rate=fx["actual_rate"] if fx else None,
        fx_variance_bp=fx["variance_bp"] if fx else None,
        score=fired,
        rationale=f"Part payment {part} of {parts_total} for a single invoice.",
    )


# ---- branch: reference resolved, single line ---------------------------------
def _referenced(line: LineInput, invoice: InvoiceInput, ctx: _Context) -> MatchDecision:
    amount_match = (
        line.gross_amount is not None
        and abs(line.gross_amount - invoice.amount) <= ctx.cfg["amount_tolerance"]
    )
    bp, fired = _score(
        ctx.cfg["weights_bp"],
        reference_present=True,
        reference_resolved=True,
        amount_match=amount_match,
        currency_match=invoice.currency == line.currency,
        remitter_match=normalize_name(
            invoice.client_name, ctx.cfg["remitter_legal_suffixes"]
        )
        == normalize_name(line.remitter_name, ctx.cfg["remitter_legal_suffixes"]),
        date_within_window=_within_window(
            line.value_date, invoice, ctx.cfg["date_window_days"]
        ),
    )
    band = band_for(bp, high_bp=ctx.cfg["high_bp"], medium_bp=ctx.cfg["medium_bp"])

    if not amount_match:
        return MatchDecision(
            line_id=line.id,
            match_type=AMOUNT_MISMATCH,
            status=NEEDS_REVIEW,
            confidence_bp=bp,
            confidence_band=band,
            candidates=[invoice.number],
            invoice_id=invoice.id,
            invoice_number=invoice.number,
            score=fired,
            rationale="Reference resolves, but the FIRA gross differs from the invoice amount.",
        )

    payment_id = _attach_payment(invoice, line, ctx, high_confidence=band == HIGH)
    fx = _fx_variance(line, invoice, payment_id, ctx)
    if fx and fx["exceeds"]:
        return MatchDecision(
            line_id=line.id,
            match_type=FX_VARIANCE,
            status=MATCHED_WITH_VARIANCE,
            confidence_bp=bp,
            confidence_band=band,
            candidates=[invoice.number],
            invoice_id=invoice.id,
            invoice_number=invoice.number,
            payment_id=payment_id,
            fx_expected_rate=fx["expected_rate"],
            fx_actual_rate=fx["actual_rate"],
            fx_variance_bp=fx["variance_bp"],
            score=fired,
            rationale=(
                "Reference and gross agree, but the realised INR conversion differs "
                "from the simulated mid-market rate beyond the configured tolerance."
            ),
        )
    return MatchDecision(
        line_id=line.id,
        match_type=EXACT,
        status=MATCHED,
        confidence_bp=bp,
        confidence_band=band,
        candidates=[invoice.number],
        invoice_id=invoice.id,
        invoice_number=invoice.number,
        payment_id=payment_id,
        fx_expected_rate=fx["expected_rate"] if fx else None,
        fx_actual_rate=fx["actual_rate"] if fx else None,
        fx_variance_bp=fx["variance_bp"] if fx else None,
        score=fired,
        rationale="Reference and gross amount agree.",
    )


# ---- FX variance -------------------------------------------------------------
def _fx_variance(
    line: LineInput, invoice: InvoiceInput, payment_id: int | None, ctx: _Context
) -> dict | None:
    """Compare realised INR against payment net x simulated mid-rate.

    Returns ``None`` when the check cannot be performed (no unique payment, no
    known rate, or no net amount). Never raises.
    """
    if payment_id is None:
        return None
    rate = ctx.rates.get((line.currency or "").upper())
    if rate is None or rate == 0:
        return None
    payment = next(
        (p for p in ctx.payments_by_invoice.get(invoice.id, []) if p.id == payment_id),
        None,
    )
    if payment is None or payment.net in (None, 0) or line.net_amount_inr is None:
        return None
    actual_rate = line.net_amount_inr / payment.net
    variance_percent = _quantize((actual_rate - rate) / rate * Decimal(100))
    variance_bp = int(
        (variance_percent * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP)
    )
    tolerance = ctx.cfg["fx_variance_tolerance_percent"]
    return {
        "expected_rate": rate,
        "actual_rate": _quantize(actual_rate),
        "variance_bp": variance_bp,
        "exceeds": abs(variance_percent) > tolerance,
    }


def _within_window(
    value_date: date | None, invoice: InvoiceInput, window_days: int
) -> bool:
    if value_date is None:
        return False
    start = invoice.issue_date - timedelta(days=window_days)
    end = invoice.due_date + timedelta(days=window_days)
    return start <= value_date <= end
