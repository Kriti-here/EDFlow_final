"""B12 purpose adviser API tests: derive, list, inspect, accept/reject, audit."""

from __future__ import annotations

from sqlalchemy import select

from app.models import AuditLog, Invoice, PurposeRecommendation
from app.services import audit

from .purpose_helpers import recommendations_for, seed, top_by_invoice


def _top_proposed(db) -> PurposeRecommendation:
    """The rank-1, still-proposed recommendation of the first invoice that has one."""
    for row in db.scalars(
        select(PurposeRecommendation)
        .where(
            PurposeRecommendation.rank == 1,
            PurposeRecommendation.status == "proposed",
        )
        .order_by(PurposeRecommendation.invoice_id)
    ):
        return row
    raise AssertionError("no proposed rank-1 recommendation found")


def test_run_endpoint_derives_proposals(client, db_session):
    seed(db_session, run=False)
    resp = client.post("/purpose-adviser/run")
    assert resp.status_code == 200
    body = resp.json()
    assert body["engine_version"] == "b12.1"
    assert body["invoices_scanned"] == 10
    assert body["created"] > 0


def test_run_is_idempotent(client, db_session):
    seed(db_session)  # already ran the adviser
    resp = client.post("/purpose-adviser/run")
    body = resp.json()
    assert body["created"] == 0
    assert body["updated"] > 0


def test_list_recommendations(client, db_session):
    seed(db_session)
    resp = client.get("/purpose-recommendations")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 10
    assert {"code", "confidence_bp", "confidence_band", "rank"} <= set(
        body["recommendations"][0]
    )


def test_every_invoice_has_a_rank_one(client, db_session):
    seed(db_session)
    tops = top_by_invoice(db_session)
    assert len(tops) == 10
    assert all(row.rank == 1 for row in tops.values())


def test_list_filters(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)

    by_invoice = client.get(f"/purpose-recommendations?invoice_id={top.invoice_id}")
    assert by_invoice.json()["count"] >= 1

    by_status = client.get("/purpose-recommendations?status=proposed")
    assert by_status.json()["count"] >= 10

    by_code = client.get(f"/purpose-recommendations?code={top.code}")
    assert all(rec["code"] == top.code for rec in by_code.json()["recommendations"])

    by_band = client.get("/purpose-recommendations?band=high")
    assert all(
        rec["confidence_band"] == "high" for rec in by_band.json()["recommendations"]
    )


def test_summary_endpoint(client, db_session):
    seed(db_session)
    body = client.get("/purpose-recommendations/summary").json()
    assert body["proposed"] >= 10
    assert body["total"] >= body["proposed"]


def test_get_recommendation_and_404(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    ok = client.get(f"/purpose-recommendations/{top.id}")
    assert ok.status_code == 200
    assert ok.json()["code"] == top.code
    assert "code_description" in ok.json()

    assert client.get("/purpose-recommendations/999999").status_code == 404


def test_accept_commits_invoice_purpose_code(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    invoice_id = top.invoice_id
    resp = client.post(f"/purpose-recommendations/{top.id}/accept")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["invoice_purpose_code"] == top.code
    assert body["invoice_purpose_code_source"] == "adviser_accepted"

    invoice = db_session.get(Invoice, invoice_id)
    db_session.refresh(invoice)
    assert invoice.purpose_code == top.code
    assert invoice.purpose_code_source == "adviser_accepted"

    # siblings for the same invoice are superseded, none left proposed
    for row in recommendations_for(db_session, invoice_id):
        assert row.status in {"accepted", "superseded"}

    actions = [log.action for log in db_session.scalars(select(AuditLog))]
    assert "purpose.accepted" in actions


def test_accept_is_not_repeatable(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    assert client.post(f"/purpose-recommendations/{top.id}/accept").status_code == 200
    assert client.post(f"/purpose-recommendations/{top.id}/accept").status_code == 409


def test_reject_does_not_touch_invoice(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    invoice = db_session.get(Invoice, top.invoice_id)
    before = invoice.purpose_code
    resp = client.post(f"/purpose-recommendations/{top.id}/reject", json={"note": "no"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    assert resp.json()["decision_note"] == "no"
    db_session.refresh(invoice)
    assert invoice.purpose_code == before
    assert client.post(f"/purpose-recommendations/{top.id}/reject").status_code == 409


def test_reject_then_accept_conflicts(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    client.post(f"/purpose-recommendations/{top.id}/reject")
    assert client.post(f"/purpose-recommendations/{top.id}/accept").status_code == 409


def test_decisions_on_unknown_404(client, db_session):
    seed(db_session)
    assert client.post("/purpose-recommendations/999999/accept").status_code == 404
    assert client.post("/purpose-recommendations/999999/reject").status_code == 404


def test_audit_chain_valid_after_run_and_decisions(client, db_session):
    seed(db_session)
    top = _top_proposed(db_session)
    client.post(f"/purpose-recommendations/{top.id}/accept")
    ok, bad = audit.verify_chain(db_session)
    assert ok, f"audit chain broken at {bad}"
