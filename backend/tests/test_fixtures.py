"""B9 tests: synthetic FIRA fixtures, ground truth JSON and demo datasets.

These tests validate the generated artifacts under ``fixtures/synthetic/``:
that every PDF is readable and carries the SYNTHETIC watermark, that the
ground truth is internally consistent with the demo datasets, and that each
of the eight required scenarios is actually present and well formed.
"""

from __future__ import annotations

import importlib.util
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pytest
from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures" / "synthetic"
GEN_SCRIPT = REPO_ROOT / "scripts" / "gen_fixtures.py"

WATERMARK = "SYNTHETIC - NOT A REAL DOCUMENT"
LINE_MONEY_KEYS = ("gross_amount", "bank_charges", "net_amount_inr")
REQUIRED_SCENARIOS = {
    "exact_match",
    "fx_variance",
    "split_payment",
    "missing_reference",
    "ambiguous_invoices",
    "duplicate_line",
    "unmatched_line",
    "invoice_without_fira",
}


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------
def _load_json(name: str) -> dict:
    path = FIXTURES_DIR / name
    assert path.is_file(), f"missing fixture artifact: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def _as_decimal(value: object) -> Decimal:
    """Assert `value` is a padded decimal string and return its Decimal."""
    assert isinstance(value, str), f"money must be a string, got {type(value).__name__}"
    try:
        return Decimal(value)
    except InvalidOperation as exc:  # pragma: no cover - failure path
        raise AssertionError(f"not a decimal string: {value!r}") from exc


def _pdf_text(path: Path) -> str:
    return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)


@pytest.fixture(scope="module")
def index() -> dict:
    return _load_json("index.json")


@pytest.fixture(scope="module")
def ground_truths(index: dict) -> dict[str, dict]:
    return {f["id"]: _load_json(f["ground_truth"]) for f in index["fixtures"]}


@pytest.fixture(scope="module")
def invoices() -> list[dict]:
    return _load_json("demo_invoices.json")["invoices"]


@pytest.fixture(scope="module")
def payments() -> list[dict]:
    return _load_json("demo_payments.json")["payments"]


@pytest.fixture(scope="module")
def invoice_by_number(invoices: list[dict]) -> dict[str, dict]:
    return {inv["number"]: inv for inv in invoices}


