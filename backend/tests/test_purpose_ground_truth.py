"""B12 purpose adviser ground-truth tests: validate advice against the oracle.

The oracle is ``expected_purpose.by_invoice`` in fixtures/synthetic/index.json (and
``expected_purpose_code`` on each demo invoice). Top-1 accuracy must be 100%.
"""

from __future__ import annotations

import json

from .purpose_helpers import (
    expected_purpose,
    invoice_by_number,
    seed,
    top_by_invoice,
    load_index,
)


def _metrics(db, index):
    """(correct, total, mismatches) for the top-1 advice vs the oracle."""
    oracle = expected_purpose(index)
    by_number = invoice_by_number(db)
    tops = top_by_invoice(db)
    correct = 0
    mismatches: list[tuple[str, str, str]] = []
    for number, code in oracle.items():
        invoice = by_number[number]
        top = tops[invoice.id]
        if top.code == code:
            correct += 1
        else:
            mismatches.append((number, code, top.code))
    return correct, len(oracle), mismatches


def test_top1_accuracy_is_100_percent(db_session):
    index, _, _ = seed(db_session)
    correct, total, mismatches = _metrics(db_session, index)
    assert not mismatches, f"top-1 mismatches: {mismatches}"
    assert correct == total == 10


def test_every_invoice_gets_its_expected_code(db_session):
    index, _, _ = seed(db_session)
    oracle = expected_purpose(index)
    by_number = invoice_by_number(db_session)
    tops = top_by_invoice(db_session)
    for number, code in oracle.items():
        assert tops[by_number[number].id].code == code, number


def test_rows_carry_engine_version_and_synthetic_flag(db_session):
    seed(db_session)
    for row in top_by_invoice(db_session).values():
        assert row.engine_version == "b12.1"
        assert row.is_synthetic is True


def test_metrics_helper_matches_oracle_count(db_session):
    index, _, _ = seed(db_session)
    assert len(expected_purpose(index)) == 10


def test_echoed_invoices_reach_high_band(db_session):
    """Invoices whose matched FIRA line already carries the code are high confidence."""
    index, _, _ = seed(db_session)
    by_number = invoice_by_number(db_session)
    tops = top_by_invoice(db_session)
    for number in ("INV-2026-1001", "INV-2026-1004"):
        row = tops[by_number[number].id]
        assert "fira_echo" in json.loads(row.score_json)
        assert row.confidence_band == "high"


def test_invoice_absent_from_fira_is_medium(db_session):
    """INV-2026-1008 has no FIRA echo, so its primary-keyword advice is only medium."""
    index, _, _ = seed(db_session)
    by_number = invoice_by_number(db_session)
    row = top_by_invoice(db_session)[by_number["INV-2026-1008"].id]
    assert "fira_echo" not in json.loads(row.score_json)
    assert row.confidence_band == "medium"
    assert row.code == "P1008"


def test_index_exposes_purpose_oracle():
    index = load_index()
    assert index["expected_purpose"]["engine_version"] == "b12.1"
    assert index["expected_purpose"]["by_invoice"]["INV-2026-1001"] == "P0802"
