"""Matching endpoints (B11): run globally, inspect records, confirm a match.

Scope is exactly the B11 matching engine: no AI, no purpose-code suggestion, no
exception workflow and no EDF generation. Confirmation is a simple idempotent
flag with no resolution workflow.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import MatchRecord
from ..rules.loader import RulesConfigError
from ..services import match_service

router = APIRouter(tags=["matches"])


def _iso_dt(value: datetime | None) -> str | None:
    """Serialise timestamps as UTC so re-reads (SQLite drops tzinfo) stay stable."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _loads(raw: str, fallback):
    try:
        parsed = json.loads(raw or "")
    except json.JSONDecodeError:
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def match_out(record: MatchRecord) -> dict:
    return {
        "id": record.id,
        "fira_line_id": record.fira_line_id,
        "invoice_id": record.invoice_id,
        "payment_id": record.payment_id,
        "match_type": record.match_type,
        "status": record.status,
        "confidence_bp": record.confidence_bp,
        "confidence_band": record.confidence_band,
        "candidates": _loads(record.candidates_json, []),
        "score": _loads(record.score_json, {}),
        "rationale": record.rationale,
        "duplicate_of_line_id": record.duplicate_of_line_id,
        "split_group": record.split_group,
        "split_part": record.split_part,
        "split_parts_total": record.split_parts_total,
        "fx_expected_rate": _money(record.fx_expected_rate),
        "fx_actual_rate": _money(record.fx_actual_rate),
        "fx_variance_bp": record.fx_variance_bp,
        "engine_version": record.engine_version,
        "is_synthetic": record.is_synthetic,
        "confirmed_at": _iso_dt(record.confirmed_at),
        "confirmed_by": record.confirmed_by,
        "created_at": _iso_dt(record.created_at),
        "updated_at": _iso_dt(record.updated_at),
    }


@router.post("/matches/run")
def run_matches(db: Session = Depends(get_db)):
    """Run the deterministic matcher over every stored FIRA document (global)."""
    try:
        summary = match_service.run_matching(db)
    except RulesConfigError as exc:
        raise HTTPException(500, str(exc)) from exc
    return summary


@router.get("/matches")
def list_matches(
    status: str | None = None,
    match_type: str | None = None,
    document_id: int | None = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """One page of match records, newest first, plus the true filtered totals.

    ``count`` is the filtered total across every stored record and ``by_status``
    is its per-status breakdown, so a caller can page with ``offset`` instead of
    mistaking the capped ``matches`` page (500 max, 200 by default) for the whole
    dataset.
    """
    stats = match_service.match_stats(
        db, status=status, match_type=match_type, document_id=document_id
    )
    rows = match_service.list_matches(
        db,
        status=status,
        match_type=match_type,
        document_id=document_id,
        limit=limit,
        offset=offset,
    )
    return {
        "count": stats["count"],
        "by_status": stats["by_status"],
        "matches": [match_out(row) for row in rows],
    }


@router.get("/matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    record = db.get(MatchRecord, match_id)
    if record is None:
        raise HTTPException(404, "Match record not found")
    return match_out(record)


@router.post("/matches/{match_id}/confirm")
def confirm_match(match_id: int, db: Session = Depends(get_db)):
    """Confirm a match by id. Idempotent: re-confirming returns the same record."""
    try:
        record = match_service.confirm_match(db, match_id)
    except match_service.MatchNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return match_out(record)