@pytest.fixture(scope="module")
def generator():
    spec = importlib.util.spec_from_file_location("gen_fixtures", GEN_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Manifest / existence
# ---------------------------------------------------------------------------
def test_index_covers_all_scenarios_and_five_fixtures(index: dict) -> None:
    assert index["synthetic"] is True
    assert index["watermark"] == WATERMARK
    assert len(index["fixtures"]) == 5
    assert REQUIRED_SCENARIOS.issubset(set(index["scenarios"]))
    for scenario in REQUIRED_SCENARIOS:
        assert index["scenarios"][scenario], f"scenario {scenario} has no content"


def test_all_fixture_files_exist(index: dict) -> None:
    for f in index["fixtures"]:
        assert (FIXTURES_DIR / f["file"]).is_file(), f["file"]
        assert (FIXTURES_DIR / f["ground_truth"]).is_file(), f["ground_truth"]
    for demo in index["demo_files"].values():
        assert (FIXTURES_DIR / demo).is_file(), demo


# ---------------------------------------------------------------------------
# PDF readability + watermark
# ---------------------------------------------------------------------------
def test_every_pdf_is_readable(index: dict) -> None:
    for f in index["fixtures"]:
        reader = PdfReader(str(FIXTURES_DIR / f["file"]))
        assert len(reader.pages) >= 1
        text = _pdf_text(FIXTURES_DIR / f["file"])
        assert text.strip(), f"{f['file']} produced no extractable text"


def test_every_pdf_carries_the_watermark(index: dict) -> None:
    for f in index["fixtures"]:
        assert WATERMARK in _pdf_text(FIXTURES_DIR / f["file"]), f["file"]


# ---------------------------------------------------------------------------
# Ground truth consistency
# ---------------------------------------------------------------------------
def test_ground_truth_is_labelled_synthetic(ground_truths: dict[str, dict]) -> None:
    for fid, gt in ground_truths.items():
        assert gt["synthetic"] is True, fid
        assert gt["dataset"] == "SYNTHETIC", fid
        assert gt["watermark"] == WATERMARK, fid
        assert gt["fixture_id"] == fid
        assert gt["scenarios"], fid
        assert gt["source"] == "simulated", fid


def test_ground_truth_lines_appear_in_pdf_text(
    index: dict, ground_truths: dict[str, dict]
) -> None:
    for f in index["fixtures"]:
        gt = ground_truths[f["id"]]
        text = _pdf_text(FIXTURES_DIR / f["file"])
        assert gt["fira"]["fira_reference"] in text, f["id"]
        for line in gt["lines"]:
            assert line["utr"] in text, f"{f['id']} missing UTR {line['utr']}"
            assert line["gross_amount"] in text, (
                f"{f['id']} missing gross {line['gross_amount']}"
            )
            if line["invoice_reference"] is not None:
                assert line["invoice_reference"] in text, f"{f['id']} missing ref"


def test_every_line_has_a_matching_expectation(ground_truths: dict[str, dict]) -> None:
    for fid, gt in ground_truths.items():
        line_numbers = [line["line_no"] for line in gt["lines"]]
        expected_numbers = [m["line_no"] for m in gt["expected_matching"]]
        assert line_numbers == expected_numbers, fid
        assert line_numbers == list(range(1, len(line_numbers) + 1)), fid


def test_money_values_are_decimal_strings(ground_truths: dict[str, dict]) -> None:
    for fid, gt in ground_truths.items():
        for line in gt["lines"]:
            for key in LINE_MONEY_KEYS:
                value = _as_decimal(line[key])
                assert value >= 0, f"{fid} line {line['line_no']} {key}"


def test_no_real_pii_used(ground_truths: dict[str, dict], invoices: list[dict]) -> None:
    for gt in ground_truths.values():
        for line in gt["lines"]:
            assert line["remitter_email"].endswith("@example.com"), line[
                "remitter_email"
            ]
            assert line["remitter_country"] != "IN"
    for inv in invoices:
        assert inv["client_email"].endswith("@example.com"), inv["client_email"]


# ---------------------------------------------------------------------------
# Scenario integrity
# ---------------------------------------------------------------------------
def test_scenario_exact_match(
    ground_truths: dict[str, dict], invoice_by_number: dict
) -> None:
    gt = ground_truths["fira_01_clean"]
    assert gt["scenarios"] == ["exact_match"]
    for m in gt["expected_matching"]:
        assert m["match_type"] == "exact"
        assert m["expected_status"] == "matched"
        assert m["confidence"] == "high"
        assert m["invoice_number"] in invoice_by_number


def test_scenario_fx_variance(ground_truths: dict[str, dict]) -> None:
    gt = ground_truths["fira_02_fx_variance"]
    assert gt["scenarios"] == ["fx_variance"]
    for m in gt["expected_matching"]:
        assert m["match_type"] == "fx_variance"
        assert m["expected_rate"] != m["actual_rate"]
        assert _as_decimal(m["expected_net_inr"]) != _as_decimal(m["actual_net_inr"])
        variance = _as_decimal(m["variance_percent"])
        assert variance < 0, "realised INR should be below the simulated rate"


def test_scenario_split_payment(
    ground_truths: dict[str, dict], invoice_by_number: dict
) -> None:
    gt = ground_truths["fira_03_split_duplicate"]
    split_lines = [
        line for line in gt["lines"] if line["invoice_reference"] == "INV-2026-1007"
    ]
    assert len(split_lines) == 2
    total = sum(
        (_as_decimal(line["gross_amount"]) for line in split_lines), Decimal("0")
    )
    assert total == _as_decimal(invoice_by_number["INV-2026-1007"]["amount"])
    for m in gt["expected_matching"]:
        if m["invoice_number"] == "INV-2026-1007":
            assert m["match_type"] == "split"
            assert m["parts_total"] == 2


def test_scenario_duplicate_line(ground_truths: dict[str, dict]) -> None:
    gt = ground_truths["fira_03_split_duplicate"]
    original = gt["lines"][2]
    duplicate = gt["lines"][3]
    assert duplicate["utr"] == original["utr"]
    assert duplicate["gross_amount"] == original["gross_amount"]
    assert duplicate["value_date"] == original["value_date"]
    dup_expect = gt["expected_matching"][3]
    assert dup_expect["match_type"] == "duplicate"
    assert dup_expect["expected_status"] == "duplicate"
    assert dup_expect["duplicate_of"] == original["line_no"]
    assert gt["expectations"]["duplicate_utr"] == original["utr"]


def test_scenario_missing_reference(ground_truths: dict[str, dict]) -> None:
    gt = ground_truths["fira_04_missing_unmatched"]
    line = gt["lines"][0]
    assert line["invoice_reference"] is None
    expected = gt["expected_matching"][0]
    assert expected["match_type"] == "missing_reference"
    assert expected["expected_status"] == "needs_review"
    assert expected["candidates"] == []


def test_scenario_unmatched_line(
    ground_truths: dict[str, dict], invoice_by_number: dict
) -> None:
    gt = ground_truths["fira_04_missing_unmatched"]
    line = gt["lines"][1]
    assert line["invoice_reference"] not in invoice_by_number
    expected = gt["expected_matching"][1]
    assert expected["match_type"] == "unmatched"
    assert expected["expected_status"] == "exception"
    assert expected["missing_invoice_reference"] == line["invoice_reference"]


def test_scenario_ambiguous_invoices(
    ground_truths: dict[str, dict], invoice_by_number: dict
) -> None:
    gt = ground_truths["fira_05_ambiguous"]
    line = gt["lines"][0]
    assert line["invoice_reference"] is None
    expected = gt["expected_matching"][0]
    assert expected["match_type"] == "ambiguous"
    assert expected["expected_status"] == "needs_review"
    candidates = expected["candidates"]
    assert len(candidates) == 2
    first, second = (invoice_by_number[c] for c in candidates)
    assert first["client_email"] == second["client_email"] == line["remitter_email"]
    assert first["amount"] == second["amount"] == line["gross_amount"]


def test_scenario_invoice_without_fira(
    index: dict, ground_truths: dict[str, dict], invoice_by_number: dict
) -> None:
    absent = index["scenarios"]["invoice_without_fira"]["invoices"]
    assert absent
    referenced = {
        line["invoice_reference"]
        for gt in ground_truths.values()
        for line in gt["lines"]
    }
    for number in absent:
        assert number in invoice_by_number, number
        assert number not in referenced, f"{number} unexpectedly appears in a FIRA"


# ---------------------------------------------------------------------------
# Demo dataset integrity
# ---------------------------------------------------------------------------
def test_demo_invoices_are_consistent(invoices: list[dict]) -> None:
    numbers = [inv["number"] for inv in invoices]
    assert len(numbers) == len(set(numbers)), "invoice numbers must be unique"
    for inv in invoices:
        assert inv["synthetic"] is True
        _as_decimal(inv["amount"])
        assert len(inv["currency"]) == 3
        assert inv["issue_date"] < inv["due_date"]
        assert inv["purpose_code"]


def test_demo_payments_are_consistent(
    payments: list[dict], invoice_by_number: dict, ground_truths: dict[str, dict]
) -> None:
    capture_ids = [p["paypal_capture_id"] for p in payments]
    assert len(capture_ids) == len(set(capture_ids)), "capture ids must be unique"
    fixture_lines = {
        (gt["fixture_id"], line["line_no"]): line
        for gt in ground_truths.values()
        for line in gt["lines"]
    }
    # References the unmatched scenario deliberately points at missing invoices.
    dangling = {
        m["missing_invoice_reference"]
        for gt in ground_truths.values()
        for m in gt["expected_matching"]
        if m["match_type"] == "unmatched"
    }
    for payment in payments:
        assert payment["synthetic"] is True
        gross = _as_decimal(payment["gross"])
        fee = _as_decimal(payment["paypal_fee"])
        net = _as_decimal(payment["net"])
        assert gross - fee == net, payment["paypal_capture_id"]
        if payment["invoice_number"] is not None:
            assert (
                payment["invoice_number"] in invoice_by_number
                or payment["invoice_number"] in dangling
            )
        if payment["fira_fixture_id"] is not None:
            key = (payment["fira_fixture_id"], payment["fira_line_no"])
            assert key in fixture_lines, key
            assert fixture_lines[key]["gross_amount"] == payment["gross"]


# ---------------------------------------------------------------------------
# Generator reproducibility
# ---------------------------------------------------------------------------
def test_generator_reproduces_the_committed_fixtures(generator, tmp_path: Path) -> None:
    written = generator.write_all(tmp_path)
    produced = {p.name for p in written}
    committed = {p.name for p in FIXTURES_DIR.iterdir() if p.is_file()}
    assert produced == committed

    for path in written:
        if path.suffix == ".pdf":
            reader = PdfReader(str(path))
            assert len(reader.pages) >= 1
            assert WATERMARK in "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
