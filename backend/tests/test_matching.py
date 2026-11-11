"""B11 tests: the deterministic matching engine (pure, no DB, no network).

These pin the decision table in ``app/services/matching.py``:
reference resolution, conservative identity for reference-less lines, the
payment-attachment rule (high confidence AND exactly one candidate), duplicate
detection, split parts and FX variance.
"""

from __future__ import annotations

import copy
from datetime import date
from decimal import Decimal

from app.rules.loader import load_rules
from app.services import matching
from app.services.matching import InvoiceInput, LineInput, PaymentInput


def _line(**kw) -> LineInput:
    base = {
        "id": 1,
        "document_id": 1,
        "line_no": 1,
        "invoice_reference": "INV-1",
        "currency": "USD",
        "gross_amount": Decimal("100.00"),
        "net_amount_inr": Decimal("8400.00"),
        "value_date": date(2026, 11, 2),
        "remitter_name": "Example Software Buyer Inc",
        "remitter_country": "US",
        "utr": "UTR-1",
    }
    base.update(kw)
    return LineInput(**base)


def _invoice(**kw) -> InvoiceInput:
    base = {
        "id": 10,
        "number": "INV-1",
        "currency": "USD",
        "amount": Decimal("100.00"),
        "client_name": "Example Software Buyer Inc",
        "issue_date": date(2026, 10, 20),
        "due_date": date(2026, 11, 10),
    }
    base.update(kw)
    return InvoiceInput(**base)


def _payment(**kw) -> PaymentInput:
    base = {
        "id": 100,
        "invoice_id": 10,
        "currency": "USD",
        "gross": Decimal("100.00"),
        "net": Decimal("100.00"),
    }
    base.update(kw)
    return PaymentInput(**base)


# ---- exact match -------------------------------------------------------------


def test_exact_match_scores_high_and_is_matched():
    d = matching.match_lines([_line()], [_invoice()], [_payment()])[0]
    assert d.match_type == matching.EXACT
    assert d.status == matching.MATCHED
    assert d.confidence_band == matching.HIGH
    assert d.confidence_bp == 10000
    assert d.invoice_id == 10
    assert d.invoice_number == "INV-1"
    assert d.candidates == ["INV-1"]


def test_fx_variance_within_tolerance_stays_exact():
    # actual rate 84.00 == simulated USD rate, so no variance.
    d = matching.match_lines([_line()], [_invoice()], [_payment()])[0]
    assert d.fx_variance_bp == 0
    assert d.match_type == matching.EXACT


# ---- reference-less lines are never auto-matched -----------------------------


def test_reference_less_with_identity_candidates_is_ambiguous():
    d = matching.match_lines(
        [_line(invoice_reference=None)], [_invoice()], [_payment()]
    )[0]
    assert d.match_type == matching.AMBIGUOUS
    assert d.status == matching.NEEDS_REVIEW
    assert d.confidence_band == matching.LOW
    assert d.candidates == ["INV-1"]
    assert d.invoice_id is None
    assert d.payment_id is None


def test_reference_less_without_identity_is_missing_reference():
    d = matching.match_lines(
        [_line(invoice_reference=None, gross_amount=Decimal("999.00"))],
        [_invoice()],
        [_payment()],
    )[0]
    assert d.match_type == matching.MISSING_REFERENCE
    assert d.status == matching.NEEDS_REVIEW
    assert d.confidence_band == matching.LOW
    assert d.candidates == []
    assert d.invoice_id is None
    assert d.payment_id is None


# ---- unmatched / amount mismatch --------------------------------------------


def test_reference_to_missing_invoice_is_unmatched_exception():
    d = matching.match_lines([_line(invoice_reference="INV-9999")], [_invoice()], [])[0]
    assert d.match_type == matching.UNMATCHED
    assert d.status == matching.EXCEPTION
    assert d.confidence_band == matching.HIGH
    assert d.invoice_id is None


def test_reference_resolved_but_amount_differs_needs_review():
    d = matching.match_lines([_line(gross_amount=Decimal("50.00"))], [_invoice()], [])[
        0
    ]
    assert d.match_type == matching.AMOUNT_MISMATCH
    assert d.status == matching.NEEDS_REVIEW
    assert d.invoice_id == 10


