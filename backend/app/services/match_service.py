"""Matching orchestration (B11).

Runs the deterministic engine across *every* stored FIRA document (global scope),
persists one ``MatchRecord`` per FIRA line, and writes a hash-chained audit entry
for the run. Persistence is idempotent: re-running with the same inputs rewrites
the same decisions and preserves any human confirmation.

No AI, no network, no exception engine and no EDF generation here (AGENTS.md
rules 2 and 6). The engine itself lives in ``app/services/matching.py``.
"""

from __future__ import annotations

import json
from collections import Counter
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import FiraDocument, FiraLine, Invoice, MatchRecord, Payment, utcnow
from ..rules import engine as rules_engine
from ..rules.loader import load_rules
from . import audit, matching
from .matching import InvoiceInput, LineInput, MatchDecision, PaymentInput


class MatchNotFound(Exception):
    """Raised when a requested match record does not exist."""


# ---------------------------------------------------------------------------
# ORM -> engine inputs
# ---------------------------------------------------------------------------
def _line_inputs(db: Session) -> list[LineInput]:
    document_flags = {
        doc.id: doc.is_synthetic for doc in db.scalars(select(FiraDocument)).all()
    }
    rows = db.scalars(
        select(FiraLine).order_by(FiraLine.document_id, FiraLine.line_no)
    ).all()
    return [
        LineInput(
            id=row.id,
            document_id=row.document_id,
            line_no=row.line_no,
            invoice_reference=row.invoice_reference,
            currency=row.currency,
            gross_amount=row.gross_amount,
            net_amount_inr=row.net_amount_inr,
            value_date=row.value_date,
            remitter_name=row.remitter_name,
            remitter_country=row.remitter_country,
            utr=row.utr,
            is_synthetic=document_flags.get(row.document_id, False),
        )
        for row in rows
    ]


def _invoice_inputs(db: Session) -> list[InvoiceInput]:
    return [
        InvoiceInput(
            id=inv.id,
            number=inv.number,
            currency=inv.currency,
            amount=inv.amount,
            client_name=inv.client.name if inv.client else "",
            issue_date=inv.issue_date,
            due_date=inv.due_date,
        )
        for inv in db.scalars(select(Invoice)).all()
    ]


def _payment_inputs(db: Session) -> list[PaymentInput]:
    return [
        PaymentInput(
            id=pay.id,
            invoice_id=pay.invoice_id,
            currency=pay.currency,
            gross=pay.gross,
            net=pay.net,
        )
        for pay in db.scalars(select(Payment)).all()
    ]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _apply(
    record: MatchRecord, decision: MatchDecision, *, synthetic: bool, version: str
) -> None:
    record.invoice_id = decision.invoice_id
    record.payment_id = decision.payment_id
    record.match_type = decision.match_type
    record.status = decision.status
    record.confidence_bp = decision.confidence_bp
    record.confidence_band = decision.confidence_band
    record.candidates_json = json.dumps(decision.candidates)
    record.score_json = json.dumps(decision.score)
    record.rationale = decision.rationale
    record.duplicate_of_line_id = decision.duplicate_of_line_id
    record.split_group = decision.split_group
    record.split_part = decision.split_part
    record.split_parts_total = decision.split_parts_total
    record.fx_expected_rate = decision.fx_expected_rate
    record.fx_actual_rate = decision.fx_actual_rate
    record.fx_variance_bp = decision.fx_variance_bp
    record.engine_version = version
    record.is_synthetic = synthetic


def run_matching(
    db: Session,
    *,
    actor: str = "system",
    fx_rates: dict[str, Decimal] | None = None,
    rules: dict | None = None,
) -> dict:
    """Match every FIRA line against the ledger and persist the decisions."""
    rules = rules or load_rules()
    version = rules_engine.matching_engine_version(rules=rules)
    rates = (
        fx_rates
        if fx_rates is not None
        else rules_engine.matching_fx_rates(rules=rules)
    )

    lines = _line_inputs(db)
    decisions = matching.match_lines(
        lines,
        _invoice_inputs(db),
        _payment_inputs(db),
        rules=rules,
        fx_rates=rates,
    )
    synthetic_by_line = {line.id: line.is_synthetic for line in lines}

    existing = {
        record.fira_line_id: record for record in db.scalars(select(MatchRecord))
    }
    for decision in decisions:
        record = existing.get(decision.line_id)
        if record is None:
            record = MatchRecord(fira_line_id=decision.line_id)
            db.add(record)
        _apply(
            record,
            decision,
            synthetic=synthetic_by_line.get(decision.line_id, False),
            version=version,
        )
    db.flush()

    by_status: Counter = Counter(decision.status for decision in decisions)
    by_type: Counter = Counter(decision.match_type for decision in decisions)
    summary = {
        "engine_version": version,
        "lines": len(decisions),
        "matched": by_status.get(matching.MATCHED, 0),
        "matched_with_variance": by_status.get(matching.MATCHED_WITH_VARIANCE, 0),
        "duplicates": by_status.get(matching.DUPLICATE_STATUS, 0),
        "exceptions": by_status.get(matching.EXCEPTION, 0),
        "needs_review": by_status.get(matching.NEEDS_REVIEW, 0),
        "by_status": dict(by_status),
        "by_match_type": dict(by_type),
    }
    audit.append(db, actor, "matching.run", "match_run", version, summary)
    db.commit()
    return summary


def confirm_match(db: Session, match_id: int, *, actor: str = "user") -> MatchRecord:
    """Mark a match as human-confirmed. Idempotent: a second call is a no-op."""
    record = db.get(MatchRecord, match_id)
    if record is None:
        raise MatchNotFound(f"match record {match_id} not found")
    if record.confirmed_at is None:
        record.confirmed_at = utcnow()
        record.confirmed_by = actor
        db.flush()
        audit.append(
            db,
            actor,
            "match.confirmed",
            "match_record",
            record.id,
            {
                "fira_line_id": record.fira_line_id,
                "match_type": record.match_type,
                "status": record.status,
                "engine_version": record.engine_version,
            },
        )
        db.commit()
    return record


def list_matches(
    db: Session,
    *,
    status: str | None = None,
    match_type: str | None = None,
    document_id: int | None = None,
    limit: int = 200,
) -> list[MatchRecord]:
    """List match records, newest first, optionally filtered."""
    query = select(MatchRecord).order_by(MatchRecord.id.desc())
    if status:
        query = query.where(MatchRecord.status == status)
    if match_type:
        query = query.where(MatchRecord.match_type == match_type)
    if document_id is not None:
        query = query.join(FiraLine, FiraLine.id == MatchRecord.fira_line_id).where(
            FiraLine.document_id == document_id
        )
    return list(db.scalars(query.limit(min(max(limit, 1), 500))).all())
