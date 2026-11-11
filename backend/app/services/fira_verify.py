"""Verification layer for FIRA extraction (B10).

Turns raw extracted strings into validated, typed values and produces a
deterministic confidence score. This is the "Verification" leg of the pipeline.

Design rules:

* money is parsed with ``Decimal`` only (never float);
* every check is deterministic and explainable -- no model, no heuristics that
  cannot be tested;
* the regulatory purpose-code lookup goes through the B7 rules engine
  (``app/rules/engine.py``) so no code is hardcoded (AGENTS.md rule 6);
* AI seam (future only): an AI extractor may one day propose values, but its
  output must land here and pass these same checks before being stored
  (AGENTS.md rule 2).

Confidence is stored as integer basis points (0-10000).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import BaseModel, ConfigDict

from ..rules import engine as rules_engine
from ..rules.loader import RulesConfigError
from .fira_extract import ExtractedDocument, ExtractedLine
from .invoice_service import ALLOWED_CURRENCIES

FULL_CONFIDENCE_BP = 10000

# Per-field verification weights. Heavier fields (money, currency, date, purpose)
# drag confidence down harder when they fail.
_FIELD_WEIGHTS: dict[str, int] = {
    "utr": 1,
    "value_date": 2,
    "remitter_name": 1,
    "remitter_country": 1,
    "currency": 2,
    "gross_amount": 2,
    "bank_charges": 1,
    "net_amount_inr": 2,
    "purpose_code": 2,
}
_TOTAL_WEIGHT = sum(_FIELD_WEIGHTS.values())

# Longest amount the PDF should ever carry (guards against runaway parses).
_MAX_MONEY_DIGITS = 16


class VerifiedLine(BaseModel):
    """A single FIRA row after deterministic verification."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    line_no: int
    utr: str | None = None
    value_date: date | None = None
    remitter_name: str | None = None
    remitter_country: str | None = None
    currency: str | None = None
    gross_amount: Decimal | None = None
    bank_charges: Decimal | None = None
    net_amount_inr: Decimal | None = None
    purpose_code: str | None = None
    purpose_code_valid: bool | None = None
    invoice_reference: str | None = None
    confidence_bp: int = 0
    verification_status: str = "needs_review"
    issues: list[str] = []
    raw_text: str = ""


