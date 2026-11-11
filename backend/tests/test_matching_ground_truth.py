"""B11 tests: validate the engine against the B9 ground-truth oracle.

Every expectation in ``fixtures/synthetic/*.ground_truth.json`` ->
``expected_matching`` must be reproduced exactly by the stored ``MatchRecord``
set after a single global run. This is the B11 definition of "100% fixture
accuracy".
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import FiraDocument, FiraLine, Invoice, MatchRecord
from app.services import match_service

from .matching_helpers import (
    build_ledger,
    ground_truths,
    ingest_fixtures,
    load_index,
    load_json,
)


def _maps(db, index):
    """Return (records, line_ids, invoice_numbers) keyed for assertions."""
    file_to_fixture = {f["file"]: f["id"] for f in index["fixtures"]}
    doc_file = {d.id: d.file_name for d in db.scalars(select(FiraDocument))}
    key_of_line: dict[int, tuple[str, int]] = {}
    line_ids: dict[tuple[str, int], int] = {}
    for line in db.scalars(select(FiraLine)):
        key = (file_to_fixture[doc_file[line.document_id]], line.line_no)
        key_of_line[line.id] = key
        line_ids[key] = line.id
    records = {
        key_of_line[rec.fira_line_id]: rec for rec in db.scalars(select(MatchRecord))
    }
    invoice_numbers = {inv.id: inv.number for inv in db.scalars(select(Invoice))}
    return records, line_ids, invoice_numbers


def _decision_matches(rec, exp, line_ids, invoice_numbers, fixture_id) -> bool:
    """True when a stored record reproduces one ground-truth expectation."""
    if rec.match_type != exp["match_type"]:
        return False
    if rec.status != exp["expected_status"]:
        return False
    if rec.confidence_band != exp["confidence"]:
        return False
    candidates = json.loads(rec.candidates_json)
    if sorted(candidates) != sorted(exp["candidates"]):
        return False
    exp_inv = exp.get("invoice_number")
    if exp_inv is None:
        if rec.invoice_id is not None:
            return False
    elif invoice_numbers.get(rec.invoice_id) != exp_inv and exp_inv not in candidates:
        # duplicates keep invoice_id NULL by design; the candidate list names the invoice
        return False
    if "duplicate_of" in exp and rec.duplicate_of_line_id != line_ids.get(
        (fixture_id, exp["duplicate_of"])
    ):
        return False
    if exp.get("split_group") is not None and rec.split_group != exp["split_group"]:
        return False
    if exp.get("part") is not None and rec.split_part != exp["part"]:
        return False
    return not (
        exp.get("parts_total") is not None
        and rec.split_parts_total != exp["parts_total"]
    )


@pytest.fixture()
def matched(db_session):
    index = load_index()
    build_ledger(
        db_session,
        load_json(index["demo_files"]["invoices"])["invoices"],
        load_json(index["demo_files"]["payments"])["payments"],
    )
    ingest_fixtures(db_session, index)
    summary = match_service.run_matching(db_session)
    records, line_ids, invoice_numbers = _maps(db_session, index)
    return {
        "index": index,
        "summary": summary,
        "records": records,
        "line_ids": line_ids,
        "invoice_numbers": invoice_numbers,
        "db": db_session,
    }


# ---- accuracy ----------------------------------------------------------------


def test_every_expected_matching_entry_is_reproduced(matched):
    truths = ground_truths(matched["index"])
    failures: list[str] = []
    checked = 0
    for fixture_id, gt in truths.items():
        for exp in gt["expected_matching"]:
            checked += 1
            rec = matched["records"].get((fixture_id, exp["line_no"]))
            if rec is None or not _decision_matches(
                rec, exp, matched["line_ids"], matched["invoice_numbers"], fixture_id
            ):
                failures.append(f"{fixture_id}:line {exp['line_no']}")
    assert checked == 12
    assert not failures, f"mismatched ground-truth lines: {failures}"


def test_accuracy_metric_is_one_hundred_percent(matched):
    truths = ground_truths(matched["index"])
    total = correct = 0
    for fixture_id, gt in truths.items():
        for exp in gt["expected_matching"]:
            total += 1
            rec = matched["records"][(fixture_id, exp["line_no"])]
            if _decision_matches(
                rec, exp, matched["line_ids"], matched["invoice_numbers"], fixture_id
            ):
                correct += 1
    assert total == 12
    assert correct / total == 1.0


def test_one_record_per_line_with_engine_version_and_synthetic_flag(matched):
    records = matched["records"]
    assert len(records) == 12
    assert all(rec.engine_version == "b11.1" for rec in records.values())
    assert all(rec.is_synthetic is True for rec in records.values())


def test_run_covers_every_document_globally(matched):
    db = matched["db"]
    documents = db.scalars(select(FiraDocument)).all()
    matched_documents = {
        db.get(FiraLine, rec.fira_line_id).document_id
        for rec in db.scalars(select(MatchRecord))
    }
    assert matched_documents == {doc.id for doc in documents}
    assert len(documents) == 5


# ---- scenario specifics ------------------------------------------------------


def test_clean_fixture_lines_are_exact_high(matched):
    records = matched["records"]
    for line_no in (1, 2, 3):
        rec = records[("fira_01_clean", line_no)]
        assert rec.match_type == "exact"
        assert rec.status == "matched"
        assert rec.confidence_band == "high"


def test_split_lines_carry_group_and_parts(matched):
    records = matched["records"]
    first = records[("fira_03_split_duplicate", 1)]
    second = records[("fira_03_split_duplicate", 2)]
    assert first.match_type == "split"
    assert first.split_group == "INV-2026-1007"
    assert (first.split_part, first.split_parts_total) == (1, 2)
    assert (second.split_part, second.split_parts_total) == (2, 2)


def test_duplicate_line_points_to_original(matched):
    records = matched["records"]
    original = records[("fira_03_split_duplicate", 3)]
    duplicate = records[("fira_03_split_duplicate", 4)]
    assert original.match_type == "exact"
    assert duplicate.match_type == "duplicate"
    assert duplicate.status == "duplicate"
    assert duplicate.duplicate_of_line_id == original.fira_line_id


def test_fx_variance_fixture_records_simulated_rates(matched):
    records = matched["records"]
    eur = records[("fira_02_fx_variance", 1)]
    assert eur.match_type == "fx_variance"
    assert eur.status == "matched_with_variance"
    assert eur.fx_expected_rate == Decimal("91.00")
    assert eur.fx_actual_rate == Decimal("88.50")
    assert eur.fx_variance_bp == -275

    sgd = records[("fira_02_fx_variance", 2)]
    assert sgd.fx_expected_rate == Decimal("62.00")
    assert sgd.fx_variance_bp == -177


def test_missing_reference_and_unmatched_fixture(matched):
    records = matched["records"]
    missing = records[("fira_04_missing_unmatched", 1)]
    assert missing.match_type == "missing_reference"
    assert missing.status == "needs_review"
    assert missing.invoice_id is None

    unmatched = records[("fira_04_missing_unmatched", 2)]
    assert unmatched.match_type == "unmatched"
    assert unmatched.status == "exception"
    assert unmatched.invoice_id is None


def test_ambiguous_fixture_keeps_candidates_unresolved(matched):
    rec = matched["records"][("fira_05_ambiguous", 1)]
    assert rec.match_type == "ambiguous"
    assert rec.status == "needs_review"
    assert rec.confidence_band == "low"
    assert rec.invoice_id is None
    assert rec.payment_id is None
    assert sorted(json.loads(rec.candidates_json)) == ["INV-2026-1009", "INV-2026-1010"]
