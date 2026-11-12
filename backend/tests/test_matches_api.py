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


def test_list_reports_by_status_for_the_corpus(client, db_session):
    _seed_ledger_and_documents(db_session)
    _run(client)
    body = client.get("/matches").json()
    assert body["count"] == 12
    assert body["by_status"] == {
        "matched": 6,
        "matched_with_variance": 2,
        "duplicate": 1,
        "exception": 1,
        "needs_review": 2,
    }


# ---- totals + pagination past the response cap -------------------------------

MATCH_STATUSES = ("matched", "matched_with_variance", "duplicate", "exception", "needs_review")


def _seed_many_matches(db_session, total: int) -> dict:
    """Insert ``total`` synthetic match records directly (distinct FIRA line ids).

    Bypasses the 12-line corpus so the tests can exercise counts past the 500-row
    response cap. Foreign keys are not enforced on the SQLite test engine.
    """
    counts = {status: 0 for status in MATCH_STATUSES}
    for index in range(total):
        status = MATCH_STATUSES[index % len(MATCH_STATUSES)]
        counts[status] += 1
        db_session.add(
            MatchRecord(
                fira_line_id=10_000 + index,
                match_type="exact",
                status=status,
                confidence_bp=9000,
                confidence_band="high",
            )
        )
    db_session.commit()
    return counts


def test_count_is_the_true_total_not_the_page_length(client, db_session):
    seeded = _seed_many_matches(db_session, 520)

    body = client.get("/matches").json()
    # `count` is the real filtered total; the page itself is capped at 200.
    assert body["count"] == 520
    assert len(body["matches"]) == 200
    # `by_status` spans every stored record, so badges stay accurate.
    assert body["by_status"] == seeded


def test_offset_pages_through_the_whole_dataset_without_overlap(client, db_session):
    _seed_many_matches(db_session, 520)

    seen: list[int] = []
    offset = 0
    while True:
        page = client.get("/matches", params={"limit": 200, "offset": offset}).json()
        assert page["count"] == 520
        ids = [row["id"] for row in page["matches"]]
        if not ids:
            break
        seen.extend(ids)
        offset += len(ids)

    assert len(seen) == 520
    assert len(set(seen)) == 520  # no page overlaps another
    assert seen == sorted(seen, reverse=True)  # globally newest first


def test_list_rejects_out_of_range_paging(client, db_session):
    _seed_many_matches(db_session, 5)
    # The backend caps one response at 500 rows and offset cannot be negative.
    assert client.get("/matches", params={"limit": 1000}).status_code == 422
    assert client.get("/matches", params={"offset": -1}).status_code == 422


def test_page_limit_never_exceeds_the_backend_maximum(client, db_session):
    _seed_many_matches(db_session, 520)
    page = client.get("/matches", params={"limit": 500}).json()
    assert page["count"] == 520
    assert len(page["matches"]) == 500


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


def test_confirm_settles_a_matched_record(client, db_session):
    """A settled record (`matched`) is eligible for the UI's confirm action.

    The endpoint is an idempotent confirmation flag; eligibility (only `matched`
    and `matched_with_variance`) is what the Matching Center checks before showing
    the button.
    """
    _seed_ledger_and_documents(db_session)
    _run(client)
    matched = client.get("/matches", params={"status": "matched"}).json()["matches"][0]
    assert matched["status"] == "matched"

    first = client.post(f"/matches/{matched['id']}/confirm")
    assert first.status_code == 200
    assert first.json()["confirmed_at"] is not None

    second = client.post(f"/matches/{matched['id']}/confirm")
    assert second.json()["confirmed_at"] == first.json()["confirmed_at"]


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