# ---- duplicate detection -----------------------------------------------------


def test_identical_lines_second_is_duplicate_of_first():
    lines = [_line(id=1, utr="SYN-UTR-X"), _line(id=2, line_no=2, utr="SYN-UTR-X")]
    decisions = matching.match_lines(lines, [_invoice()], [])
    assert decisions[0].match_type == matching.EXACT
    assert decisions[1].match_type == matching.DUPLICATE
    assert decisions[1].status == matching.DUPLICATE_STATUS
    assert decisions[1].duplicate_of_line_id == 1
    assert decisions[1].confidence_band == matching.HIGH


def test_duplicate_index_ignores_lines_without_utr():
    lines = [_line(id=1, utr=None), _line(id=2, line_no=2, utr=None)]
    assert matching.duplicate_index(lines) == {}


# ---- split payment -----------------------------------------------------------


def test_two_lines_summing_to_invoice_are_split():
    lines = [
        _line(id=1, gross_amount=Decimal("60.00"), utr="U1"),
        _line(id=2, line_no=2, gross_amount=Decimal("40.00"), utr="U2"),
    ]
    decisions = matching.match_lines(lines, [_invoice(amount=Decimal("100.00"))], [])
    assert decisions[0].match_type == matching.SPLIT
    assert decisions[0].status == matching.MATCHED
    assert decisions[0].split_group == "INV-1"
    assert decisions[0].split_part == 1
    assert decisions[0].split_parts_total == 2
    assert decisions[1].split_part == 2
    assert decisions[1].split_parts_total == 2


def test_partial_lines_not_summing_to_invoice_are_not_split():
    lines = [
        _line(id=1, gross_amount=Decimal("60.00"), utr="U1"),
        _line(id=2, line_no=2, gross_amount=Decimal("30.00"), utr="U2"),
    ]
    decisions = matching.match_lines(lines, [_invoice(amount=Decimal("100.00"))], [])
    # Each part is a standalone reference that mismatches the invoice amount.
    assert all(d.match_type == matching.AMOUNT_MISMATCH for d in decisions)


# ---- payment attachment rule -------------------------------------------------


def test_payment_attached_when_high_confidence_and_single_candidate():
    d = matching.match_lines([_line()], [_invoice()], [_payment(id=100)])[0]
    assert d.confidence_band == matching.HIGH
    assert d.payment_id == 100


def test_payment_null_when_two_candidates_exist():
    payments = [_payment(id=100), _payment(id=101)]
    d = matching.match_lines([_line()], [_invoice()], payments)[0]
    assert d.match_type == matching.EXACT
    assert d.payment_id is None


def test_payment_null_when_confidence_is_not_high():
    rules = copy.deepcopy(load_rules())
    rules["matching"]["confidence"]["high_bp"] = 10001
    d = matching.match_lines([_line()], [_invoice()], [_payment()], rules=rules)[0]
    assert d.confidence_band == matching.MEDIUM
    assert d.payment_id is None


# ---- FX variance -------------------------------------------------------------


def test_fx_variance_beyond_tolerance_is_flagged():
    # actual rate = 8000 / 100 = 80.00 vs simulated 84.00 -> about -4.76%.
    d = matching.match_lines(
        [_line(net_amount_inr=Decimal("8000.00"))], [_invoice()], [_payment()]
    )[0]
    assert d.match_type == matching.FX_VARIANCE
    assert d.status == matching.MATCHED_WITH_VARIANCE
    assert d.fx_expected_rate == Decimal("84.00")
    assert d.fx_variance_bp < 0


# ---- small helpers -----------------------------------------------------------


def test_normalize_name_drops_legal_suffixes_and_punctuation():
    assert (
        matching.normalize_name("Example Software Buyer Inc", ["inc"])
        == "example software buyer"
    )
    assert (
        matching.normalize_name("Placeholder Media, LLC.", ["llc"])
        == "placeholder media"
    )


def test_band_for_boundaries():
    assert matching.band_for(7000, high_bp=7000, medium_bp=4000) == matching.HIGH
    assert matching.band_for(6999, high_bp=7000, medium_bp=4000) == matching.MEDIUM
    assert matching.band_for(3999, high_bp=7000, medium_bp=4000) == matching.LOW
