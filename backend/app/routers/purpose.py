"""Purpose code adviser endpoints (B12): propose, inspect and decide.

The adviser proposes RBI purpose codes for invoices; a human accepts or rejects
them. Accepting is the only action that commits ``Invoice.purpose_code``. There is
no AI, no EDF generation, no agent and no frontend here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, PurposeRecommendation
from ..rules import engine as rules_engine
from ..rules.loader import RulesConfigError
from ..services import purpose_service

router = APIRouter(tags=["purpose"])


class DecisionIn(BaseModel):
    """Optional reviewer note attached to an accept/reject decision."""

    note: str | None = None


def _iso_dt(value: datetime | None) -> str | None:
    """Serialise timestamps as UTC so re-reads (SQLite drops tzinfo) stay stable."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _loads(raw: str, fallback):
    try:
        parsed = json.loads(raw or "")
    except json.JSONDecodeError:
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def _catalog() -> dict[str, dict]:
    return {entry["code"]: entry for entry in rules_engine.list_purpose_codes()}


def recommendation_out(row: PurposeRecommendation, catalog: dict[str, dict]) -> dict:
    spec = catalog.get(row.code) or {}
    return {
        "id": row.id,
        "invoice_id": row.invoice_id,
        "code": row.code,
        "rank": row.rank,
        "confidence_bp": row.confidence_bp,
        "confidence_band": row.confidence_band,
        "source": row.source,
        "status": row.status,
        "score": _loads(row.score_json, {}),
        "matched_keywords": _loads(row.matched_keywords_json, []),
        "rationale": row.rationale,
        "code_description": spec.get("description", ""),
        "code_category": spec.get("category", ""),
        "code_verified": spec.get("verified", False),
        "engine_version": row.engine_version,
        "is_synthetic": row.is_synthetic,
        "accepted_at": _iso_dt(row.accepted_at),
        "accepted_by": row.accepted_by,
        "rejected_at": _iso_dt(row.rejected_at),
        "rejected_by": row.rejected_by,
        "decision_note": row.decision_note,
        "last_seen_at": _iso_dt(row.last_seen_at),
        "created_at": _iso_dt(row.created_at),
        "updated_at": _iso_dt(row.updated_at),
    }


def _decision(db: Session, row: PurposeRecommendation) -> dict:
    """Recommendation payload plus the (possibly just-updated) invoice purpose code."""
    invoice = db.get(Invoice, row.invoice_id)
    return {
        **recommendation_out(row, _catalog()),
        "invoice_purpose_code": invoice.purpose_code if invoice else None,
        "invoice_purpose_code_source": invoice.purpose_code_source if invoice else None,
    }


@router.post("/purpose-adviser/run")
def run_adviser(invoice_id: int | None = None, db: Session = Depends(get_db)):
    """Derive or refresh purpose-code proposals (all invoices, or one)."""
    try:
        return purpose_service.run_adviser(db, invoice_id=invoice_id)
    except RulesConfigError as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/purpose-recommendations")
def list_recommendations(
    invoice_id: int | None = None,
    code: str | None = None,
    status: str | None = None,
    band: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = purpose_service.list_recommendations(
        db, invoice_id=invoice_id, code=code, status=status, band=band, limit=limit
    )
    catalog = _catalog()
    return {
        "count": len(rows),
        "recommendations": [recommendation_out(row, catalog) for row in rows],
    }


@router.get("/purpose-recommendations/summary")
def recommendations_summary(db: Session = Depends(get_db)):
    return purpose_service.summary(db)


@router.get("/purpose-recommendations/{rec_id}")
def get_recommendation(rec_id: int, db: Session = Depends(get_db)):
    try:
        row = purpose_service.get_recommendation(db, rec_id)
    except purpose_service.PurposeNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return recommendation_out(row, _catalog())


@router.post("/purpose-recommendations/{rec_id}/accept")
def accept_recommendation(
    rec_id: int, payload: DecisionIn | None = None, db: Session = Depends(get_db)
):
    """Accept a proposal; this is the only path that sets Invoice.purpose_code."""
    note = payload.note if payload else None
    try:
        row = purpose_service.accept(db, rec_id, note=note)
    except purpose_service.PurposeNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except purpose_service.PurposeTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _decision(db, row)


@router.post("/purpose-recommendations/{rec_id}/reject")
def reject_recommendation(
    rec_id: int, payload: DecisionIn | None = None, db: Session = Depends(get_db)
):
    note = payload.note if payload else None
    try:
        row = purpose_service.reject(db, rec_id, note=note)
    except purpose_service.PurposeNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except purpose_service.PurposeTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return recommendation_out(row, _catalog())
