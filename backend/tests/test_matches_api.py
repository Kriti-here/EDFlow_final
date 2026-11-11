"""B11 tests: the matching HTTP API -- global run, listing, detail and confirm.

Exercises ``POST /matches/run`` (global scope), ``GET /matches`` (with filters),
``GET /matches/{id}``, ``POST /matches/{id}/confirm`` (idempotent) and the
hash-chained audit integration. All data is synthetic (B9 corpus).
"""

from __future__ import annotations

import json

from app.models import AuditLog, MatchRecord
from app.services import audit

from .matching_helpers import (
    build_ledger,
    ground_truths,
    ingest_fixtures,
    load_index,
    load_json,
)

RUN_AUDIT = "matching.run"
CONFIRM_AUDIT = "match.confirmed"


def _seed_ledger_and_documents(db_session):
    index = load_index()
    build_ledger(
        db_session,
        load_json(index["demo_files"]["invoices"])["invoices"],
        load_json(index["demo_files"]["payments"])["payments"],
    )
    documents = ingest_fixtures(db_session, index)
    return index, documents


def _run(client) -> dict:
    r = client.post("/matches/run")
    assert r.status_code == 200
    return r.json()


# ---- global run --------------------------------------------------------------


def test_run_matches_every_stored_document(client, db_session):
    _seed_ledger_and_documents(db_session)
    summary = _run(client)

    assert summary["engine_version"] == "b11.1"
    assert summary["lines"] == 12  # 3 + 2 + 4 + 2 + 1 across five fixtures
    assert summary["matched"] == 6
    assert summary["matched_with_variance"] == 2
    assert summary["duplicates"] == 1
    assert summary["exceptions"] == 1
    assert summary["needs_review"] == 2

    # one record per FIRA line, across every document
    assert db_session.query(MatchRecord).count() == 12


def test_run_is_idempotent(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    first = db_session.query(MatchRecord).count()
    _run(client)
    assert db_session.query(MatchRecord).count() == first


def test_run_writes_one_audit_entry_per_invocation(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    runs = db_session.query(AuditLog).filter(AuditLog.action == RUN_AUDIT).all()
    assert len(runs) == 1
    details = json.loads(runs[0].details_json)
    assert details["lines"] == 12
    assert runs[0].actor == "system"


# ---- listing + filtering -----------------------------------------------------


def test_list_returns_every_match_newest_first(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    body = client.get("/matches").json()
    assert body["count"] == 12
    ids = [m["id"] for m in body["matches"]]
    assert ids == sorted(ids, reverse=True)


def test_list_filters_by_match_type_and_status(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    splits = client.get("/matches", params={"match_type": "split"}).json()
    assert splits["count"] == 2
    assert all(m["match_type"] == "split" for m in splits["matches"])

    review = client.get("/matches", params={"status": "needs_review"}).json()
    assert review["count"] == 2
    assert all(m["status"] == "needs_review" for m in review["matches"])


def test_list_filters_by_document(client, db_session):
    _index, documents = _seed_ledger_and_documents(db_session)
    _run(client)
    doc = documents["fira_03_split_duplicate"]
    body = client.get("/matches", params={"document_id": doc.id}).json()
    assert body["count"] == 4


# ---- detail ------------------------------------------------------------------


def test_get_match_returns_full_decision(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    listed = client.get("/matches", params={"match_type": "fx_variance"}).json()
    match_id = listed["matches"][0]["id"]

    r = client.get(f"/matches/{match_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["match_type"] == "fx_variance"
    assert body["status"] == "matched_with_variance"
    assert body["engine_version"] == "b11.1"
    assert body["is_synthetic"] is True
    assert body["fx_expected_rate"] is not None
    assert body["fx_actual_rate"] is not None
    assert body["fx_variance_bp"] is not None
    assert body["confirmed_at"] is None


def test_get_unknown_match_is_404(client, db_session):
    assert client.get("/matches/999999").status_code == 404


# ---- confirm (idempotent) ----------------------------------------------------


def test_confirm_marks_record_and_is_idempotent(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    match_id = client.get("/matches").json()["matches"][0]["id"]

    first = client.post(f"/matches/{match_id}/confirm")
    assert first.status_code == 200
    assert first.json()["confirmed_at"] is not None
    assert first.json()["confirmed_by"] == "user"

    second = client.post(f"/matches/{match_id}/confirm")
    assert second.json()["confirmed_at"] == first.json()["confirmed_at"]

    # exactly one confirmation audit entry despite two calls
    confirms = db_session.query(AuditLog).filter(AuditLog.action == CONFIRM_AUDIT).all()
    assert len(confirms) == 1


def test_confirm_unknown_match_is_404(client, db_session):
    assert client.post("/matches/999999/confirm").status_code == 404


# ---- audit integrity ---------------------------------------------------------


def test_audit_chain_valid_after_run_and_confirm(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    match_id = client.get("/matches").json()["matches"][0]["id"]
    client.post(f"/matches/{match_id}/confirm")

    ok, bad = audit.verify_chain(db_session)
    assert ok is True
    assert bad is None


def test_ground_truths_are_synthetic_corpus(db_session):
    # sanity: the oracle used by the accuracy test is the synthetic B9 corpus
    index = load_index()
    truths = ground_truths(index)
    assert len(truths) == 5
    assert all(gt["synthetic"] is True for gt in truths.values())
