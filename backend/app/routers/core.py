from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, ExporterProfile
from ..services import audit

router = APIRouter()


@router.get("/healthz")
def healthz():
    return {"status": "ok"}


class ExporterIn(BaseModel):
    legal_name: str = Field(min_length=1)
    entity_type: str = "company"
    pan: str | None = None
    gstin: str | None = None
    lut_number: str | None = None
    lut_not_applicable: bool = False
    ad_bank_name: str | None = None
    # EDF Section 1 identity (B16).
    ad_code: str | None = None
    ie_code: str | None = None
    address: str | None = None
    sac_code: str | None = None


@router.put("/exporter")
def put_exporter(body: ExporterIn, db: Session = Depends(get_db)):
    ex = db.scalars(select(ExporterProfile)).first() or ExporterProfile(
        legal_name=body.legal_name
    )
    for k, v in body.model_dump().items():
        setattr(ex, k, v)
    db.add(ex)
    db.flush()
    audit.append(
        db, "user", "exporter.saved", "exporter", ex.id, {"entity_type": ex.entity_type}
    )
    db.commit()
    return {"id": ex.id, **body.model_dump()}


@router.get("/exporter")
def get_exporter(db: Session = Depends(get_db)):
    ex = db.scalars(select(ExporterProfile)).first()
    if not ex:
        raise HTTPException(404, "Exporter profile not set")
    return {c.name: getattr(ex, c.name) for c in ExporterProfile.__table__.columns}


@router.get("/audit")
def get_audit(limit: int = 100, db: Session = Depends(get_db)):
    ok, bad = audit.verify_chain(db)
    rows = db.scalars(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500))
    ).all()
    return {
        "chain_ok": ok,
        "first_bad_row": bad,
        "entries": [
            {
                "id": r.id,
                "ts": r.ts,
                "actor": r.actor,
                "action": r.action,
                "entity": r.entity,
                "entity_id": r.entity_id,
                "hash": r.hash[:12],
            }
            for r in rows
        ],
    }
