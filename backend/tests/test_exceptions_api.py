"""B13 tests: the exception HTTP API -- derive, list, summary, lifecycle and audit.

Exercises ``POST /exceptions/derive`` (global), ``GET /exceptions`` (with
filters), ``GET /exceptions/summary``, ``GET /exceptions/{id}``, the lifecycle
transitions (acknowledge / resolve / dismiss), auto-close on re-derive and the
hash-chained audit integration. All data is the synthetic B9 corpus.
"""

from __future__ import annotations

import json

from sqlalchemy import select

from app.models import AuditLog, ExceptionRecord, MatchRecord
from app.services import audit

from .exception_helpers import seed

DERIVE_AUDIT = "exceptions.derive"
AUTO_CLOSE_AUDIT = "exception.auto_closed"


def _derive(client) -> dict:
    r = client.post("/exceptions/derive")
    assert r.status_code == 200
    return r.json()


# ---- derive ------------------------------------------------------------------


def test_derive_returns_global_summary(client, db_session):
    seed(db_session, derive=False)
    summary = _derive(client)

    assert summary["engine_version"] == "b13.1"
    # 6 line-level (2 fx_variance, 1 duplicate, 1 missing_reference, 1 unmatched,
    # 1 ambiguous) + 4 ledger-level (1 missing_fira, 3 orphan_payment)
    assert summary["total"] == 10
    assert summary["created"] == 10
    assert summary["auto_closed"] == 0
    assert summary["by_category"] == {
        "ambiguous": 1,
        "duplicate": 1,
        "fx_variance": 2,
        "missing_fira": 1,
        "missing_reference": 1,
        "orphan_payment": 3,
        "unmatched": 1,
    }
    assert summary["by_severity"] == {"low": 2, "medium": 6, "high": 2}
    assert db_session.query(ExceptionRecord).count() == 10


def test_derive_is_idempotent(client, db_session):
    seed(db_session, derive=False)
    _derive(client)
    again = _derive(client)

    assert again["total"] == 10
    assert again["created"] == 0
    assert again["auto_closed"] == 0
    assert db_session.query(ExceptionRecord).count() == 10


def test_derive_writes_one_run_audit_entry_per_invocation(client, db_session):
    seed(db_session, derive=False)
    _derive(client)
    _derive(client)
    runs = db_session.query(AuditLog).filter(AuditLog.action == DERIVE_AUDIT).all()
    assert len(runs) == 2
    assert runs[0].actor == "system"
    assert json.loads(runs[0].details_json)["total"] == 10


# ---- reads -------------------------------------------------------------------


def test_list_returns_every_exception_newest_first(client, db_session):
    seed(db_session, derive=False)
    _derive(client)
    body = client.get("/exceptions").json()
    assert body["count"] == 10
    ids = [row["id"] for row in body["exceptions"]]
    assert ids == sorted(ids, reverse=True)


def test_list_filters_by_category_severity_and_status(client, db_session):
    seed(db_session, derive=False)
    _derive(client)

    orphans = client.get("/exceptions", params={"category": "orphan_payment"}).json()
    assert orphans["count"] == 3
    assert all(row["category"] == "orphan_payment" for row in orphans["exceptions"])

    low = client.get("/exceptions", params={"severity": "low"}).json()
    assert low["count"] == 2
    assert all(row["severity"] == "low" for row in low["exceptions"])

    open_rows = client.get("/exceptions", params={"status": "open"}).json()
    assert open_rows["count"] == 10


def test_summary_endpoint_aggregates_counts(client, db_session):
    seed(db_session, derive=False)
    _derive(client)
    body = client.get("/exceptions/summary").json()
    assert body["total"] == 10
    assert body["open"] == 10
    assert body["resolved"] == 0
    assert body["by_severity"]["high"] == 2


def test_get_exception_returns_full_record(client, db_session):
    seed(db_session)
    listed = client.get("/exceptions", params={"category": "fx_variance"}).json()
    exception_id = listed["exceptions"][0]["id"]

    body = client.get(f"/exceptions/{exception_id}").json()
    assert body["category"] == "fx_variance"
    assert body["engine_version"] == "b13.1"
    assert body["is_synthetic"] is True
    assert body["status"] == "open"
    assert body["source"] == "match_record"
    assert body["fira_document_id"] is not None


def test_get_unknown_exception_is_404(client, db_session):
    assert client.get("/exceptions/999999").status_code == 404


# ---- lifecycle ---------------------------------------------------------------


