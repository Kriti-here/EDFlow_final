"""Shared helpers for B11 matching tests: fixtures -> ledger -> matcher.

All data comes from the B9 synthetic corpus (``fixtures/synthetic/``); nothing
here uses real personal information.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.models import Client, FiraDocument, FiraLine, Invoice, MatchRecord, Payment
from app.services import fira_ingest

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"


def load_json(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def load_index() -> dict:
    return load_json("index.json")


def ground_truths(index: dict) -> dict[str, dict]:
    return {f["id"]: load_json(f["ground_truth"]) for f in index["fixtures"]}


def fixture_fx_rates(index: dict) -> dict[str, Decimal]:
    return {k: Decimal(v) for k, v in index["fx_rates_simulated"].items()}


def build_ledger(db, invoices: list[dict], payments: list[dict]) -> dict[str, Invoice]:
    """Insert the synthetic clients, invoices and payments; return number -> Invoice."""
    clients: dict[str, Client] = {}
    invoice_by_number: dict[str, Invoice] = {}
    for inv in invoices:
        email = inv["client_email"]
        client = clients.get(email)
        if client is None:
            client = Client(
                name=inv["client_name"],
                email=email,
                country=inv["client_country"],
                address=inv.get("client_address"),
            )
            db.add(client)
            db.flush()
            clients[email] = client
        row = Invoice(
            number=inv["number"],
            client_id=client.id,
            issue_date=date.fromisoformat(inv["issue_date"]),
            due_date=date.fromisoformat(inv["due_date"]),
            currency=inv["currency"],
            amount=Decimal(inv["amount"]),
            service_description=inv["service_description"],
            contract_ref=inv["contract_ref"],
            contract_date=(
                date.fromisoformat(inv["contract_date"])
                if inv.get("contract_date")
                else None
            ),
            sac_code=inv.get("sac_code"),
            purpose_code=inv["purpose_code"],
            status="SENT",
        )
        db.add(row)
        db.flush()
        invoice_by_number[inv["number"]] = row

    for pay in payments:
        number = pay["invoice_number"]
        invoice = invoice_by_number.get(number) if number else None
        db.add(
            Payment(
                invoice_id=invoice.id if invoice else None,
                paypal_capture_id=pay["paypal_capture_id"],
                paid_at=datetime.fromisoformat(
                    f"{pay['received_date']}T00:00:00+00:00"
                ).astimezone(timezone.utc),
                currency=pay["currency"],
                gross=Decimal(pay["gross"]),
                paypal_fee=Decimal(pay["paypal_fee"]),
                net=Decimal(pay["net"]),
                data_source="synthetic",
                raw_json="{}",
            )
        )
    db.commit()
    return invoice_by_number


def ingest_fixtures(db, index: dict) -> dict[str, FiraDocument]:
    """Ingest every synthetic FIRA PDF; return fixture id -> FiraDocument."""
    documents: dict[str, FiraDocument] = {}
    for f in index["fixtures"]:
        data = (FIXTURES_DIR / f["file"]).read_bytes()
        documents[f["id"]] = fira_ingest.ingest_document(
            db, file_name=f["file"], content_type="application/pdf", data=data
        )
    return documents


def match_map(db, index: dict) -> dict[tuple[str, int], MatchRecord]:
    """Map (fixture_id, line_no) -> MatchRecord across every stored document."""
    file_to_fixture = {f["file"]: f["id"] for f in index["fixtures"]}
    doc_file = {d.id: d.file_name for d in db.scalars(select(FiraDocument))}
    lines = {line.id: line for line in db.scalars(select(FiraLine))}
    out: dict[tuple[str, int], MatchRecord] = {}
    for record in db.scalars(select(MatchRecord)):
        line = lines[record.fira_line_id]
        fixture = file_to_fixture[doc_file[line.document_id]]
        out[(fixture, line.line_no)] = record
    return out


def line_map(db) -> dict[int, FiraLine]:
    return {line.id: line for line in db.scalars(select(FiraLine))}
