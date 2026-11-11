#!/usr/bin/env python3
"""B9: generate synthetic FIRA fixtures, ground truth and demo datasets.

This script produces, under ``fixtures/synthetic/``:

* five synthetic FIRA PDFs, each stamped with the watermark
  ``SYNTHETIC - NOT A REAL DOCUMENT``;
* one ``*.ground_truth.json`` per PDF describing the exact expected FIRA
  lines and the expected matching outcome for each line;
* ``demo_invoices.json`` / ``demo_payments.json`` demo datasets; and
* ``index.json`` a manifest tying the fixtures to the scenarios they cover.

Everything is fictional and deterministic. No real personal information is
used (emails are ``@example.com``, PAN/GSTIN are placeholder values). All
monetary values are ``Decimal`` rendered as strings. FX rates are marked as
simulated, not market data.

Run::

    python scripts/gen_fixtures.py            # writes fixtures/synthetic/
    python scripts/gen_fixtures.py --out DIR  # writes to a custom directory
"""

from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WATERMARK = "SYNTHETIC - NOT A REAL DOCUMENT"
DATASET_LABEL = "SYNTHETIC"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = REPO_ROOT / "fixtures" / "synthetic"

REFERENCE_DATE = "2026-11-06"
STATEMENT_PERIOD = "2026-10-31 to 2026-11-06"
REALISATION_DAYS = 30  # invoice due date = issue date + 30 days

# Simulated FX rates (INR per unit of foreign currency). Clearly labelled
# SYNTHETIC. These are invented round numbers, not market data.
FX_RATES_SIMULATED: dict[str, str] = {
    "USD": "84.00",
    "GBP": "106.00",
    "EUR": "91.00",
    "SGD": "62.00",
}

SYNTHETIC_EXPORTER = {
    "legal_name": "Synthetic Exporter Pvt Ltd (FICTIONAL)",
    "entity_type": "company",
    "pan": "AAAAA0000A",
    "gstin": "00AAAAA0000A1Z0",
    "lut_number": "SYN-LUT-0001",
    "ad_bank_name": "Synthetic Bank of Exampleland (FICTIONAL)",
    "ad_code": "00000000000000",
}

CLIENTS: dict[str, tuple[str, str]] = {
    "buyer.us@example.com": ("Example Software Buyer Inc", "US"),
    "design.gb@example.com": ("Sample Design Studio Ltd", "GB"),
    "analytics.de@example.com": ("Demo Analytics GmbH", "DE"),
    "retail.sg@example.com": ("Test Retail Pte Ltd", "SG"),
    "media.us@example.com": ("Placeholder Media LLC", "US"),
}

# Fictional billed-to addresses for the EDF Section 2B "Name & Address".
CLIENT_ADDRESSES: dict[str, str] = {
    "buyer.us@example.com": "100 Example Avenue, Springfield, US",
    "design.gb@example.com": "20 Sample Street, London, GB",
    "analytics.de@example.com": "5 Demo Platz, Berlin, DE",
    "retail.sg@example.com": "8 Test Road, Singapore, SG",
    "media.us@example.com": "42 Placeholder Blvd, Metropolis, US",
}

