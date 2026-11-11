"""HTTP API for EDF pack generation (B16).

A pack is a monthly worksheet assembled deterministically from the ledger. The
API can generate, validate, approve, revoke and export it; it never files
anything with a bank or the RBI. Exports are clearly marked as unfiled drafts.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import EDFPack
from ..rules.loader import RulesConfigError
from ..services import edf_service
from ..services.edf_service import EDFPackNotFound, EDFPackTransitionError

router = APIRouter()


class GenerateIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    note: str | None = None


class DecisionIn(BaseModel):
    note: str | None = None


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _loads(text: str) -> Any:
    return json.loads(text) if text else None


def pack_out(pack: EDFPack, *, full: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": pack.id,
        "period": {
            "year": pack.period_year,
            "month": pack.period_month,
            "start": _iso(pack.period_start),
            "end": _iso(pack.period_end),
        },
        "status": pack.status,
        "line_count": pack.line_count,
        "engine_version": pack.engine_version,
        "is_synthetic": pack.is_synthetic,
        "pack_ready": pack.pack_ready,
        "validation": _loads(pack.validation_json),
        "totals": _loads(pack.totals_json),
        "exporter": _loads(pack.exporter_snapshot_json),
        "approved_snapshot_hash": pack.approved_snapshot_hash,
        "approved_at": _iso(pack.approved_at),
        "approved_by": pack.approved_by,
        "exported_at": _iso(pack.exported_at),
        "exported_by": pack.exported_by,
        "note": pack.note,
        "created_at": _iso(pack.created_at),
        "updated_at": _iso(pack.updated_at),
    }
    if full:
        out["snapshot"] = _loads(pack.snapshot_json)
    return out


def _get(db: Session, pack_id: int) -> EDFPack:
    try:
        return edf_service.get_pack(db, pack_id)
    except EDFPackNotFound as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/edf-packs/generate")
def generate(body: GenerateIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Create or refresh the draft worksheet for a calendar month (idempotent)."""
    try:
        pack = edf_service.generate_pack(
            db, year=body.year, month=body.month, note=body.note
        )
    except EDFPackTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    except RulesConfigError as exc:
        raise HTTPException(500, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return pack_out(pack, full=True)


@router.get("/edf-packs")
def list_packs(
    year: int | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    status: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    packs = edf_service.list_packs(
        db, year=year, month=month, status=status, limit=limit
    )
    return {"count": len(packs), "packs": [pack_out(p) for p in packs]}


@router.get("/edf-packs/summary")
def summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    return edf_service.summary(db)


@router.get("/edf-packs/{pack_id}")
def get_pack(pack_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return pack_out(_get(db, pack_id), full=True)


@router.post("/edf-packs/{pack_id}/validate")
def validate(pack_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        pack = edf_service.validate_pack(db, pack_id)
    except EDFPackNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except EDFPackTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return pack_out(pack, full=True)


@router.post("/edf-packs/{pack_id}/approve")
def approve(
    pack_id: int, body: DecisionIn | None = None, db: Session = Depends(get_db)
) -> dict[str, Any]:
    try:
        pack = edf_service.approve_pack(db, pack_id, note=body.note if body else None)
    except EDFPackNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except EDFPackTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return pack_out(pack, full=True)


@router.post("/edf-packs/{pack_id}/revoke")
def revoke(
    pack_id: int, body: DecisionIn | None = None, db: Session = Depends(get_db)
) -> dict[str, Any]:
    try:
        pack = edf_service.revoke_pack(db, pack_id, note=body.note if body else None)
    except EDFPackNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except EDFPackTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return pack_out(pack, full=True)


@router.get("/edf-packs/{pack_id}/export")
def export(
    pack_id: int,
    format: str = Query("json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
) -> Response:
    """Download the approved worksheet. Never submits it anywhere."""
    try:
        doc = edf_service.export_document(db, pack_id, fmt=format)
    except EDFPackNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except EDFPackTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    headers = {"Content-Disposition": f'attachment; filename="{doc["filename"]}"'}
    if doc["format"] == "json":
        return JSONResponse(content=doc["payload"], headers=headers)
    return Response(
        content=doc["payload"], media_type=doc["media_type"], headers=headers
    )
