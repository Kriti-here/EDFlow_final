"""B16 EDF service tests: lifecycle, idempotency, snapshot hashing and audit.

Exercises ``app/services/edf_service.py`` against the synthetic corpus. The pack
is a worksheet: generation is deterministic and offline, approval freezes a
SHA-256 snapshot hash, and every transition is written to the audit chain.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditLog, EDFPackLine, ExceptionRecord
from app.services import audit, edf_service
from app.services.edf_service import EDFPackNotFound, EDFPackTransitionError

from .edf_helpers import seed, seed_exporter


def _open_exception(db, category: str, key: str) -> ExceptionRecord:
    row = ExceptionRecord(
        category=category,
        severity="high",
        status="open",
        source="ledger",
        dedupe_key=key,
    )
    db.add(row)
    db.commit()
    return row


def test_generate_creates_draft_pack_with_lines(db_session):
    _, pack = seed(db_session)
    assert pack.status == "draft"
    assert pack.line_count == 10
    assert pack.engine_version == "b16.1"
    assert pack.is_synthetic is True
    assert pack.period_start.isoformat() == "2026-10-01"
    assert pack.period_end.isoformat() == "2026-10-31"
    lines = db_session.scalars(
        select(EDFPackLine).where(EDFPackLine.pack_id == pack.id)
    ).all()
    assert [line.sequence for line in lines] == list(range(1, 11))


def test_generate_is_idempotent_per_month(db_session):
    _, first = seed(db_session)
    second = edf_service.generate_pack(db_session, year=2026, month=10)
    assert second.id == first.id
    assert second.line_count == 10
    # Re-generating refreshes in place; it must not duplicate the line set.
    lines = db_session.scalars(
        select(EDFPackLine).where(EDFPackLine.pack_id == first.id)
    ).all()
    assert len(lines) == 10


def test_pack_ready_when_no_blocking_failures(db_session):
    _, pack = seed(db_session)
    assert pack.pack_ready is True


def test_approve_freezes_snapshot_hash(db_session):
    _, pack = seed(db_session)
    approved = edf_service.approve_pack(db_session, pack.id)
    assert approved.status == "approved"
    assert approved.approved_at is not None
    assert approved.approved_by == "user"
    assert approved.approved_snapshot_hash == edf_service.snapshot_hash(
        pack.snapshot_json
    )
    assert len(approved.approved_snapshot_hash) == 64


def test_open_blocking_exception_prevents_approval(db_session):
    _, pack = seed(db_session)
    _open_exception(db_session, "unmatched", "test-unmatched-1")
    refreshed = edf_service.generate_pack(db_session, year=2026, month=10)
    assert refreshed.pack_ready is False
    with pytest.raises(EDFPackTransitionError):
        edf_service.approve_pack(db_session, refreshed.id)


def test_resolving_blocking_exception_allows_approval(db_session):
    _, pack = seed(db_session)
    exc = _open_exception(db_session, "unmatched", "test-unmatched-2")
    edf_service.generate_pack(db_session, year=2026, month=10)
    exc.status = "resolved"
    db_session.commit()
    refreshed = edf_service.generate_pack(db_session, year=2026, month=10)
    assert refreshed.pack_ready is True
    assert edf_service.approve_pack(db_session, refreshed.id).status == "approved"


def test_non_blocking_exception_does_not_block_approval(db_session):
    _, pack = seed(db_session)
    _open_exception(db_session, "duplicate", "test-duplicate-1")
    refreshed = edf_service.generate_pack(db_session, year=2026, month=10)
    assert refreshed.pack_ready is True


def test_cannot_regenerate_a_terminal_pack(db_session):
    _, pack = seed(db_session)
    edf_service.approve_pack(db_session, pack.id)
    with pytest.raises(EDFPackTransitionError):
        edf_service.generate_pack(db_session, year=2026, month=10)


def test_revoke_then_regenerate(db_session):
    _, pack = seed(db_session)
    edf_service.approve_pack(db_session, pack.id)
    revoked = edf_service.revoke_pack(db_session, pack.id, note="recount")
    assert revoked.status == "void"
    regenerated = edf_service.generate_pack(db_session, year=2026, month=10)
    assert regenerated.status == "draft"


def test_export_requires_approved(db_session):
    _, pack = seed(db_session)
    with pytest.raises(EDFPackTransitionError):
        edf_service.export_document(db_session, pack.id, fmt="json")


def test_export_json_filename_contains_engine_version(db_session):
    _, pack = seed(db_session)
    edf_service.approve_pack(db_session, pack.id)
    doc = edf_service.export_document(db_session, pack.id, fmt="json")
    assert doc["filename"] == "EDF_2026_10_b16.1.json"
    assert doc["format"] == "json"
    assert doc["payload"]["engine_version"] == "b16.1"


def test_export_marks_pack_exported(db_session):
    _, pack = seed(db_session)
    edf_service.approve_pack(db_session, pack.id)
    edf_service.export_document(db_session, pack.id, fmt="csv")
    db_session.refresh(pack)
    assert pack.status == "exported"
    assert pack.exported_at is not None


def test_export_csv_and_pdf_render(db_session):
    _, pack = seed(db_session)
    edf_service.approve_pack(db_session, pack.id)
    csv_doc = edf_service.export_document(db_session, pack.id, fmt="csv")
    assert csv_doc["filename"].endswith(".csv")
    assert "INV-2026-1001" in csv_doc["payload"]
    pdf_doc = edf_service.export_document(db_session, pack.id, fmt="pdf")
    assert pdf_doc["payload"][:4] == b"%PDF"


def test_get_missing_pack_raises(db_session):
    with pytest.raises(EDFPackNotFound):
        edf_service.get_pack(db_session, 999999)


def test_summary_and_list(db_session):
    seed(db_session)
    body = edf_service.summary(db_session)
    assert body["count"] == 1
    assert body["by_status"] == {"draft": 1}
    packs = edf_service.list_packs(db_session, year=2026, month=10)
    assert len(packs) == 1


def test_audit_chain_valid_across_lifecycle(db_session):
    _, pack = seed(db_session)
    edf_service.validate_pack(db_session, pack.id)
    edf_service.approve_pack(db_session, pack.id)
    edf_service.export_document(db_session, pack.id, fmt="json")
    ok, bad = audit.verify_chain(db_session)
    assert ok, f"audit chain broken at {bad}"
    actions = {log.action for log in db_session.scalars(select(AuditLog))}
    assert {
        "edf_pack.generated",
        "edf_pack.validated",
        "edf_pack.approved",
        "edf_pack.exported",
    } <= actions


def test_generate_rejects_invalid_month(db_session):
    seed_exporter(db_session)
    with pytest.raises(ValueError):
        edf_service.generate_pack(db_session, year=2026, month=13)