# invoice_number, client_email, currency, amount, issue_date, purpose_code, description, contract_ref, sac_code
_INVOICE_ROWS = [
    (
        "INV-2026-1001",
        "buyer.us@example.com",
        "USD",
        "2500.00",
        "2026-10-02",
        "P0802",
        "Software development services",
        "SYN-CONTRACT-1001",
        "998314",
    ),
    (
        "INV-2026-1002",
        "buyer.us@example.com",
        "USD",
        "1800.00",
        "2026-10-05",
        "P0802",
        "Software consultancy",
        "SYN-CONTRACT-1002",
        "998314",
    ),
    (
        "INV-2026-1003",
        "design.gb@example.com",
        "GBP",
        "1200.00",
        "2026-10-08",
        "P1007",
        "Market research services",
        "SYN-CONTRACT-1003",
        "998392",
    ),
    (
        "INV-2026-1004",
        "analytics.de@example.com",
        "EUR",
        "3000.00",
        "2026-10-12",
        "P0803",
        "Data processing and web hosting",
        "SYN-CONTRACT-1004",
        "998315",
    ),
    (
        "INV-2026-1005",
        "retail.sg@example.com",
        "SGD",
        "2200.00",
        "2026-10-15",
        "P1006",
        "Business management consultancy",
        "SYN-CONTRACT-1005",
        "998311",
    ),
    (
        "INV-2026-1006",
        "buyer.us@example.com",
        "USD",
        "950.00",
        "2026-10-18",
        "P1099",
        "Freelance content creation",
        "SYN-CONTRACT-1006",
        "998387",
    ),
    (
        "INV-2026-1007",
        "media.us@example.com",
        "USD",
        "1500.00",
        "2026-10-21",
        "P0807",
        "Digital publishing services",
        "SYN-CONTRACT-1007",
        "998386",
    ),
    (
        "INV-2026-1008",
        "analytics.de@example.com",
        "EUR",
        "4000.00",
        "2026-10-27",
        "P1008",
        "Research and development services",
        "SYN-CONTRACT-1008",
        "998313",
    ),
    (
        "INV-2026-1009",
        "buyer.us@example.com",
        "USD",
        "2000.00",
        "2026-10-30",
        "P0802",
        "Software implementation",
        "SYN-CONTRACT-1009",
        "998314",
    ),
    (
        "INV-2026-1010",
        "buyer.us@example.com",
        "USD",
        "2000.00",
        "2026-10-31",
        "P0802",
        "Software implementation phase two",
        "SYN-CONTRACT-1010",
        "998314",
    ),
]


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def money(value: Any) -> str:
    """Render any numeric value as a two-decimal string using Decimal only."""
    return str(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def net_inr(gross: str, charges: str, rate: str) -> str:
    """(gross - charges) * rate, as a Decimal string."""
    return money((Decimal(gross) - Decimal(charges)) * Decimal(rate))


def variance_percent(actual: str, expected: str) -> str:
    """Percentage deviation of `actual` from `expected`, two decimals."""
    exp = Decimal(expected)
    if exp == 0:
        return "0.00"
    return str(((Decimal(actual) - exp) / exp * 100).quantize(Decimal("0.01")))


def build_invoices() -> list[dict[str, Any]]:
    """Build the demo invoice dataset (synthetic)."""
    invoices = []
    for (
        number,
        email,
        currency,
        amount,
        issue,
        purpose,
        desc,
        contract,
        sac_code,
    ) in _INVOICE_ROWS:
        name, country = CLIENTS[email]
        issue_date = date.fromisoformat(issue)
        invoices.append(
            {
                "number": number,
                "client_name": name,
                "client_email": email,
                "client_country": country,
                "client_address": CLIENT_ADDRESSES[email],
                "currency": currency,
                "amount": amount,
                "issue_date": issue,
                "due_date": (issue_date + timedelta(days=REALISATION_DAYS)).isoformat(),
                "purpose_code": purpose,
                # B12 oracle: the purpose code the adviser must rank first.
                "expected_purpose_code": purpose,
                "service_description": desc,
                "contract_ref": contract,
                # B16: contract date is 15 days before the invoice; SAC is the service code.
                "contract_date": (issue_date - timedelta(days=15)).isoformat(),
                "sac_code": sac_code,
                "synthetic": True,
            }
        )
    return invoices


def _line(
    line_no: int,
    fixture_no: int,
    email: str,
    currency: str,
    gross: str,
    charges: str,
    value_date: str,
    purpose: str,
    invoice_reference: str | None,
    rate: str | None = None,
    utr: str | None = None,
) -> dict[str, Any]:
    """Build one FIRA line dict with money rendered as Decimal strings."""
    name, country = CLIENTS[email]
    applied_rate = rate if rate is not None else FX_RATES_SIMULATED[currency]
    return {
        "line_no": line_no,
        "utr": utr or f"SYN-UTR-{fixture_no:02d}-{line_no:03d}",
        "value_date": value_date,
        "remitter_name": name,
        "remitter_country": country,
        "remitter_email": email,
        "currency": currency,
        "gross_amount": gross,
        "bank_charges": money(charges),
        "net_amount_inr": net_inr(gross, charges, applied_rate),
        "purpose_code": purpose,
        "invoice_reference": invoice_reference,
    }


# ---------------------------------------------------------------------------
# Fixture specifications
# ---------------------------------------------------------------------------
def fixture_clean() -> dict[str, Any]:
    """Scenario: exact_match. All references resolve, FX at simulated rate."""
    lines = [
        _line(
            1,
            1,
            "buyer.us@example.com",
            "USD",
            "2500.00",
            "72.50",
            "2026-11-02",
            "P0802",
            "INV-2026-1001",
        ),
        _line(
            2,
            1,
            "buyer.us@example.com",
            "USD",
            "1800.00",
            "52.20",
            "2026-11-03",
            "P0802",
            "INV-2026-1002",
        ),
        _line(
            3,
            1,
            "design.gb@example.com",
            "GBP",
            "1200.00",
            "43.20",
            "2026-11-04",
            "P1007",
            "INV-2026-1003",
        ),
    ]
    matching = [
        {
            "line_no": 1,
            "invoice_number": "INV-2026-1001",
            "match_type": "exact",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1001"],
            "notes": "Reference and gross amount agree.",
        },
        {
            "line_no": 2,
            "invoice_number": "INV-2026-1002",
            "match_type": "exact",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1002"],
            "notes": "Reference and gross amount agree.",
        },
        {
            "line_no": 3,
            "invoice_number": "INV-2026-1003",
            "match_type": "exact",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1003"],
            "notes": "Reference and gross amount agree.",
        },
    ]
    return _fixture(
        1,
        "fira_01_clean",
        ["exact_match"],
        lines,
        matching,
        {
            "matched_invoices": ["INV-2026-1001", "INV-2026-1002", "INV-2026-1003"],
            "all_lines_referenced": True,
        },
    )


def fixture_fx_variance() -> dict[str, Any]:
    """Scenario: fx_variance. Bank credited INR below the simulated-rate value."""
    expected_rate_usd = FX_RATES_SIMULATED["USD"]
    lines = [
        _line(
            1,
            2,
            "analytics.de@example.com",
            "EUR",
            "3000.00",
            "87.00",
            "2026-11-02",
            "P0803",
            "INV-2026-1004",
            rate="88.50",
        ),
        _line(
            2,
            2,
            "retail.sg@example.com",
            "SGD",
            "2200.00",
            "63.80",
            "2026-11-03",
            "P1006",
            "INV-2026-1005",
            rate="60.90",
        ),
    ]
    matching = [
        {
            "line_no": 1,
            "invoice_number": "INV-2026-1004",
            "match_type": "fx_variance",
            "expected_status": "matched_with_variance",
            "confidence": "high",
            "candidates": ["INV-2026-1004"],
            "expected_rate": FX_RATES_SIMULATED["EUR"],
            "actual_rate": "88.50",
            "expected_net_inr": net_inr("3000.00", "87.00", FX_RATES_SIMULATED["EUR"]),
            "actual_net_inr": lines[0]["net_amount_inr"],
            "variance_percent": variance_percent(
                lines[0]["net_amount_inr"],
                net_inr("3000.00", "87.00", FX_RATES_SIMULATED["EUR"]),
            ),
            "notes": "Realised INR conversion is below the simulated mid-market rate.",
        },
        {
            "line_no": 2,
            "invoice_number": "INV-2026-1005",
            "match_type": "fx_variance",
            "expected_status": "matched_with_variance",
            "confidence": "high",
            "candidates": ["INV-2026-1005"],
            "expected_rate": FX_RATES_SIMULATED["SGD"],
            "actual_rate": "60.90",
            "expected_net_inr": net_inr("2200.00", "63.80", FX_RATES_SIMULATED["SGD"]),
            "actual_net_inr": lines[1]["net_amount_inr"],
            "variance_percent": variance_percent(
                lines[1]["net_amount_inr"],
                net_inr("2200.00", "63.80", FX_RATES_SIMULATED["SGD"]),
            ),
            "notes": "Realised INR conversion is below the simulated mid-market rate.",
        },
    ]
    return _fixture(
        2,
        "fira_02_fx_variance",
        ["fx_variance"],
        lines,
        matching,
        {
            "variance_tolerance_percent": "0.50",
            "expected_rates": {
                "EUR": FX_RATES_SIMULATED["EUR"],
                "SGD": FX_RATES_SIMULATED["SGD"],
            },
            "note_usd_rate": f"USD simulated rate {expected_rate_usd} is unused here.",
        },
        expected_exceptions=[
            {"line_no": 1, "category": "fx_variance", "severity": "low"},
            {"line_no": 2, "category": "fx_variance", "severity": "low"},
        ],
    )


def fixture_split_duplicate() -> dict[str, Any]:
    """Scenarios: split_payment (one invoice, two lines) and duplicate_line."""
    lines = [
        _line(
            1,
            3,
            "media.us@example.com",
            "USD",
            "700.00",
            "20.30",
            "2026-11-02",
            "P0807",
            "INV-2026-1007",
        ),
        _line(
            2,
            3,
            "media.us@example.com",
            "USD",
            "800.00",
            "23.20",
            "2026-11-03",
            "P0807",
            "INV-2026-1007",
        ),
        _line(
            3,
            3,
            "buyer.us@example.com",
            "USD",
            "950.00",
            "27.55",
            "2026-11-04",
            "P1099",
            "INV-2026-1006",
        ),
        # Duplicate: identical UTR, amount, date and reference as line 3.
        _line(
            4,
            3,
            "buyer.us@example.com",
            "USD",
            "950.00",
            "27.55",
            "2026-11-04",
            "P1099",
            "INV-2026-1006",
            utr="SYN-UTR-03-003",
        ),
    ]
    matching = [
        {
            "line_no": 1,
            "invoice_number": "INV-2026-1007",
            "match_type": "split",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1007"],
            "split_group": "INV-2026-1007",
            "part": 1,
            "parts_total": 2,
            "notes": "Part payment 1 of 2 for a single invoice.",
        },
        {
            "line_no": 2,
            "invoice_number": "INV-2026-1007",
            "match_type": "split",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1007"],
            "split_group": "INV-2026-1007",
            "part": 2,
            "parts_total": 2,
            "notes": "Part payment 2 of 2; parts sum to the invoice gross.",
        },
        {
            "line_no": 3,
            "invoice_number": "INV-2026-1006",
            "match_type": "exact",
            "expected_status": "matched",
            "confidence": "high",
            "candidates": ["INV-2026-1006"],
            "notes": "Original line; duplicated by line 4.",
        },
        {
            "line_no": 4,
            "invoice_number": "INV-2026-1006",
            "match_type": "duplicate",
            "expected_status": "duplicate",
            "confidence": "high",
            "candidates": ["INV-2026-1006"],
            "duplicate_of": 3,
            "notes": "Byte-identical UTR, amount and reference to line 3; must be de-duplicated.",
        },
    ]
    return _fixture(
        3,
        "fira_03_split_duplicate",
        ["split_payment", "duplicate_line"],
        lines,
        matching,
        {
            "split_group": "INV-2026-1007",
            "split_parts": 2,
            "split_total": "1500.00",
            "duplicate_lines": [3, 4],
            "duplicate_utr": "SYN-UTR-03-003",
        },
        expected_exceptions=[
            {"line_no": 4, "category": "duplicate", "severity": "medium"},
        ],
    )


def fixture_missing_unmatched() -> dict[str, Any]:
    """Scenarios: missing_reference (line without a reference) and unmatched_line."""
    lines = [
        _line(
            1,
            4,
            "buyer.us@example.com",
            "USD",
            "1250.00",
            "36.25",
            "2026-11-02",
            "P0802",
            None,
        ),
        _line(
            2,
            4,
            "retail.sg@example.com",
            "SGD",
            "640.00",
            "18.56",
            "2026-11-03",
            "P1006",
            "INV-2026-9999",
        ),
    ]
    matching = [
        {
            "line_no": 1,
            "invoice_number": None,
            "match_type": "missing_reference",
            "expected_status": "needs_review",
            "confidence": "low",
            "candidates": [],
            "notes": "No invoice reference on the FIRA line; a human must link it.",
        },
        {
            "line_no": 2,
            "invoice_number": None,
            "match_type": "unmatched",
            "expected_status": "exception",
            "confidence": "high",
            "candidates": [],
            "missing_invoice_reference": "INV-2026-9999",
            "notes": "Reference points to an invoice that does not exist in the ledger.",
        },
    ]
    return _fixture(
        4,
        "fira_04_missing_unmatched",
        ["missing_reference", "unmatched_line"],
        lines,
        matching,
        {
            "missing_reference_line": 1,
            "unmatched_reference": "INV-2026-9999",
        },
        expected_exceptions=[
            {"line_no": 1, "category": "missing_reference", "severity": "medium"},
            {"line_no": 2, "category": "unmatched", "severity": "high"},
        ],
    )


def fixture_ambiguous() -> dict[str, Any]:
    """Scenario: ambiguous_invoices. Two invoices share amount and client."""
    lines = [
        _line(
            1,
            5,
            "buyer.us@example.com",
            "USD",
            "2000.00",
            "58.00",
            "2026-11-02",
            "P0802",
            None,
        ),
    ]
    matching = [
        {
            "line_no": 1,
            "invoice_number": None,
            "match_type": "ambiguous",
            "expected_status": "needs_review",
            "confidence": "low",
            "candidates": ["INV-2026-1009", "INV-2026-1010"],
            "notes": "No reference and two open invoices share the client and amount.",
        },
    ]
    return _fixture(
        5,
        "fira_05_ambiguous",
        ["ambiguous_invoices"],
        lines,
        matching,
        {
            "ambiguous_candidates": ["INV-2026-1009", "INV-2026-1010"],
            "ambiguous_criteria": "same client_email and same currency/amount, no reference",
        },
        expected_exceptions=[
            {"line_no": 1, "category": "ambiguous", "severity": "medium"},
        ],
    )


def _fixture(
    fixture_no: int,
    fixture_id: str,
    scenarios: list[str],
    lines: list[dict[str, Any]],
    matching: list[dict[str, Any]],
    expectations: dict[str, Any],
    expected_exceptions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assemble a fixture record (used for both the PDF and the ground truth).

    ``expected_exceptions`` is the B13 oracle: the line-level exceptions the
    exception engine must derive for this fixture's FIRA lines.
    """
    return {
        "fixture_id": fixture_id,
        "fixture_no": fixture_no,
        "filename": f"{fixture_id}.pdf",
        "ground_truth_filename": f"{fixture_id}.ground_truth.json",
        "scenarios": scenarios,
        "fira": {
            "fira_reference": f"SYN-FIRA-2026-11-{fixture_no:04d}",
            "bank": SYNTHETIC_EXPORTER["ad_bank_name"],
            "ad_code": SYNTHETIC_EXPORTER["ad_code"],
            "statement_period": STATEMENT_PERIOD,
            "generated_on": REFERENCE_DATE,
        },
        "lines": lines,
        "expected_matching": matching,
        "expected_exceptions": expected_exceptions or [],
        "expectations": expectations,
    }


def build_fixtures() -> list[dict[str, Any]]:
    """Return all five fixture specs in order."""
    return [
        fixture_clean(),
        fixture_fx_variance(),
        fixture_split_duplicate(),
        fixture_missing_unmatched(),
        fixture_ambiguous(),
    ]


# ---------------------------------------------------------------------------
# Demo payment dataset
# ---------------------------------------------------------------------------
def build_payments(fixtures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mirror every FIRA line as a platform-recorded payment, plus one extra."""
    payments = []
    seq = 0
    for fx in fixtures:
        for line in fx["lines"]:
            seq += 1
            gross = line["gross_amount"]
            fee = line["bank_charges"]
            payments.append(
                {
                    "paypal_capture_id": f"SYNCAP{seq:06d}",
                    "invoice_number": line["invoice_reference"],
                    "currency": line["currency"],
                    "gross": gross,
                    "paypal_fee": fee,
                    "net": money(Decimal(gross) - Decimal(fee)),
                    "received_date": line["value_date"],
                    "fira_fixture_id": fx["fixture_id"],
                    "fira_line_no": line["line_no"],
                    "synthetic": True,
                }
            )
    # A payment that is not (yet) present in any FIRA statement.
    payments.append(
        {
            "paypal_capture_id": f"SYNCAP{seq + 1:06d}",
            "invoice_number": "INV-2026-1008",
            "currency": "EUR",
            "gross": "4000.00",
            "paypal_fee": "116.30",
            "net": "3883.70",
            "received_date": "2026-11-05",
            "fira_fixture_id": None,
            "fira_line_no": None,
            "synthetic": True,
        }
    )
    return payments


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------
_PAGE = landscape(A4)
_WIDTH, _HEIGHT = _PAGE
_MARGIN = 24

_COLUMNS: list[tuple[str, float]] = [
    ("S.No", 26),
    ("UTR / FIRA No.", 128),
    ("Value Date", 58),
    ("Remitter Name", 130),
    ("Country", 38),
    ("Ccy", 32),
    ("Gross", 62),
    ("Charges", 56),
    ("Net INR", 74),
    ("Purpose", 46),
    ("Invoice Ref", 108),
]


def _draw_watermark(c: canvas.Canvas) -> None:
    """Draw the diagonal SYNTHETIC watermark across the whole page."""
    c.saveState()
    c.setFillColor(colors.grey)
    c.setFillAlpha(0.25)
    c.setFont("Helvetica-Bold", 40)
    c.translate(_WIDTH / 2, _HEIGHT / 2)
    c.rotate(30)
    c.drawCentredString(0, 0, WATERMARK)
    c.restoreState()


def _draw_row(
    c: canvas.Canvas,
    y: float,
    cells: list[str],
    *,
    bold: bool = False,
    shade: bool = False,
) -> None:
    """Draw one table row at `y` and return nothing (y handled by caller)."""
    if shade:
        c.setFillColor(colors.HexColor("#EEEEEE"))
        c.rect(_MARGIN, y - 4, sum(w for _, w in _COLUMNS), 13, stroke=0, fill=1)
        c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 7.5 if bold else 7)
    x = _MARGIN
    for (_, width), text in zip(_COLUMNS, cells):
        c.drawString(x + 2, y, str(text))
        x += width


def render_fira_pdf(fixture: dict[str, Any], path: Path) -> None:
    """Render one synthetic FIRA fixture to `path`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=_PAGE)
    c.setTitle(f"{WATERMARK} - {fixture['fixture_id']}")
    c.setAuthor("EDFlow synthetic fixture generator")
    c.setSubject(WATERMARK)

    _draw_watermark(c)

    y = _HEIGHT - 32
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.red)
    c.drawString(_MARGIN, y, WATERMARK)
    c.setFillColor(colors.black)

    y -= 16
    c.setFont("Helvetica-Bold", 13)
    c.drawString(
        _MARGIN, y, "FOREIGN INWARD REMITTANCE ADVICE (FIRA) - SYNTHETIC FIXTURE"
    )

    y -= 14
    c.setFont("Helvetica", 8)
    fira = fixture["fira"]
    c.drawString(
        _MARGIN,
        y,
        f"FIRA Reference: {fira['fira_reference']}    "
        f"Bank: {fira['bank']}    AD Code: {fira['ad_code']}",
    )
    y -= 11
    c.drawString(
        _MARGIN,
        y,
        f"Statement Period: {fira['statement_period']}    "
        f"Generated: {fira['generated_on']}",
    )
    y -= 11
    c.drawString(
        _MARGIN,
        y,
        f"Exporter: {SYNTHETIC_EXPORTER['legal_name']}    "
        f"PAN: {SYNTHETIC_EXPORTER['pan']}    GSTIN: {SYNTHETIC_EXPORTER['gstin']}",
    )
    y -= 11
    c.drawString(
        _MARGIN,
        y,
        f"Scenarios: {', '.join(fixture['scenarios'])}    "
        f"Fixture: {fixture['fixture_id']}",
    )

    y -= 18
    _draw_row(c, y, [header for header, _ in _COLUMNS], bold=True, shade=True)
    y -= 13
    for line in fixture["lines"]:
        _draw_row(
            c,
            y,
            [
                line["line_no"],
                line["utr"],
                line["value_date"],
                line["remitter_name"],
                line["remitter_country"],
                line["currency"],
                line["gross_amount"],
                line["bank_charges"],
                line["net_amount_inr"],
                line["purpose_code"],
                line["invoice_reference"] if line["invoice_reference"] else "-",
            ],
        )
        y -= 12

    c.setFont("Helvetica", 7)
    c.setFillColor(colors.red)
    c.drawString(_MARGIN, 40, WATERMARK)
    c.setFillColor(colors.black)
    c.drawString(
        _MARGIN,
        30,
        "All values are fictional and generated for testing only. "
        "FX rates are simulated, not market data.",
    )
    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Ground truth + manifest
# ---------------------------------------------------------------------------
def build_ground_truth(fixture: dict[str, Any]) -> dict[str, Any]:
    """Ground truth JSON for one fixture."""
    return {
        "synthetic": True,
        "dataset": DATASET_LABEL,
        "watermark": WATERMARK,
        "fixture_id": fixture["fixture_id"],
        "source": "simulated",
        "scenarios": fixture["scenarios"],
        "fira": fixture["fira"],
        "fx_rates_simulated": dict(FX_RATES_SIMULATED),
        "exporter": SYNTHETIC_EXPORTER,
        "lines": fixture["lines"],
        "expected_matching": fixture["expected_matching"],
        "expected_exceptions": fixture["expected_exceptions"],
        "expectations": fixture["expectations"],
    }


def build_ledger_exceptions() -> dict[str, Any]:
    """B13 oracle for ledger-level exceptions (not tied to a single FIRA document).

    ``missing_fira``: an invoice that was paid but never appears in any FIRA.
    ``orphan_payment``: a recorded payment that links to no invoice (including the
    one whose reference points at the deliberately missing INV-2026-9999).
    """
    return {
        "missing_fira": [
            {"invoice_number": "INV-2026-1008", "severity": "high"},
        ],
        "missing_payment": [],
        "orphan_payment": [
            {"paypal_capture_id": "SYNCAP000010", "severity": "medium"},
            {"paypal_capture_id": "SYNCAP000011", "severity": "medium"},
            {"paypal_capture_id": "SYNCAP000012", "severity": "medium"},
        ],
    }


def build_expected_edf() -> dict[str, Any]:
    """B16 oracle: the Section 2B lines and totals the EDF engine must produce.

    Computed independently from the invoice/payment specs (net = gross - charges),
    so it is an external check on the engine's net-realisable-value resolution and
    its INR consolidation. The period (2026-10) covers every demo invoice.
    """
    invoices = build_invoices()
    payments = build_payments(build_fixtures())
    first_payment: dict[str, dict[str, Any]] = {}
    for pay in payments:
        number = pay["invoice_number"]
        if number and number not in first_payment:
            first_payment[number] = pay

    ordered = sorted(invoices, key=lambda i: (i["issue_date"], i["number"]))
    lines: list[dict[str, Any]] = []
    by_currency: dict[str, Decimal] = {}
    nrv_by_currency: dict[str, Decimal] = {}
    total_inr = Decimal("0")
    for seq, inv in enumerate(ordered, start=1):
        pay = first_payment.get(inv["number"])
        if pay is not None:
            nrv, nrv_ccy, source = pay["net"], pay["currency"], "paypal"
        else:
            nrv, nrv_ccy, source = inv["amount"], inv["currency"], "expected"
        by_currency[inv["currency"]] = by_currency.get(
            inv["currency"], Decimal("0")
        ) + Decimal(inv["amount"])
        nrv_by_currency[nrv_ccy] = nrv_by_currency.get(nrv_ccy, Decimal("0")) + Decimal(
            nrv
        )
        total_inr += Decimal(nrv) * Decimal(FX_RATES_SIMULATED[nrv_ccy])
        lines.append(
            {
                "sequence": seq,
                "invoice_number": inv["number"],
                "client_name": inv["client_name"],
                "client_country": inv["client_country"],
                "currency": inv["currency"],
                "amount": inv["amount"],
                "net_realisable_value": money(nrv),
                "nrv_currency": nrv_ccy,
                "nrv_source": source,
                "sac_code": inv["sac_code"],
            }
        )
    return {
        "engine_version": "b16.1",
        "period": {"year": 2026, "month": 10},
        "line_count": len(ordered),
        "lines": lines,
        "totals": {
            "by_currency": {k: money(v) for k, v in sorted(by_currency.items())},
            "nrv_by_currency": {
                k: money(v) for k, v in sorted(nrv_by_currency.items())
            },
            "total_inr": money(
                total_inr.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            ),
        },
        "note": (
            "B16 oracle: the Section 2B lines and INR totals the deterministic EDF "
            "engine must produce for period 2026-10. NRV prefers a recorded PayPal "
            "payment (net), else the invoiced amount labelled 'expected'."
        ),
    }


def build_index(fixtures: list[dict[str, Any]]) -> dict[str, Any]:
    """Manifest tying fixtures, scenarios and demo datasets together."""
    return {
        "synthetic": True,
        "dataset": DATASET_LABEL,
        "watermark": WATERMARK,
        "generated_by": "scripts/gen_fixtures.py",
        "reference_date": REFERENCE_DATE,
        "fx_rates_simulated": dict(FX_RATES_SIMULATED),
        "fixtures": [
            {
                "id": fx["fixture_id"],
                "file": fx["filename"],
                "ground_truth": fx["ground_truth_filename"],
                "scenarios": fx["scenarios"],
                "line_count": len(fx["lines"]),
            }
            for fx in fixtures
        ],
        "scenarios": {
            "exact_match": {
                "fixture": "fira_01_clean",
                "invoices": ["INV-2026-1001", "INV-2026-1002", "INV-2026-1003"],
            },
            "fx_variance": {
                "fixture": "fira_02_fx_variance",
                "invoices": ["INV-2026-1004", "INV-2026-1005"],
            },
            "split_payment": {
                "fixture": "fira_03_split_duplicate",
                "invoices": ["INV-2026-1007"],
                "parts": 2,
            },
            "duplicate_line": {"fixture": "fira_03_split_duplicate", "lines": [3, 4]},
            "missing_reference": {"fixture": "fira_04_missing_unmatched", "lines": [1]},
            "unmatched_line": {
                "fixture": "fira_04_missing_unmatched",
                "lines": [2],
                "missing_invoice_reference": "INV-2026-9999",
            },
            "ambiguous_invoices": {
                "fixture": "fira_05_ambiguous",
                "candidates": ["INV-2026-1009", "INV-2026-1010"],
            },
            "invoice_without_fira": {
                "invoices": ["INV-2026-1008"],
                "note": "Invoiced and paid but absent from every FIRA statement.",
            },
        },
        "expected_exceptions": {
            "engine_version": "b13.1",
            "ledger_level": build_ledger_exceptions(),
            "note": (
                "Line-level expected exceptions live in each "
                "*.ground_truth.json under 'expected_exceptions'."
            ),
        },
        "expected_purpose": {
            "engine_version": "b12.1",
            "by_invoice": {
                inv["number"]: inv["expected_purpose_code"] for inv in build_invoices()
            },
            "note": (
                "B12 oracle: the purpose code the adviser must rank first for each "
                "invoice. Also mirrored per invoice in demo_invoices.json."
            ),
        },
        "expected_edf": build_expected_edf(),
        "demo_files": {
            "invoices": "demo_invoices.json",
            "payments": "demo_payments.json",
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def write_all(out_dir: Path = DEFAULT_OUT_DIR) -> list[Path]:
    """Generate every artifact under `out_dir` and return the written paths."""
    fixtures = build_fixtures()
    written: list[Path] = []

    for fx in fixtures:
        pdf_path = out_dir / fx["filename"]
        render_fira_pdf(fx, pdf_path)
        written.append(pdf_path)
        gt_path = out_dir / fx["ground_truth_filename"]
        _write_json(gt_path, build_ground_truth(fx))
        written.append(gt_path)

    invoices_path = out_dir / "demo_invoices.json"
    _write_json(
        invoices_path,
        {"synthetic": True, "dataset": DATASET_LABEL, "invoices": build_invoices()},
    )
    written.append(invoices_path)

    payments_path = out_dir / "demo_payments.json"
    _write_json(
        payments_path,
        {
            "synthetic": True,
            "dataset": DATASET_LABEL,
            "payments": build_payments(fixtures),
        },
    )
    written.append(payments_path)

    index_path = out_dir / "index.json"
    _write_json(index_path, build_index(fixtures))
    written.append(index_path)

    return written


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic FIRA fixtures (B9)."
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="output directory (default: fixtures/synthetic)",
    )
    args = parser.parse_args()

    written = write_all(args.out)
    print(f"{WATERMARK}")
    print(f"Wrote {len(written)} files to {args.out}")
    for path in written:
        print(f"  - {path.name}")


if __name__ == "__main__":
    main()
