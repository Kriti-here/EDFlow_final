"""Tests for B8C: AiProposal persistence and review lifecycle.

Covers proposal persistence, idempotency, the proposed/accepted/rejected/failed/
superseded transitions, the human-approval guard, the optional deterministic
apply hook and the hash-chained audit integration (ai.proposed/accepted/rejected/
failed/superseded).
"""

from __future__ import annotations

import json

import pytest
from app.models import AiProposal, AuditLog
from app.services import ai_service, audit
from sqlalchemy import func, select


def _record(db, **over) -> AiProposal:
    base = {
        "task": "purpose_explain",
        "task_version": "b8.1",
        "target_type": "invoice",
        "target_id": 1,
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "payload": {"explanation": "Because SAC 998311 fits.", "key_factors": ["SAC"]},
        "validation": [{"check": "code_known", "ok": True}],
        "confidence_bp": 7000,
        "confidence_band": "high",
        "engine_version": "b8.1",
    }
    base.update(over)
    return ai_service.record_proposal(db, **base)


def _actions(db) -> list[str]:
    return [row.action for row in db.scalars(select(AuditLog).order_by(AuditLog.id))]


# ---- Persistence ------------------------------------------------------------


def test_record_persists_proposed_and_audits(db_session):
    row = _record(db_session)
    assert row.id is not None
    assert row.status == ai_service.PROPOSED
    assert json.loads(row.payload_json)["explanation"] == "Because SAC 998311 fits."
    assert json.loads(row.validation_json) == [{"check": "code_known", "ok": True}]
    assert row.confidence_bp == 7000
    assert row.cache_hit is False
    assert "ai.proposed" in _actions(db_session)


def test_dedupe_key_is_stable():
    key = ai_service.dedupe_key(
        task="purpose_explain", target_type="invoice", target_id=7, task_version="b8.1"
    )
    assert key == "purpose_explain|invoice|7|b8.1"


def test_record_is_idempotent_by_identity(db_session):
    first = _record(db_session)
    second = _record(db_session, payload={"explanation": "Updated."})
    assert first.id == second.id
    assert db_session.scalar(select(func.count()).select_from(AiProposal)) == 1
    assert second.status == ai_service.PROPOSED
    assert json.loads(second.payload_json)["explanation"] == "Updated."


def test_record_never_overwrites_a_human_decision(db_session):
    row = _record(db_session)
    ai_service.accept(db_session, row.id, actor="alice")
    again = _record(db_session, payload={"explanation": "Different."})
    assert again.status == ai_service.ACCEPTED
    assert json.loads(again.payload_json)["explanation"] == "Because SAC 998311 fits."


# ---- Lifecycle --------------------------------------------------------------


def test_accept_calls_apply_and_records_decision(db_session):
    row = _record(db_session)
    seen: list[int] = []

    def apply(db, accepted):
        seen.append(accepted.id)

    ai_service.accept(
        db_session, row.id, actor="alice", note="looks right", apply=apply
    )
    assert seen == [row.id]
    assert row.status == ai_service.ACCEPTED
    assert row.accepted_by == "alice"
    assert row.decision_note == "looks right"
    assert row.accepted_at is not None
    assert "ai.accepted" in _actions(db_session)


def test_accept_without_apply_is_allowed(db_session):
    row = _record(db_session)
    ai_service.accept(db_session, row.id, actor="bob")
    assert row.status == ai_service.ACCEPTED


def test_reject_sets_status_and_blocks_further_decisions(db_session):
    row = _record(db_session)
    ai_service.reject(db_session, row.id, actor="carol", note="wrong code")
    assert row.status == ai_service.REJECTED
    assert row.rejected_by == "carol"
    assert "ai.rejected" in _actions(db_session)
    with pytest.raises(ai_service.AiProposalTransitionError):
        ai_service.accept(db_session, row.id, actor="carol")


def test_mark_failed_sets_reason_and_blocks_accept(db_session):
    row = _record(db_session)
    ai_service.mark_failed(db_session, row.id, reason="schema mismatch")
    assert row.status == ai_service.FAILED
    assert row.failed_reason == "schema mismatch"
    assert "ai.failed" in _actions(db_session)
    with pytest.raises(ai_service.AiProposalTransitionError):
        ai_service.accept(db_session, row.id, actor="dave")


def test_supersede_marks_proposal(db_session):
    row = _record(db_session)
    ai_service.supersede(db_session, row.id, actor="system")
    assert row.status == ai_service.SUPERSEDED
    assert "ai.superseded" in _actions(db_session)


def test_unknown_proposal_raises(db_session):
    with pytest.raises(ai_service.AiProposalNotFound):
        ai_service.accept(db_session, 999, actor="x")


def test_apply_failure_is_not_committed(db_session):
    row = _record(db_session)

    def boom(db, accepted):
        raise RuntimeError("deterministic apply refused")

    with pytest.raises(RuntimeError):
        ai_service.accept(db_session, row.id, actor="x", apply=boom)
    db_session.rollback()
    reloaded = db_session.get(AiProposal, row.id)
    assert reloaded.status == ai_service.PROPOSED  # decision never committed


# ---- Audit + reads ----------------------------------------------------------


def test_audit_chain_stays_valid_across_lifecycle(db_session):
    first = _record(db_session)
    second = _record(db_session, target_id=2)
    ai_service.accept(db_session, first.id, actor="alice")
    ai_service.reject(db_session, second.id, actor="bob")
    ok, bad = audit.verify_chain(db_session)
    assert ok is True
    assert bad is None


def test_list_proposals_filters(db_session):
    first = _record(db_session)
    second = _record(db_session, target_id=2)
    ai_service.reject(db_session, second.id, actor="bob")

    proposed = ai_service.list_proposals(db_session, status=ai_service.PROPOSED)
    assert [row.id for row in proposed] == [first.id]

    by_target = ai_service.list_proposals(db_session, target_id=2)
    assert [row.id for row in by_target] == [second.id]
