"""B13 tests: validate the exception engine against the synthetic-fixture oracle.

The oracle is the ``expected_exceptions`` block: line-level entries in each
``fixtures/synthetic/*.ground_truth.json`` (keyed by ``line_no``) plus the
ledger-level entries in ``fixtures/synthetic/index.json`` (keyed by invoice number
or PayPal capture id). Deriving over the B9 corpus must reproduce it exactly --
that is the B13 definition of "100% fixture accuracy".
"""

from __future__ import annotations

from sqlalchemy import select

from app.models import ExceptionRecord

from .exception_helpers import (
    capture_ids,
    ground_truths,
    invoice_numbers,
    line_key_map,
    seed,
)


def _oracle(index) -> set[tuple[str, str, str, str]]:
    """Flatten the ground-truth oracle into (category, scope, ref, severity) keys."""
    expected: set[tuple[str, str, str, str]] = set()
    for fixture_id, gt in ground_truths(index).items():
        for entry in gt["expected_exceptions"]:
            expected.add(
                (
                    entry["category"],
                    "line",
                    f"{fixture_id}#{entry['line_no']}",
                    entry["severity"],
                )
            )
    ledger = index["expected_exceptions"]["ledger_level"]
    for entry in ledger["missing_fira"]:
        expected.add(
            ("missing_fira", "invoice", entry["invoice_number"], entry["severity"])
        )
    for entry in ledger["missing_payment"]:
        expected.add(
            ("missing_payment", "invoice", entry["invoice_number"], entry["severity"])
        )
    for entry in ledger["orphan_payment"]:
        expected.add(
            ("orphan_payment", "payment", entry["paypal_capture_id"], entry["severity"])
        )
    return expected


def _derived(db, index) -> set[tuple[str, str, str, str]]:
    """Flatten the stored exceptions into the same key space as the oracle."""
    key_of_line, _ = line_key_map(db, index)
    numbers = invoice_numbers(db)
    captures = capture_ids(db)
    found: set[tuple[str, str, str, str]] = set()
    for exc in db.scalars(select(ExceptionRecord)):
        if exc.fira_line_id in key_of_line:
            fixture, line_no = key_of_line[exc.fira_line_id]
            ref = f"{fixture}#{line_no}"
            found.add((exc.category, "line", ref, exc.severity))
        elif exc.invoice_id is not None:
            found.add((exc.category, "invoice", numbers[exc.invoice_id], exc.severity))
        elif exc.payment_id is not None:
            found.add((exc.category, "payment", captures[exc.payment_id], exc.severity))
    return found


def test_oracle_total_is_ten(db_session):
    index, _documents, summary = seed(db_session)
    assert summary["total"] == 10
    assert len(_oracle(index)) == 10


def test_derived_exceptions_match_the_oracle_exactly(db_session):
    index, _documents, _summary = seed(db_session)
    expected = _oracle(index)
    found = _derived(db_session, index)

    missing = expected - found
    extra = found - expected
    assert not missing, f"oracle entries not derived: {sorted(missing)}"
    assert not extra, f"unexpected exceptions derived: {sorted(extra)}"


def test_accuracy_metric_is_one_hundred_percent(db_session):
    index, _documents, _summary = seed(db_session)
    expected = _oracle(index)
    found = _derived(db_session, index)
    correct = len(expected & found)
    assert len(expected) == 10
    assert correct / len(expected) == 1.0


def test_every_exception_carries_engine_version_and_synthetic_flag(db_session):
    seed(db_session)
    rows = db_session.scalars(select(ExceptionRecord)).all()
    assert len(rows) == 10
    assert all(row.engine_version == "b13.1" for row in rows)
    assert all(row.is_synthetic is True for row in rows)


# ---- scenario specifics ------------------------------------------------------


def test_line_level_categories_and_severities(db_session):
    index, _documents, _summary = seed(db_session)
    key_of_line, line_ids = line_key_map(db_session, index)

    def find(fixture_id: str, line_no: int) -> ExceptionRecord:
        line_id = line_ids[(fixture_id, line_no)]
        row = (
            db_session.query(ExceptionRecord)
            .filter(ExceptionRecord.fira_line_id == line_id)
            .one()
        )
        return row

    assert find("fira_02_fx_variance", 1).category == "fx_variance"
    assert find("fira_02_fx_variance", 1).severity == "low"
    assert find("fira_03_split_duplicate", 4).category == "duplicate"
    assert find("fira_04_missing_unmatched", 1).category == "missing_reference"
    assert find("fira_04_missing_unmatched", 2).category == "unmatched"
    assert find("fira_04_missing_unmatched", 2).severity == "high"
    assert find("fira_05_ambiguous", 1).category == "ambiguous"

    # clean and split lines never raise an exception
    for fixture_id, line_no in [
        ("fira_01_clean", 1),
        ("fira_01_clean", 2),
        ("fira_01_clean", 3),
        ("fira_03_split_duplicate", 1),
        ("fira_03_split_duplicate", 2),
        ("fira_03_split_duplicate", 3),
    ]:
        line_id = line_ids[(fixture_id, line_no)]
        assert (
            db_session.query(ExceptionRecord)
            .filter(ExceptionRecord.fira_line_id == line_id)
            .count()
            == 0
        )
    assert key_of_line  # sanity: the line map is populated


def test_missing_fira_is_the_unreported_paid_invoice(db_session):
    seed(db_session)
    rows = (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.category == "missing_fira")
        .all()
    )
    assert len(rows) == 1
    assert invoice_numbers(db_session)[rows[0].invoice_id] == "INV-2026-1008"


def test_orphan_payments_are_the_unlinked_captures(db_session):
    seed(db_session)
    rows = (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.category == "orphan_payment")
        .all()
    )
    captures = capture_ids(db_session)
    assert sorted(captures[row.payment_id] for row in rows) == [
        "SYNCAP000010",
        "SYNCAP000011",
        "SYNCAP000012",
    ]


def test_missing_payment_absent_in_this_corpus(db_session):
    seed(db_session)
    assert (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.category == "missing_payment")
        .count()
        == 0
    )
