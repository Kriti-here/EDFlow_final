"""B10: deterministic FIRA extraction tests, checked against the B9 ground truth.

Every synthetic fixture's extracted header and lines must match its
``*.ground_truth.json`` exactly -- B10's success criterion is 100% field accuracy.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.services.fira_extract import (
    WATERMARK,
    FiraExtractionError,
    _column_for,
    extract_bytes,
    extract_path,
)

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"

# Line fields compared 1:1 against ground truth (invoice_reference included;
# there is deliberately no matching field, so none is compared).
LINE_FIELDS = (
    "utr",
    "value_date",
    "remitter_name",
    "remitter_country",
    "currency",
    "gross_amount",
    "bank_charges",
    "net_amount_inr",
    "purpose_code",
    "invoice_reference",
)

FIXTURES = sorted(FIXTURE_DIR.glob("fira_*.pdf"))


def _ground_truth(pdf: Path) -> dict:
    return json.loads((FIXTURE_DIR / f"{pdf.stem}.ground_truth.json").read_text())


def test_five_fixtures_are_available():
    assert [p.name for p in FIXTURES] == [
        "fira_01_clean.pdf",
        "fira_02_fx_variance.pdf",
        "fira_03_split_duplicate.pdf",
        "fira_04_missing_unmatched.pdf",
        "fira_05_ambiguous.pdf",
    ]


@pytest.mark.parametrize("pdf", FIXTURES, ids=lambda p: p.stem)
def test_header_matches_ground_truth(pdf):
    gt = _ground_truth(pdf)["fira"]
    doc = extract_path(str(pdf))
    assert doc.fira_reference == gt["fira_reference"]
    assert doc.bank_name == gt["bank"]
    assert doc.ad_code == gt["ad_code"]
    assert doc.generated_on == gt["generated_on"]
    start, end = gt["statement_period"].split(" to ")
    assert doc.statement_period_start == start
    assert doc.statement_period_end == end


@pytest.mark.parametrize("pdf", FIXTURES, ids=lambda p: p.stem)
def test_watermark_detected(pdf):
    doc = extract_path(str(pdf))
    assert doc.is_synthetic is True
    assert WATERMARK in (pdf.read_bytes().decode("latin-1", errors="ignore"))


@pytest.mark.parametrize("pdf", FIXTURES, ids=lambda p: p.stem)
def test_line_count_matches_ground_truth(pdf):
    gt = _ground_truth(pdf)
    doc = extract_path(str(pdf))
    assert len(doc.lines) == len(gt["lines"])


@pytest.mark.parametrize("pdf", FIXTURES, ids=lambda p: p.stem)
def test_lines_match_ground_truth_exactly(pdf):
    gt = _ground_truth(pdf)
    doc = extract_path(str(pdf))
    for extracted, expected in zip(doc.lines, gt["lines"]):
        assert extracted.line_no == expected["line_no"]
        for field in LINE_FIELDS:
            assert getattr(extracted, field) == expected[field], (
                f"{pdf.stem} line {expected['line_no']} field {field}: "
                f"{getattr(extracted, field)!r} != {expected[field]!r}"
            )


def test_field_accuracy_is_one_hundred_percent():
    """Aggregate accuracy across all fixtures and field comparisons."""
    correct = 0
    total = 0
    for pdf in FIXTURES:
        gt = _ground_truth(pdf)
        doc = extract_path(str(pdf))
        for extracted, expected in zip(doc.lines, gt["lines"]):
            for field in LINE_FIELDS:
                total += 1
                correct += int(getattr(extracted, field) == expected[field])
    assert total > 0
    assert correct == total, f"field accuracy {correct}/{total} is below 100%"


def test_extract_bytes_matches_extract_path():
    pdf = FIXTURES[0]
    from_bytes = extract_bytes(pdf.read_bytes())
    from_path = extract_path(str(pdf))
    assert from_bytes.fira_reference == from_path.fira_reference
    assert [(l.line_no, l.utr, l.gross_amount) for l in from_bytes.lines] == [
        (l.line_no, l.utr, l.gross_amount) for l in from_path.lines
    ]


def test_missing_reference_is_normalised_to_none():
    pdf = FIXTURE_DIR / "fira_04_missing_unmatched.pdf"
    doc = extract_path(str(pdf))
    assert doc.lines[0].invoice_reference is None


def test_extraction_has_no_watermark_noise_in_cells():
    """Diagonal watermark letters (~48pt) must never leak into a cell value."""
    noise = set(WATERMARK.replace(" ", ""))
    for pdf in FIXTURES:
        for line in extract_path(str(pdf)).lines:
            for field in LINE_FIELDS:
                value = getattr(line, field)
                if isinstance(value, str) and len(value) == 1:
                    assert value not in noise, f"watermark letter leaked: {value!r}"


def test_column_assignment_boundaries():
    assert _column_for(26.0) == "line_no"
    assert _column_for(52.0) == "utr"
    assert _column_for(180.0) == "value_date"
    assert _column_for(238.0) == "remitter_name"
    assert _column_for(676.0) == "invoice_reference"
    assert _column_for(24.0) is None  # left of the first column


def test_non_pdf_bytes_raise():
    with pytest.raises(FiraExtractionError):
        extract_bytes(b"this is definitely not a pdf")
