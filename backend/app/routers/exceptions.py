"""Exception endpoints (B13): derive, inspect and work the review lifecycle.

Derivation projects the current match records and ledger gaps into the exception
set; the review lifecycle (open -> acknowledged -> resolved/dismissed) is owned by
this table. There is no AI, no EDF generation, no agent and no frontend here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ExceptionRecord
from ..rules.loader import RulesConfigError
from ..services import exception_service

router = APIRouter(tags=["exceptions"])


class LifecycleIn(BaseModel):
    """Optional reviewer note attached to a lifecycle transition."""

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


def exception_out(row: ExceptionRecord) -> dict:
    return {
        "id": row.id,
        "category": row.category,
        "severity": row.severity,
        "status": row.status,
        "source": row.source,
        "dedupe_key": row.dedupe_key,
        "match_id": row.match_id,
        "fira_line_id": row.fira_line_id,
        "fira_document_id": row.fira_document_id,
        "invoice_id": row.invoice_id,
        "payment_id": row.payment_id,
        "confidence_bp": row.confidence_bp,
        "summary": row.summary,
        "details": _loads(row.details_json, {}),
        "engine_version": row.engine_version,
        "is_synthetic": row.is_synthetic,
        "acknowledged_at": _iso_dt(row.acknowledged_at),
        "acknowledged_by": row.acknowledged_by,
        "acknowledged_note": row.acknowledged_note,
        "resolved_at": _iso_dt(row.resolved_at),
        "resolved_by": row.resolved_by,
        "resolution_note": row.resolution_note,
        "dismissed_at": _iso_dt(row.dismissed_at),
        "dismissed_by": row.dismissed_by,
        "dismissed_note": row.dismissed_note,
        "last_seen_at": _iso_dt(row.last_seen_at),
        "created_at": _iso_dt(row.created_at),
        "updated_at": _iso_dt(row.updated_at),
    }


@router.post("/exceptions/derive")
def derive(db: Session = Depends(get_db)):
    """Recompute the exception set from the current matches and ledger (global)."""
    try:
        return exception_service.derive_exceptions(db)
    except RulesConfigError as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/exceptions")
def list_exceptions(
    status: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    document_id: int | None = None,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = exception_service.list_exceptions(
        db,
        status=status,
        category=category,
        severity=severity,
        document_id=document_id,
        limit=limit,
    )
    return {"count": len(rows), "exceptions": [exception_out(row) for row in rows]}


@router.get("/exceptions/summary")
def exceptions_summary(db: Session = Depends(get_db)):
    return exception_service.summary(db)


@router.get("/exceptions/{exception_id}")
def get_exception(exception_id: int, db: Session = Depends(get_db)):
    try:
        return exception_out(exception_service.get_exception(db, exception_id))
    except exception_service.ExceptionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/exceptions/{exception_id}/acknowledge")
def acknowledge_exception(
    exception_id: int, payload: LifecycleIn | None = None, db: Session = Depends(get_db)
):
    """Mark an exception acknowledged. Idempotent once acknowledged."""
    note = payload.note if payload else None
    try:
        row = exception_service.acknowledge(db, exception_id, note=note)
    except exception_service.ExceptionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except exception_service.ExceptionTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return exception_out(row)


@router.post("/exceptions/{exception_id}/resolve")
def resolve_exception(
    exception_id: int, payload: LifecycleIn | None = None, db: Session = Depends(get_db)
):
    note = payload.note if payload else None
    try:
        row = exception_service.resolve(db, exception_id, note=note)
    except exception_service.ExceptionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except exception_service.ExceptionTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return exception_out(row)


@router.post("/exceptions/{exception_id}/dismiss")
def dismiss_exception(
    exception_id: int, payload: LifecycleIn | None = None, db: Session = Depends(get_db)
):
    note = payload.note if payload else None
    try:
        row = exception_service.dismiss(db, exception_id, note=note)
    except exception_service.ExceptionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except exception_service.ExceptionTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return exception_out(row)
