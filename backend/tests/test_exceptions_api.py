"""B13 tests: the exception HTTP API -- derive, list, summary, lifecycle and audit.

Exercises ``POST /exceptions/derive`` (global), ``GET /exceptions`` (with
filters), ``GET /exceptions/summary``, ``GET /exceptions/{id}``, the lifecycle
transitions (acknowledge / resolve / dismiss), auto-close on re-derive and the
hash-chained audit integration. All data is the synthetic B9 corpus.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import AuditLog, ExceptionRecord, MatchRecord, utcnow
from app.services import audit, exception_service

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


# ---- IST business-day boundaries ---------------------------------------------


def test_ist_day_bounds_use_the_utc_date_transition():
    # 19:00 UTC on 12 Nov is 00:30 IST on 13 Nov -> the Indian day is the 13th,
    # even though the UTC date is still the 12th.
    moment = datetime(2026, 11, 12, 19, 0, tzinfo=timezone.utc)
    since, until = exception_service._ist_day_bounds(moment)
    assert since == datetime(2026, 11, 12, 18, 30, tzinfo=timezone.utc)
    assert until == datetime(2026, 11, 13, 18, 30, tzinfo=timezone.utc)


def test_ist_day_bounds_before_the_offset_rollover():
    # 10:00 UTC on 12 Nov is 15:30 IST on 12 Nov -> the Indian day is the 12th.
    moment = datetime(2026, 11, 12, 10, 0, tzinfo=timezone.utc)
    since, until = exception_service._ist_day_bounds(moment)
    assert since == datetime(2026, 11, 11, 18, 30, tzinfo=timezone.utc)
    assert until == datetime(2026, 11, 12, 18, 30, tzinfo=timezone.utc)


def test_ist_day_bounds_start_exactly_at_ist_midnight():
    moment = datetime(2026, 11, 12, 18, 30, tzinfo=timezone.utc)  # 00:00 IST on the 13th
    since, until = exception_service._ist_day_bounds(moment)
    assert since == moment
    assert until - since == timedelta(days=1)


# ---- resolved today ----------------------------------------------------------


def _resolve(client, exception_id: int) -> None:
    assert client.post(f"/exceptions/{exception_id}/resolve").status_code == 200


def test_summary_resolved_today_uses_the_ist_business_day(client, db_session):
    seed(db_session)
    ids = _open_ids(client)
    for exception_id in ids[:3]:
        _resolve(client, exception_id)

    body = client.get("/exceptions/summary").json()
    assert body["resolved"] == 3  # all-time total preserved
    assert body["resolved_today"] == 3

    # Back-date one row to just before today's IST midnight: all-time stays 3,
    # today drops to 2.
    since, _until = exception_service._ist_day_bounds()
    db_session.get(ExceptionRecord, ids[0]).resolved_at = since - timedelta(minutes=1)
    db_session.commit()

    body = client.get("/exceptions/summary").json()
    assert body["resolved"] == 3
    assert body["resolved_today"] == 2


def test_resolved_today_splits_on_the_ist_midnight_boundary(client, db_session):
    seed(db_session)
    ids = _open_ids(client)
    _resolve(client, ids[0])
    _resolve(client, ids[1])

    since, _until = exception_service._ist_day_bounds()
    # One microsecond before IST midnight -> the previous Indian day.
    db_session.get(ExceptionRecord, ids[0]).resolved_at = since - timedelta(microseconds=1)
    # One microsecond after IST midnight -> today's Indian day.
    db_session.get(ExceptionRecord, ids[1]).resolved_at = since + timedelta(microseconds=1)
    db_session.commit()

    body = client.get("/exceptions/summary").json()
    assert body["resolved"] == 2
    assert body["resolved_today"] == 1


def test_list_resolved_since_returns_only_rows_after_the_ist_boundary(client, db_session):
    seed(db_session)
    ids = _open_ids(client)
    for exception_id in ids[:3]:
        _resolve(client, exception_id)

    # One row is yesterday's (IST); the other two stay on today.
    db_session.get(ExceptionRecord, ids[0]).resolved_at = utcnow() - timedelta(days=1)
    db_session.commit()

    since, _until = exception_service._ist_day_bounds()
    today = client.get(
        "/exceptions", params={"status": "resolved", "resolved_since": since.isoformat()}
    ).json()
    assert today["count"] == 2
    assert ids[0] not in {row["id"] for row in today["exceptions"]}
    assert all(row["status"] == "resolved" for row in today["exceptions"])

    # Without the date filter the all-time list is unchanged.
    everything = client.get("/exceptions", params={"status": "resolved"}).json()
    assert everything["count"] == 3


def test_list_resolved_until_is_an_exclusive_upper_bound(client, db_session):
    seed(db_session)
    ids = _open_ids(client)
    for exception_id in ids[:3]:
        _resolve(client, exception_id)

    since, until = exception_service._ist_day_bounds()
    # ids[0] resolved on the previous Indian day, ids[2] exactly at tomorrow's
    # IST midnight (which is exclusive), ids[1] stays inside today.
    db_session.get(ExceptionRecord, ids[0]).resolved_at = since - timedelta(minutes=1)
    db_session.get(ExceptionRecord, ids[2]).resolved_at = until
    db_session.commit()

    today = client.get(
        "/exceptions",
        params={
            "status": "resolved",
            "resolved_since": since.isoformat(),
            "resolved_until": until.isoformat(),
        },
    ).json()
    assert today["count"] == 1
    assert {row["id"] for row in today["exceptions"]} == {ids[1]}


# ---- aggregates past the 200-row page ----------------------------------------


def _seed_many_exceptions(db_session, total: int) -> dict:
    """Insert ``total`` synthetic open exceptions directly, to exceed one page."""
    severities = ("critical", "high", "medium", "low")
    counts = {severity: 0 for severity in severities}
    for index in range(total):
        severity = severities[index % len(severities)]
        counts[severity] += 1
        db_session.add(
            ExceptionRecord(
                dedupe_key=f"seed-{index}",
                category="unmatched",
                severity=severity,
                status="open",
                source="ledger",
            )
        )
    db_session.commit()
    return counts


def test_summary_aggregates_the_whole_queue_past_the_200_row_page(client, db_session):
    seeded = _seed_many_exceptions(db_session, 250)

    # The list endpoint caps a single response at 200 rows...
    page = client.get("/exceptions", params={"limit": 200}).json()
    assert len(page["exceptions"]) == 200

    # ...but the summary still aggregates all 250, over the active queue.
    body = client.get("/exceptions/summary").json()
    assert body["total"] == 250
    assert body["open"] == 250
    assert body["by_severity"] == seeded
    assert body["active_by_severity"] == seeded
    assert body["active_by_category"] == {"unmatched": 250}


def test_active_aggregates_exclude_resolved_and_dismissed(client, db_session):
    seed(db_session)
    ids = _open_ids(client)
    # Acknowledge two, resolve one, dismiss one: the active queue is open + acked.
    client.post(f"/exceptions/{ids[0]}/acknowledge")
    client.post(f"/exceptions/{ids[1]}/acknowledge")
    client.post(f"/exceptions/{ids[2]}/resolve")
    client.post(f"/exceptions/{ids[3]}/dismiss")

    body = client.get("/exceptions/summary").json()
    assert body["open"] == 6
    assert body["acknowledged"] == 2
    active = body["active_by_category"]
    assert sum(active.values()) == 8
    # The resolved/dismissed categories are absent from the active aggregate.
    assert sum(body["by_category"].values()) == 10
