"""B13 tests: the pure exception derivation engine (no database).

Exercises the match-type -> category classification, YAML-gated enablement, the
severity model, dedupe-key stability and the three ledger-gap categories
(missing_fira, missing_payment, orphan_payment).
"""

from __future__ import annotations

import pytest

from app.rules import engine as rules_engine
from app.services import exception_engine as ee


@pytest.fixture()
def config() -> dict:
    return rules_engine.exception_config()


def _match(**overrides) -> ee.MatchRef:
    base = dict(
        id=1,
        fira_line_id=1,
        match_type="exact",
        status="matched",
        confidence_bp=9000,
        invoice_id=None,
        payment_id=None,
    )
    base.update(overrides)
    return ee.MatchRef(**base)


def _line(line_id: int = 1, document_id: int = 1, line_no: int = 1) -> ee.LineRef:
    return ee.LineRef(
        id=line_id, document_id=document_id, line_no=line_no, is_synthetic=True
    )


def _derive(matches, lines, invoices=(), payments=(), config=None):
    return ee.derive_exceptions(
        matches,
        lines,
        list(invoices),
        list(payments),
        config=config or rules_engine.exception_config(),
    )


# ---- classification (line-level) --------------------------------------------


@pytest.mark.parametrize("category", ee.LINE_CATEGORIES)
def test_line_match_type_maps_to_its_category(category, config):
    matches = [_match(match_type=category, status="needs_review")]
    result = _derive(matches, {1: _line()})
    assert len(result) == 1
    assert result[0].category == category
    assert result[0].source == ee.SOURCE_MATCH
    assert result[0].fira_line_id == 1


@pytest.mark.parametrize("match_type", ["exact", "split", "amount_mismatch"])
def test_non_exception_match_types_raise_nothing(match_type, config):
    assert _derive([_match(match_type=match_type)], {1: _line()}) == []


def test_duplicate_and_fx_variance_are_enabled_by_default(config):
    assert config["categories"]["duplicate"]["enabled"] is True
    assert config["categories"]["fx_variance"]["enabled"] is True


def test_fx_variance_defaults_to_low_severity(config):
    result = _derive([_match(match_type="fx_variance")], {1: _line()})
    assert result[0].severity == "low"


def test_disabled_category_is_not_derived(config):
    config["categories"]["duplicate"]["enabled"] = False
    result = _derive([_match(match_type="duplicate")], {1: _line()}, config=config)
    assert result == []


def test_engine_version_comes_from_yaml(config):
    assert config["engine_version"] == "b13.1"


# ---- dedupe keys -------------------------------------------------------------


def test_dedupe_key_is_stable_and_scoped():
    assert ee.dedupe_key("unmatched", line_id=7) == "unmatched:line:7"
    assert ee.dedupe_key("missing_fira", invoice_id=3) == "missing_fira:invoice:3"
    assert ee.dedupe_key("orphan_payment", payment_id=9) == "orphan_payment:payment:9"
    assert ee.dedupe_key("unmatched", line_id=7) == ee.dedupe_key(
        "unmatched", line_id=7
    )


# ---- ledger gaps -------------------------------------------------------------


def test_missing_fira_when_invoice_paid_but_absent(config):
    invoices = [ee.InvoiceRef(id=5, number="INV-5")]
    payments = [
        ee.PaymentRef(id=50, invoice_id=5, capture_id="CAP-50", is_synthetic=True)
    ]
    result = _derive([], {}, invoices, payments, config=config)
    assert [e.category for e in result] == ["missing_fira"]
    assert result[0].invoice_id == 5
    assert result[0].severity == "high"


def test_no_missing_fira_when_invoice_is_matched(config):
    invoices = [ee.InvoiceRef(id=5, number="INV-5")]
    payments = [
        ee.PaymentRef(id=50, invoice_id=5, capture_id="CAP-50", is_synthetic=True)
    ]
    matches = [_match(match_type="exact", invoice_id=5)]
    assert _derive(matches, {1: _line()}, invoices, payments, config=config) == []


def test_missing_payment_when_matched_invoice_has_no_payment(config):
    invoices = [ee.InvoiceRef(id=5, number="INV-5")]
    matches = [_match(match_type="exact", invoice_id=5)]
    result = _derive(matches, {1: _line()}, invoices, [], config=config)
    assert [e.category for e in result] == ["missing_payment"]
    assert result[0].invoice_id == 5


def test_orphan_payment_when_payment_has_no_invoice(config):
    payments = [
        ee.PaymentRef(id=1, invoice_id=None, capture_id="CAP-A", is_synthetic=True),
        ee.PaymentRef(id=2, invoice_id=5, capture_id="CAP-B", is_synthetic=True),
    ]
    result = _derive([], {}, [], payments, config=config)
    assert [e.category for e in result] == ["orphan_payment"]
    assert result[0].payment_id == 1
    assert result[0].details["paypal_capture_id"] == "CAP-A"


def test_ledger_categories_can_be_disabled(config):
    config["categories"]["orphan_payment"]["enabled"] = False
    payments = [
        ee.PaymentRef(id=1, invoice_id=None, capture_id="CAP-A", is_synthetic=True)
    ]
    assert _derive([], {}, [], payments, config=config) == []


def test_output_is_sorted_by_dedupe_key_for_determinism(config):
    matches = [
        _match(id=1, fira_line_id=2, match_type="duplicate"),
        _match(id=2, fira_line_id=1, match_type="unmatched"),
    ]
    lines = {1: _line(1), 2: _line(2, line_no=2)}
    result = _derive(matches, lines, config=config)
    keys = [e.dedupe_key for e in result]
    assert keys == sorted(keys)
