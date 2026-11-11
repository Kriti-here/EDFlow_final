"""Shared helpers for B12 purpose adviser tests.

Reuses the B11 matching helpers (fixtures -> ledger -> matcher) and adds a seeder
that also runs the purpose adviser. All data comes from the B9 synthetic corpus;
nothing here uses real personal information.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models import Invoice, PurposeRecommendation
from app.services import match_service, purpose_service

from .matching_helpers import (  # noqa: F401 - re-exported for the purpose tests
    build_ledger,
    ground_truths,
    ingest_fixtures,
    load_index,
    load_json,
)


def seed(db, *, run: bool = True):
    """Build the ledger, ingest FIRAs, run matching and (optionally) the adviser."""
    index = load_index()
    build_ledger(
        db,
        load_json(index["demo_files"]["invoices"])["invoices"],
        load_json(index["demo_files"]["payments"])["payments"],
    )
    documents = ingest_fixtures(db, index)
    match_service.run_matching(db)
    summary = purpose_service.run_adviser(db) if run else None
    return index, documents, summary


def corpus_pairs() -> list[tuple[str, str]]:
    """(service_description, expected_purpose_code) straight from the corpus."""
    invoices = load_json("demo_invoices.json")["invoices"]
    return [
        (inv["service_description"], inv["expected_purpose_code"]) for inv in invoices
    ]


def expected_purpose(index: dict) -> dict[str, str]:
    """invoice number -> expected top-1 purpose code (the B12 oracle)."""
    return index["expected_purpose"]["by_invoice"]


def invoice_by_number(db) -> dict[str, Invoice]:
    return {inv.number: inv for inv in db.scalars(select(Invoice))}


def recommendations_for(db, invoice_id: int) -> list[PurposeRecommendation]:
    """All recommendations for one invoice, best rank first."""
    return list(
        db.scalars(
            select(PurposeRecommendation)
            .where(PurposeRecommendation.invoice_id == invoice_id)
            .order_by(PurposeRecommendation.rank)
        )
    )


def top_by_invoice(db) -> dict[int, PurposeRecommendation]:
    """invoice_id -> its rank-1 recommendation."""
    out: dict[int, PurposeRecommendation] = {}
    for row in db.scalars(
        select(PurposeRecommendation).order_by(
            PurposeRecommendation.invoice_id, PurposeRecommendation.rank
        )
    ):
        out.setdefault(row.invoice_id, row)
    return out
