"""FIRA ingestion orchestration for B10.

Coordinates the whole pipeline for one uploaded statement:

    validate bytes -> detect duplicate (sha256) -> extract -> verify
    -> persist (FiraDocument + FiraLine) -> audit log

Every run writes an entry to the hash-chained audit log (AGENTS.md rule 2), and
duplicate uploads are rejected by content hash so the same statement is never
stored twice.

AI seam (future only): a later phase may add an LLM extractor between extract and
verify. It is NOT implemented here, and any proposal it produced would still have
to pass `fira_verify.verify_document` before it could be persisted.
"""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import FiraDocument, FiraLine
from . import audit
from .fira_extract import FiraExtractionError, extract_bytes
from .fira_verify import VerifiedDocument, verify_document

PDF_MAGIC = b"%PDF-"


class FiraUploadError(Exception):
    """Base class for rejected uploads."""


class FiraTooLargeError(FiraUploadError):
    """The upload exceeds the configured size cap."""


class FiraNotPdfError(FiraUploadError):
    """The bytes are not a readable PDF."""


class DuplicateFiraError(FiraUploadError):
    """A document with the same content hash already exists."""

    def __init__(self, existing_id: int):
        super().__init__("This FIRA document has already been uploaded")
        self.existing_id = existing_id


def _extract_and_verify(data: bytes) -> VerifiedDocument:
    settings = get_settings()
    try:
        extracted = extract_bytes(data)
    except FiraExtractionError as exc:
        raise FiraNotPdfError(str(exc)) from exc
    return verify_document(
        extracted, threshold_bp=settings.fira_confidence_threshold_bp
    )


def _persist(
    db: Session,
    *,
    file_name: str,
    content_type: str | None,
    data: bytes,
    digest: str,
    verified: VerifiedDocument,
) -> FiraDocument:
    document = FiraDocument(
        file_name=file_name,
        content_type=content_type,
        size_bytes=len(data),
        sha256=digest,
        content=data,
        page_count=verified.page_count,
        fira_reference=verified.fira_reference,
        bank_name=verified.bank_name,
        ad_code=verified.ad_code,
        statement_period_start=verified.statement_period_start,
        statement_period_end=verified.statement_period_end,
        generated_on=verified.generated_on,
        source="deterministic",
        confidence_bp=verified.confidence_bp,
        verification_status=verified.verification_status,
        is_synthetic=verified.is_synthetic,
        line_count=verified.line_count,
        issues_json=json.dumps(verified.issues),
        raw_json=json.dumps(
            {
                "confidence_threshold_bp": get_settings().fira_confidence_threshold_bp,
                "extraction_source": "deterministic",
            }
        ),
    )
    db.add(document)
    db.flush()

    for line in verified.lines:
        db.add(
            FiraLine(
                document_id=document.id,
                line_no=line.line_no,
                utr=line.utr,
                value_date=line.value_date,
                remitter_name=line.remitter_name,
                remitter_country=line.remitter_country,
                currency=line.currency,
                gross_amount=line.gross_amount,
                bank_charges=line.bank_charges,
                net_amount_inr=line.net_amount_inr,
                purpose_code=line.purpose_code,
                invoice_reference=line.invoice_reference,
                confidence_bp=line.confidence_bp,
                verification_status=line.verification_status,
                issues_json=json.dumps(line.issues),
                raw_text=line.raw_text,
            )
        )
    db.flush()
    return document


def ingest_document(
    db: Session,
    *,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor: str = "user",
) -> FiraDocument:
    """Validate, extract, verify, store and audit one uploaded FIRA PDF.

    Raises ``FiraTooLargeError``, ``FiraNotPdfError`` or ``DuplicateFiraError``.
    """
    settings = get_settings()
    if not data:
        raise FiraNotPdfError("Uploaded file is empty")
    if len(data) > settings.fira_max_upload_bytes:
        raise FiraTooLargeError(
            f"Upload exceeds the {settings.fira_max_upload_bytes} byte limit"
        )
    if not data.startswith(PDF_MAGIC):
        raise FiraNotPdfError("Uploaded file is not a PDF")

    digest = hashlib.sha256(data).hexdigest()
    existing = db.scalars(
        select(FiraDocument).where(FiraDocument.sha256 == digest)
    ).first()
    if existing is not None:
        raise DuplicateFiraError(existing.id)

    verified = _extract_and_verify(data)
    document = _persist(
        db,
        file_name=file_name,
        content_type=content_type,
        data=data,
        digest=digest,
        verified=verified,
    )
    audit.append(
        db,
        actor,
        "fira.document_ingested",
        "fira_document",
        document.id,
        {
            "sha256": digest,
            "file_name": file_name,
            "line_count": verified.line_count,
            "verification_status": verified.verification_status,
            "confidence_bp": verified.confidence_bp,
            "is_synthetic": verified.is_synthetic,
        },
    )
    db.commit()
    db.refresh(document)
    return document