def _open_ids(client) -> list[int]:
    return [row["id"] for row in client.get("/exceptions").json()["exceptions"]]


def test_lifecycle_transitions_and_audit(client, db_session):
    seed(db_session)
    first, second, third = _open_ids(client)[:3]

    acked = client.post(f"/exceptions/{first}/acknowledge", json={"note": "looking"})
    assert acked.status_code == 200
    assert acked.json()["status"] == "acknowledged"
    assert acked.json()["acknowledged_by"] == "user"
    assert acked.json()["acknowledged_note"] == "looking"

    resolved = client.post(f"/exceptions/{second}/resolve", json={"note": "done"})
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_by"] == "user"
    assert resolved.json()["resolution_note"] == "done"

    dismissed = client.post(f"/exceptions/{third}/dismiss")
    assert dismissed.json()["status"] == "dismissed"
    assert dismissed.json()["dismissed_by"] == "user"

    actions = {row.action for row in db_session.scalars(select(AuditLog))}
    assert {
        "exception.acknowledged",
        "exception.resolved",
        "exception.dismissed",
    } <= actions


def test_acknowledge_is_idempotent(client, db_session):
    seed(db_session)
    exception_id = _open_ids(client)[0]
    client.post(f"/exceptions/{exception_id}/acknowledge")
    again = client.post(f"/exceptions/{exception_id}/acknowledge")
    assert again.status_code == 200
    assert again.json()["status"] == "acknowledged"
    acks = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "exception.acknowledged")
        .all()
    )
    assert len(acks) == 1


def test_closed_exception_rejects_further_transitions(client, db_session):
    seed(db_session)
    exception_id = _open_ids(client)[0]
    client.post(f"/exceptions/{exception_id}/resolve")
    assert client.post(f"/exceptions/{exception_id}/acknowledge").status_code == 409
    assert client.post(f"/exceptions/{exception_id}/dismiss").status_code == 409


def test_unknown_exception_transition_is_404(client, db_session):
    seed(db_session)
    assert client.post("/exceptions/999999/resolve").status_code == 404


# ---- auto-close --------------------------------------------------------------


def test_auto_close_when_condition_disappears(client, db_session):
    seed(db_session)
    listed = client.get("/exceptions", params={"category": "unmatched"}).json()
    assert listed["count"] == 1
    exception_id = listed["exceptions"][0]["id"]
    dedupe_key = listed["exceptions"][0]["dedupe_key"]

    # Remove the condition: the line now resolves cleanly, so it is no longer unmatched.
    match_id = listed["exceptions"][0]["match_id"]
    record = db_session.get(MatchRecord, match_id)
    record.match_type = "exact"
    record.status = "matched"
    db_session.commit()

    summary = _derive(client)
    assert summary["auto_closed"] == 1
    assert summary["total"] == 9

    row = db_session.get(ExceptionRecord, exception_id)
    assert row.status == "resolved"
    assert row.resolved_by == "system"
    assert row.resolution_note == "Condition no longer present"

    closes = (
        db_session.query(AuditLog).filter(AuditLog.action == AUTO_CLOSE_AUDIT).all()
    )
    assert len(closes) == 1
    details = json.loads(closes[0].details_json)
    assert details["reason"] == "Condition no longer present"
    assert closes[0].entity_id == dedupe_key


def test_condition_reappearing_reopens_system_closed_exception(client, db_session):
    seed(db_session)
    listed = client.get("/exceptions", params={"category": "unmatched"}).json()
    exception_id = listed["exceptions"][0]["id"]
    match_id = listed["exceptions"][0]["match_id"]

    # Disappear -> auto-close.
    record = db_session.get(MatchRecord, match_id)
    record.match_type = "exact"
    db_session.commit()
    _derive(client)
    assert db_session.get(ExceptionRecord, exception_id).status == "resolved"

    # Reappear -> re-open (still a system-owned lifecycle).
    record.match_type = "unmatched"
    db_session.commit()
    summary = _derive(client)
    assert summary["reopened"] == 1
    assert db_session.get(ExceptionRecord, exception_id).status == "open"


# ---- audit integrity ---------------------------------------------------------


def test_audit_chain_valid_after_derive_and_lifecycle(client, db_session):
    seed(db_session)
    exception_id = _open_ids(client)[0]
    client.post(f"/exceptions/{exception_id}/acknowledge")
    client.post("/exceptions/derive")

    ok, bad = audit.verify_chain(db_session)
    assert ok is True
    assert bad is None
