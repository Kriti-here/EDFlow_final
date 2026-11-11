"""Deterministic FIRA PDF extraction with pdfplumber.

This module owns the "PDF -> Extraction" leg of the B10 pipeline. It is purely
deterministic: words are read with their geometry (``x0``/``top``/``size``) and
re-assembled into table rows and columns using the fixed FIRA layout produced by
``scripts/gen_fixtures.py``. No AI is involved.

The synthetic FIRA PDFs draw the table *without* ruling lines, so pdfplumber's
``extract_tables()`` finds nothing. Instead we:

1. read every word with its font size;
2. drop anything larger than a data cell (this removes the giant diagonal
   SYNTHETIC watermark, which is emitted at ~48pt);
3. cluster words into rows by their ``top`` coordinate;
4. assign each word to a column by its ``x0`` against known column anchors;
5. keep the rows whose first column parses as an integer line number.

Amounts are kept as the exact strings found in the PDF and parsed to
``Decimal`` only later (never float).
"""

from __future__ import annotations

import io
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import pdfplumber

# The watermark stamped on every synthetic fixture (B9). Its presence marks the
# extracted document as synthetic, not a real bank statement.
WATERMARK = "SYNTHETIC - NOT A REAL DOCUMENT"

# Left x (in PDF points) of each column, left to right. Derived from the fixed
# layout in scripts/gen_fixtures.py (_COLUMNS drawn at _MARGIN + cumulative width).
_COLUMN_ANCHORS: tuple[tuple[str, float], ...] = (
    ("line_no", 26.0),
    ("utr", 52.0),
    ("value_date", 180.0),
    ("remitter_name", 238.0),
    ("remitter_country", 368.0),
    ("currency", 406.0),
    ("gross_amount", 438.0),
    ("bank_charges", 500.0),
    ("net_amount_inr", 556.0),
    ("purpose_code", 630.0),
    ("invoice_reference", 676.0),
)

# Data rows render at 7.0pt, the header at 7.5pt; the watermark is ~48pt. Keeping
# everything at or below this size drops the watermark without touching the table.
_MAX_TABLE_FONT_SIZE = 8.5
# Words within this many points vertically are the same visual row.
_ROW_TOLERANCE = 2.5
# Tolerance (points) when snapping a word's x0 to a column anchor.
_ANCHOR_SLACK = 0.5

# "-" is how the fixtures render an empty invoice reference.
_EMPTY_MARKERS = {"-", "--", "n/a", "na", ""}

_HEADER_PATTERNS: dict[str, re.Pattern[str]] = {
    "fira_reference": re.compile(r"FIRA Reference:\s*(\S+)"),
    "bank_name": re.compile(r"Bank:\s*(.+?)\s+AD Code:"),
    "ad_code": re.compile(r"AD Code:\s*(\S+)"),
    "statement_period": re.compile(
        r"Statement Period:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})"
    ),
    "generated_on": re.compile(r"Generated:\s*(\d{4}-\d{2}-\d{2})"),
}


class FiraExtractionError(Exception):
    """Raised when the bytes are not a readable PDF."""


@dataclass
class ExtractedLine:
    """One remittance row, values as raw strings straight from the PDF."""

    line_no: int
    utr: str | None = None
    value_date: str | None = None
    remitter_name: str | None = None
    remitter_country: str | None = None
    currency: str | None = None
    gross_amount: str | None = None
    bank_charges: str | None = None
    net_amount_inr: str | None = None
    purpose_code: str | None = None
    invoice_reference: str | None = None
    raw_text: str = ""


@dataclass
class ExtractedDocument:
    """Header metadata plus every extracted line for one FIRA PDF."""

    fira_reference: str | None = None
    bank_name: str | None = None
    ad_code: str | None = None
    statement_period_start: str | None = None
    statement_period_end: str | None = None
    generated_on: str | None = None
    is_synthetic: bool = False
    page_count: int = 0
    lines: list[ExtractedLine] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


def _clean(value: str | None) -> str | None:
    """Collapse whitespace and treat known empty markers as ``None``."""
    if value is None:
        return None
    text = " ".join(value.split())
    return None if text.strip().lower() in _EMPTY_MARKERS else text


