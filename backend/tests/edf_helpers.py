"""Shared helpers for B16 EDF pack tests.

Builds the synthetic ledger (via the B11 helper) plus a synthetic exporter
identity, and exposes the B16 oracle from ``fixtures/synthetic/index.json``. All
data comes from the B9 synthetic corpus; nothing here uses real personal
information.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models import ExporterProfile, Invoice
from app.services import edf_service

from .matching_helpers import (  # noqa: F401 - re-exported for the EDF tests
    build_ledger,
    load_index,
    load_json,
)

# Fictional, complete Section 1 identity so the pack passes the blocking checks.
EXPORTER = {
    "legal_name": "Synthetic Exporter Pvt Ltd (FICTIONAL)",
    "entity_type": "company",
    "pan": "AAAAA0000A",
    "gstin": "00AAAAA0000A1Z0",
    "ad_bank_name": "Synthetic Bank of Exampleland (FICTIONAL)",
    "ad_code": "00000000000000",
    "ie_code": "SYN-IEC-0001",
    "address": "1 Synthetic Tower, Example Nagar, Bengaluru, IN",
    "sac_code": "998314",
}


def seed_exporter(db, **overrides) -> ExporterProfile:
    """Insert the synthetic exporter profile (optionally overriding a field)."""
    profile = ExporterProfile(**{**EXPORTER, **overrides})
    db.add(profile)
    db.commit()
    return profile


def seed(db, *, generate: bool = True):
    """Build the ledger + exporter and (optionally) generate the 2026-10 pack."""
    index = load_index()
    build_ledger(
        db,
        load_json(index["demo_files"]["invoices"])["invoices"],
        load_json(index["demo_files"]["payments"])["payments"],
    )
    seed_exporter(db)
    pack = edf_service.generate_pack(db, year=2026, month=10) if generate else None
    return index, pack


def expected_edf(index: dict) -> dict:
    """The B16 oracle: expected Section 2B lines and totals for 2026-10."""
    return index["expected_edf"]


def invoice_by_number(db) -> dict[str, Invoice]:
    return {inv.number: inv for inv in db.scalars(select(Invoice))}
