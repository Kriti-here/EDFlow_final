"""B10: FIRA verification tests -- typed values, deterministic checks, confidence."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from app.services.fira_extract import (
    ExtractedDocument,
    ExtractedLine,
    extract_path,
)
from app.services.fira_verify import verify_document, verify_line

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"
FIXTURES = sorted(FIXTURE_DIR.glob("fira_*.pdf"))


def _valid_line(**overrides) -> ExtractedLine:
    base = {
        "line_no": 1,
        "utr": "SYN-UTR-99-001",
        "value_date": "2026-11-02",
        "remitter_name": "Example Software Buyer Inc",
        "remitter_country": "US",
        "currency": "USD",
        "gross_amount": "2500.00",
        "bank_charges": "72.50",
        "net_amount_inr": "203910.00",
        "purpose_code": "P0802",
        "invoice_reference": "INV-2026-1001",
        "raw_text": "row",
    }
    base.update(overrides)
    return ExtractedLine(**base)


@pytest.mark.parametrize("pdf", FIXTURES, ids=lambda p: p.stem)
def test_clean_fixtures_verify_cleanly(pdf):
    doc = verify_document(extract_path(str(pdf)))
    assert doc.verification_status == "verified"
    assert doc.confidence_bp == 10000
    assert doc.issues == []
    assert all(line.verification_status == "verified" for line in doc.lines)


def test_money_is_parsed_as_decimal():
    doc = verify_document(extract_path(str(FIXTURE_DIR / "fira_01_clean.pdf")))
    first = doc.lines[0]
    assert isinstance(first.gross_amount, Decimal)
    assert first.gross_amount == Decimal("2500.00")
    assert first.net_amount_inr == Decimal("203910.00")
    assert isinstance(first.value_date, date)


def test_purpose_code_uses_rules_engine():
    valid = verify_line(_valid_line(purpose_code="P0802"))
    assert valid.purpose_code_valid is True
    unknown = verify_line(_valid_line(purpose_code="P9999"))
    assert unknown.purpose_code_valid is False
    assert any("Unknown purpose code" in issue for issue in unknown.issues)


def test_unknown_purpose_code_needs_review_not_failed():
    line = verify_line(_valid_line(purpose_code="P9999"))
    assert line.verification_status == "needs_review"
    assert line.confidence_bp == 8571  # purpose weight (2) lost out of 14


def test_invalid_currency_fails_line():
    line = verify_line(_valid_line(currency="XYZ"))
    assert line.verification_status == "failed"
    assert any("not allowed" in issue for issue in line.issues)


def test_malformed_money_fails_line():
    line = verify_line(_valid_line(gross_amount="not-a-number"))
    assert line.verification_status == "failed"
    assert line.gross_amount is None


def test_bad_date_fails_line():
    line = verify_line(_valid_line(value_date="02/11/2026"))
    assert line.verification_status == "failed"
    assert line.value_date is None


def test_missing_reference_does_not_break_verification():
    line = verify_line(_valid_line(invoice_reference=None))
    assert line.verification_status == "verified"
    assert line.invoice_reference is None


def test_amounts_with_more_than_two_decimals_are_rejected():
    line = verify_line(_valid_line(gross_amount="2500.123"))
    assert line.gross_amount is None
    assert line.verification_status == "failed"


def test_document_without_header_needs_review():
    extracted = ExtractedDocument(
        fira_reference=None,
        bank_name=None,
        is_synthetic=True,
        page_count=1,
        lines=[_valid_line()],
    )
    doc = verify_document(extracted)
    assert doc.verification_status == "needs_review"
    assert any("FIRA reference is missing" in issue for issue in doc.issues)


def test_document_without_lines_fails():
    extracted = ExtractedDocument(
        fira_reference="SYN-FIRA-X",
        bank_name="Some Bank",
        page_count=1,
        lines=[],
    )
    doc = verify_document(extracted)
    assert doc.verification_status == "failed"
    assert doc.confidence_bp == 0


def test_confidence_threshold_gates_verified_status():
    extracted = extract_path(str(FIXTURE_DIR / "fira_01_clean.pdf"))
    high = verify_document(extracted, threshold_bp=10001)
    assert high.confidence_bp == 10000
    assert high.verification_status == "needs_review"
