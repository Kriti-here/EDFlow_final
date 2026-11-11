"""Shared helpers for B13 exception tests.

Reuses the B11 matching helpers (fixtures -> ledger -> matcher) and adds a seeder
that also runs the exception derivation. All data comes from the B9 synthetic
corpus; nothing here uses real personal information.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models import ExceptionRecord, FiraDocument, FiraLine, Invoice, Payment
from app.services import exception_service, match_service

from .matching_helpers import (  # noqa: F401 - re-exported for the exception tests
    build_ledger,
    ground_truths,
    ingest_fixtures,
    load_index,
    load_json,
)


def seed(db, *, derive: bool = True):
    """Build the ledger, ingest FIRAs, run matching and (optionally) derive exceptions."""
    index = load_index()
    build_ledger(
        db,
        load_json(index["demo_files"]["invoices"])["invoices"],
        load_json(index["demo_files"]["payments"])["payments"],
    )
    documents = ingest_fixtures(db, index)
    match_service.run_matching(db)
    summary = exception_service.derive_exceptions(db) if derive else None
    return index, documents, summary


def line_key_map(
    db, index
) -> tuple[dict[int, tuple[str, int]], dict[tuple[str, int], int]]:
    """Return (line_id -> (fixture_id, line_no)) and its inverse."""
    file_to_fixture = {f["file"]: f["id"] for f in index["fixtures"]}
    doc_file = {d.id: d.file_name for d in db.scalars(select(FiraDocument))}
    key_of_line: dict[int, tuple[str, int]] = {}
    line_ids: dict[tuple[str, int], int] = {}
    for line in db.scalars(select(FiraLine)):
        key = (file_to_fixture[doc_file[line.document_id]], line.line_no)
        key_of_line[line.id] = key
        line_ids[key] = line.id
    return key_of_line, line_ids


def exceptions_by_line(db, index) -> dict[tuple[str, int], ExceptionRecord]:
    """Map (fixture_id, line_no) -> line-level ExceptionRecord."""
    key_of_line, _ = line_key_map(db, index)
    out: dict[tuple[str, int], ExceptionRecord] = {}
    for exc in db.scalars(select(ExceptionRecord)):
        if exc.fira_line_id in key_of_line:
            out[key_of_line[exc.fira_line_id]] = exc
    return out


def invoice_numbers(db) -> dict[int, str]:
    return {inv.id: inv.number for inv in db.scalars(select(Invoice))}


def capture_ids(db) -> dict[int, str]:
    return {row.id: row.paypal_capture_id for row in db.scalars(select(Payment))}