class VerifiedDocument(BaseModel):
    """A whole FIRA statement after deterministic verification."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    fira_reference: str | None = None
    bank_name: str | None = None
    ad_code: str | None = None
    statement_period_start: date | None = None
    statement_period_end: date | None = None
    generated_on: date | None = None
    is_synthetic: bool = False
    page_count: int = 0
    line_count: int = 0
    confidence_bp: int = 0
    verification_status: str = "needs_review"
    issues: list[str] = []
    lines: list[VerifiedLine] = []


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_money(value: str | None) -> Decimal | None:
    """Parse a money cell to ``Decimal``; ``None`` if absent or malformed."""
    if value is None:
        return None
    text = value.strip().replace(",", "")
    if not text:
        return None
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    if not amount.is_finite():
        return None
    if amount.as_tuple().exponent < -2:
        return None
    if len(amount.as_tuple().digits) > _MAX_MONEY_DIGITS:
        return None
    return amount


def _verify_purpose(code: str | None) -> tuple[bool | None, str | None]:
    """Return (valid, issue). ``valid`` is ``None`` when rules are unavailable."""
    if not code:
        return False, "Purpose code is missing"
    try:
        result = rules_engine.validate_purpose_code(code)
    except RulesConfigError:
        return None, "Rules configuration unavailable"
    return bool(result["valid"]), (
        None if result["valid"] else f"Unknown purpose code {code}"
    )


def verify_line(line: ExtractedLine) -> VerifiedLine:
    """Deterministically validate one extracted line and score it."""
    issues: list[str] = []
    critical: list[str] = []
    earned = 0

    utr = line.utr
    if utr:
        earned += _FIELD_WEIGHTS["utr"]
    else:
        issues.append("UTR is missing")

    value_date = _parse_date(line.value_date)
    if value_date is not None:
        earned += _FIELD_WEIGHTS["value_date"]
    else:
        issues.append("Value date is missing or malformed")
        critical.append("value_date")

    remitter_name = line.remitter_name
    if remitter_name:
        earned += _FIELD_WEIGHTS["remitter_name"]
    else:
        issues.append("Remitter name is missing")

    remitter_country = line.remitter_country
    if remitter_country:
        earned += _FIELD_WEIGHTS["remitter_country"]
    else:
        issues.append("Remitter country is missing")

    currency = line.currency.upper() if line.currency else None
    if currency and currency in ALLOWED_CURRENCIES:
        earned += _FIELD_WEIGHTS["currency"]
    else:
        issues.append(f"Currency {line.currency!r} is missing or not allowed")
        critical.append("currency")

    gross_amount = _parse_money(line.gross_amount)
    if gross_amount is not None:
        earned += _FIELD_WEIGHTS["gross_amount"]
    else:
        issues.append("Gross amount is missing or malformed")
        critical.append("gross_amount")

    bank_charges = _parse_money(line.bank_charges)
    if bank_charges is not None:
        earned += _FIELD_WEIGHTS["bank_charges"]
    else:
        issues.append("Bank charges are missing or malformed")

    net_amount_inr = _parse_money(line.net_amount_inr)
    if net_amount_inr is not None:
        earned += _FIELD_WEIGHTS["net_amount_inr"]
    else:
        issues.append("Net amount (INR) is missing or malformed")
        critical.append("net_amount_inr")

    purpose_code_valid, purpose_issue = _verify_purpose(line.purpose_code)
    if purpose_issue:
        issues.append(purpose_issue)
    if purpose_code_valid is not False:  # True, or None (rules unavailable)
        earned += _FIELD_WEIGHTS["purpose_code"]

    confidence_bp = round(FULL_CONFIDENCE_BP * earned / _TOTAL_WEIGHT)
    if not issues:
        status = "verified"
    elif critical:
        status = "failed"
    else:
        status = "needs_review"

    return VerifiedLine(
        line_no=line.line_no,
        utr=utr,
        value_date=value_date,
        remitter_name=remitter_name,
        remitter_country=remitter_country,
        currency=currency,
        gross_amount=gross_amount,
        bank_charges=bank_charges,
        net_amount_inr=net_amount_inr,
        purpose_code=line.purpose_code,
        purpose_code_valid=purpose_code_valid,
        invoice_reference=line.invoice_reference,
        confidence_bp=confidence_bp,
        verification_status=status,
        issues=issues,
        raw_text=line.raw_text,
    )


def _document_issues(
    extracted: ExtractedDocument, verified_lines: list[VerifiedLine]
) -> list[str]:
    issues = list(extracted.issues)
    if not extracted.fira_reference:
        issues.append("FIRA reference is missing")
    if not extracted.bank_name:
        issues.append("Bank name is missing")
    if not extracted.lines:
        issues.append("No remittance lines were extracted")
    if any(line.verification_status == "failed" for line in verified_lines):
        issues.append("One or more lines failed verification")
    return issues


def verify_document(
    extracted: ExtractedDocument,
    *,
    threshold_bp: int = 9000,
) -> VerifiedDocument:
    """Verify a whole extracted statement and assign a status + confidence."""
    verified_lines = [verify_line(line) for line in extracted.lines]

    if verified_lines:
        confidence_bp = sum(line.confidence_bp for line in verified_lines) // len(
            verified_lines
        )
    else:
        confidence_bp = 0

    issues = _document_issues(extracted, verified_lines)
    header_ok = bool(extracted.fira_reference and extracted.bank_name)
    all_verified = bool(verified_lines) and all(
        line.verification_status == "verified" for line in verified_lines
    )

    if not verified_lines:
        status = "failed"
    elif header_ok and all_verified and confidence_bp >= threshold_bp and not issues:
        status = "verified"
    else:
        status = "needs_review"

    return VerifiedDocument(
        fira_reference=extracted.fira_reference,
        bank_name=extracted.bank_name,
        ad_code=extracted.ad_code,
        statement_period_start=_parse_date(extracted.statement_period_start),
        statement_period_end=_parse_date(extracted.statement_period_end),
        generated_on=_parse_date(extracted.generated_on),
        is_synthetic=extracted.is_synthetic,
        page_count=extracted.page_count,
        line_count=len(verified_lines),
        confidence_bp=confidence_bp,
        verification_status=status,
        issues=issues,
        lines=verified_lines,
    )


def money_str(value: Decimal | None) -> str | None:
    """Render a ``Decimal`` amount as a plain string (never float) for output."""
    return None if value is None else str(value)


def line_to_dict(line: VerifiedLine) -> dict[str, Any]:
    """Serialise a verified line, with money and dates as JSON-safe strings."""
    return {
        "line_no": line.line_no,
        "utr": line.utr,
        "value_date": line.value_date.isoformat() if line.value_date else None,
        "remitter_name": line.remitter_name,
        "remitter_country": line.remitter_country,
        "currency": line.currency,
        "gross_amount": money_str(line.gross_amount),
        "bank_charges": money_str(line.bank_charges),
        "net_amount_inr": money_str(line.net_amount_inr),
        "purpose_code": line.purpose_code,
        "purpose_code_valid": line.purpose_code_valid,
        "invoice_reference": line.invoice_reference,
        "confidence_bp": line.confidence_bp,
        "verification_status": line.verification_status,
        "issues": line.issues,
    }
