"""B16 EDF ground-truth tests: validate the worksheet against the oracle.

The oracle is ``expected_edf`` in fixtures/synthetic/index.json. Section 2B field
mapping and the INR totals must be 100% accurate for the synthetic corpus.
"""

from __future__ import annotations

import json

from sqlalchemy import select

from app.models import EDFPackLine
from app.services import edf_service

from .edf_helpers import expected_edf, seed

LINE_FIELDS = (
    "sequence",
    "invoice_number",
    "client_name",
    "client_country",
    "currency",
    "amount",
    "net_realisable_value",
    "nrv_currency",
    "nrv_source",
    "sac_code",
)


def _snapshot(db_session):
    """Seed once and return (index, pack, snapshot_dict)."""
    index, pack = seed(db_session)
    return index, pack, json.loads(pack.snapshot_json)


def _line_metrics(actual: list[dict], oracle: list[dict]):
    """(correct, total, mismatches) across every Section 2B field."""
    correct = total = 0
    mismatches: list[tuple] = []
    for got, want in zip(actual, oracle):
        for field in LINE_FIELDS:
            total += 1
            if str(got.get(field)) == str(want.get(field)):
                correct += 1
            else:
                mismatches.append(
                    (want["invoice_number"], field, want.get(field), got.get(field))
                )
    return correct, total, mismatches


def _totals_metrics(actual: dict, oracle: dict):
    correct = total = 0
    mismatches: list[tuple] = []
    for section in ("by_currency", "nrv_by_currency"):
        for key, value in oracle[section].items():
            total += 1
            if actual[section].get(key) == value:
                correct += 1
            else:
                mismatches.append((section, key, value, actual[section].get(key)))
    total += 1
    if actual["total_inr"] == oracle["total_inr"]:
        correct += 1
    else:
        mismatches.append(("total_inr", "", oracle["total_inr"], actual["total_inr"]))
    return correct, total, mismatches


def test_section_2b_field_mapping_is_100_percent(db_session):
    index, _, snapshot = _snapshot(db_session)
    oracle = expected_edf(index)
    correct, total, mismatches = _line_metrics(
        snapshot["section_2b_services"], oracle["lines"]
    )
    assert not mismatches, f"field mismatches: {mismatches}"
    assert correct == total == len(oracle["lines"]) * len(LINE_FIELDS)


def test_totals_match_oracle(db_session):
    index, _, snapshot = _snapshot(db_session)
    correct, total, mismatches = _totals_metrics(
        snapshot["totals"], expected_edf(index)["totals"]
    )
    assert not mismatches, f"totals mismatches: {mismatches}"
    assert correct == total


def test_overall_field_accuracy_metrics(db_session):
    index, _, snapshot = _snapshot(db_session)
    oracle = expected_edf(index)
    line_correct, line_total, _ = _line_metrics(
        snapshot["section_2b_services"], oracle["lines"]
    )
    tot_correct, tot_total, _ = _totals_metrics(snapshot["totals"], oracle["totals"])
    accuracy = (line_correct + tot_correct) / (line_total + tot_total)
    assert accuracy == 1.0


def test_engine_period_and_line_count_match_oracle(db_session):
    index, _, snapshot = _snapshot(db_session)
    oracle = expected_edf(index)
    assert snapshot["engine_version"] == oracle["engine_version"] == "b16.1"
    assert snapshot["period"]["year"] == oracle["period"]["year"]
    assert snapshot["period"]["month"] == oracle["period"]["month"]
    assert len(snapshot["section_2b_services"]) == oracle["line_count"]


def test_persisted_lines_match_snapshot(db_session):
    _, pack = seed(db_session)
    snapshot = json.loads(pack.snapshot_json)
    rows = db_session.scalars(
        select(EDFPackLine)
        .where(EDFPackLine.pack_id == pack.id)
        .order_by(EDFPackLine.sequence)
    ).all()
    assert [r.invoice_number for r in rows] == [
        line["invoice_number"] for line in snapshot["section_2b_services"]
    ]
    assert (
        str(rows[0].net_realisable_value)
        == snapshot["section_2b_services"][0]["net_realisable_value"]
    )


def test_regeneration_is_byte_identical(db_session):
    _, pack = seed(db_session)
    first = pack.snapshot_json
    again = edf_service.generate_pack(db_session, year=2026, month=10)
    assert again.snapshot_json == first


def test_index_exposes_edf_oracle():
    from .edf_helpers import load_index

    index = load_index()
    oracle = index["expected_edf"]
    assert oracle["engine_version"] == "b16.1"
    assert oracle["period"] == {"year": 2026, "month": 10}
    assert oracle["lines"][0]["invoice_number"] == "INV-2026-1001"
    assert oracle["totals"]["total_inr"] == "1694871.00"