def _column_for(x0: float) -> str | None:
    """Return the column whose anchor is the greatest one <= ``x0``."""
    field_name: str | None = None
    for name, anchor in _COLUMN_ANCHORS:
        if x0 >= anchor - _ANCHOR_SLACK:
            field_name = name
        else:
            break
    return field_name


def _cluster_rows(words: Iterable[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group words into rows by their vertical position (``top``)."""
    rows: list[dict[str, Any]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for row in rows:
            if abs(row["top"] - w["top"]) <= _ROW_TOLERANCE:
                row["words"].append(w)
                break
        else:
            rows.append({"top": w["top"], "words": [w]})
    for row in rows:
        row["words"].sort(key=lambda w: w["x0"])
    return [row["words"] for row in rows]


def _row_cells(words: list[dict[str, Any]]) -> dict[str, str]:
    """Assign each word to its column and join multi-word cells."""
    buckets: dict[str, list[str]] = {}
    for w in words:
        name = _column_for(w["x0"])
        if name is None:
            continue
        buckets.setdefault(name, []).append(w["text"])
    return {name: " ".join(parts) for name, parts in buckets.items()}


def _to_positive_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        number = int(value.strip())
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _parse_header(text: str) -> dict[str, Any]:
    """Pull the statement header fields out of the page text."""
    header: dict[str, Any] = {
        "fira_reference": None,
        "bank_name": None,
        "ad_code": None,
        "statement_period_start": None,
        "statement_period_end": None,
        "generated_on": None,
    }
    for name, pattern in _HEADER_PATTERNS.items():
        match = pattern.search(text)
        if not match:
            continue
        if name == "statement_period":
            header["statement_period_start"] = match.group(1)
            header["statement_period_end"] = match.group(2)
        else:
            header[name] = match.group(1).strip()
    return header


def _extract_lines(rows: list[list[dict[str, Any]]]) -> list[ExtractedLine]:
    """Turn clustered rows into ``ExtractedLine`` records (data rows only)."""
    lines: list[ExtractedLine] = []
    for words in rows:
        cells = _row_cells(words)
        line_no = _to_positive_int(cells.get("line_no"))
        if line_no is None:
            continue
        lines.append(
            ExtractedLine(
                line_no=line_no,
                utr=_clean(cells.get("utr")),
                value_date=_clean(cells.get("value_date")),
                remitter_name=_clean(cells.get("remitter_name")),
                remitter_country=_clean(cells.get("remitter_country")),
                currency=_clean(cells.get("currency")),
                gross_amount=_clean(cells.get("gross_amount")),
                bank_charges=_clean(cells.get("bank_charges")),
                net_amount_inr=_clean(cells.get("net_amount_inr")),
                purpose_code=_clean(cells.get("purpose_code")),
                invoice_reference=_clean(cells.get("invoice_reference")),
                raw_text=" ".join(w["text"] for w in words),
            )
        )
    lines.sort(key=lambda line: line.line_no)
    return lines


def extract_bytes(data: bytes) -> ExtractedDocument:
    """Extract a FIRA statement from in-memory PDF bytes.

    Raises ``FiraExtractionError`` if the bytes are not a readable PDF.
    """
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            page_count = len(pdf.pages)
            texts: list[str] = []
            words: list[dict[str, Any]] = []
            for page in pdf.pages:
                texts.append(page.extract_text() or "")
                words.extend(page.extract_words(extra_attrs=["size"]))
    except FiraExtractionError:
        raise
    except Exception as exc:  # pdfplumber raises a variety of low-level errors
        raise FiraExtractionError(f"could not read PDF: {exc}") from exc

    full_text = "\n".join(texts)
    table_words = [w for w in words if w.get("size", 0) <= _MAX_TABLE_FONT_SIZE]

    document = ExtractedDocument(
        page_count=page_count, is_synthetic=WATERMARK in full_text
    )
    document.__dict__.update(_parse_header(full_text))
    document.lines = _extract_lines(_cluster_rows(table_words))

    if page_count == 0:
        document.issues.append("PDF has no pages")
    if not document.lines:
        document.issues.append("No FIRA table rows could be extracted")
    return document


def extract_path(path: str) -> ExtractedDocument:
    """Extract a FIRA statement from a filesystem path."""
    with open(path, "rb") as handle:
        return extract_bytes(handle.read())
