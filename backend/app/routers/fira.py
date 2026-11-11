"""FIRA endpoints (B10): upload, list and read extracted FIRA statements.

Endpoints cover exactly the B10 pipeline: an uploaded PDF is validated,
extracted deterministically, verified and stored, then returned. There is no
matching, no invoice linking and no EDF generation here.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FiraDocument, FiraLine
from ..services import fira_ingest as ingest

router = APIRouter(tags=["fira"])


def _iso_date(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _iso_dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _money(value: Decimal | None) -> str | None:
    """Money is always rendered as a string; never JSON-encoded as a float."""
    return None if value is None else str(value)


def _load_issues(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def line_out(line: FiraLine) -> dict:
    return {
        "id": line.id,
        "line_no": line.line_no,
        "utr": line.utr,
        "value_date": _iso_date(line.value_date),
        "remitter_name": line.remitter_name,
        "remitter_country": line.remitter_country,
        "currency": line.currency,
        "gross_amount": _money(line.gross_amount),
        "bank_charges": _money(line.bank_charges),
        "net_amount_inr": _money(line.net_amount_inr),
        "purpose_code": line.purpose_code,
        "invoice_reference": line.invoice_reference,
        "confidence_bp": line.confidence_bp,
        "verification_status": line.verification_status,
        "issues": _load_issues(line.issues_json),
    }


def document_out(document: FiraDocument, *, include_lines: bool) -> dict:
    payload = {
        "id": document.id,
        "file_name": document.file_name,
        "content_type": document.content_type,
        "size_bytes": document.size_bytes,
        "sha256": document.sha256,
        "page_count": document.page_count,
        "fira_reference": document.fira_reference,
        "bank_name": document.bank_name,
        "ad_code": document.ad_code,
        "statement_period_start": _iso_date(document.statement_period_start),
        "statement_period_end": _iso_date(document.statement_period_end),
        "generated_on": _iso_date(document.generated_on),
        "source": document.source,
        "is_synthetic": document.is_synthetic,
        "confidence_bp": document.confidence_bp,
        "verification_status": document.verification_status,
        "line_count": document.line_count,
        "issues": _load_issues(document.issues_json),
        "created_at": _iso_dt(document.created_at),
    }
    if include_lines:
        payload["lines"] = [line_out(line) for line in document.lines]
    return payload


@router.post("/fira/documents", status_code=201)
async def upload_fira(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a FIRA PDF; extract, verify and store it. Idempotent by content hash."""
    data = await file.read()
    try:
        document = ingest.ingest_document(
            db,
            file_name=file.filename or "fira.pdf",
            content_type=file.content_type,
            data=data,
        )
    except ingest.FiraTooLargeError as exc:
        raise HTTPException(413, str(exc)) from exc
    except ingest.FiraNotPdfError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ingest.DuplicateFiraError as exc:
        raise HTTPException(
            409,
            detail={
                "message": str(exc),
                "existing_document_id": exc.existing_id,
            },
        ) from exc
    return document_out(document, include_lines=True)


@router.get("/fira/documents")
def list_fira_documents(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(FiraDocument)
        .order_by(FiraDocument.id.desc())
        .limit(min(max(limit, 1), 200))
    ).all()
    return {
        "count": len(rows),
        "documents": [document_out(row, include_lines=False) for row in rows],
    }


@router.get("/fira/documents/{document_id}")
def get_fira_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(FiraDocument, document_id)
    if document is None:
        raise HTTPException(404, "FIRA document not found")
    return document_out(document, include_lines=True)
