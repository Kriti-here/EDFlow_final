"""B16 EDF API tests: generate, list, inspect, validate, approve, revoke, export."""

from __future__ import annotations

from app.models import ExceptionRecord
from app.services import edf_service

from .edf_helpers import seed


def _generate(client, year: int = 2026, month: int = 10):
    resp = client.post("/edf-packs/generate", json={"year": year, "month": month})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_generate_endpoint_creates_draft(client, db_session):
    seed(db_session, generate=False)
    body = _generate(client)
    assert body["status"] == "draft"
    assert body["line_count"] == 10
    assert body["engine_version"] == "b16.1"
    assert body["period"] == {
        "year": 2026,
        "month": 10,
        "start": "2026-10-01",
        "end": "2026-10-31",
    }
    assert body["pack_ready"] is True
    assert (
        body["snapshot"]["section_1_general_information"]["type_of_export"] == "Service"
    )


def test_generate_is_idempotent_via_api(client, db_session):
    seed(db_session, generate=False)
    first = _generate(client)
    second = _generate(client)
    assert first["id"] == second["id"]
    assert second["line_count"] == 10


def test_list_and_summary_endpoints(client, db_session):
    seed(db_session, generate=False)
    _generate(client)
    listed = client.get("/edf-packs?year=2026&month=10")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1
    summary = client.get("/edf-packs/summary").json()
    assert summary["count"] == 1
    assert summary["by_status"] == {"draft": 1}


def test_get_pack_and_404(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    ok = client.get(f"/edf-packs/{pack_id}")
    assert ok.status_code == 200
    assert "snapshot" in ok.json()
    assert client.get("/edf-packs/999999").status_code == 404


def test_validate_endpoint(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    resp = client.post(f"/edf-packs/{pack_id}/validate")
    assert resp.status_code == 200
    assert resp.json()["pack_ready"] is True


def test_approve_endpoint_stores_snapshot_hash(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    resp = client.post(f"/edf-packs/{pack_id}/approve", json={"note": "reviewed"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert body["note"] == "reviewed"
    pack = edf_service.get_pack(db_session, pack_id)
    assert body["approved_snapshot_hash"] == edf_service.snapshot_hash(
        pack.snapshot_json
    )


def test_approve_blocked_by_open_exception_returns_409(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    db_session.add(
        ExceptionRecord(
            category="unmatched",
            severity="high",
            status="open",
            source="ledger",
            dedupe_key="api-unmatched-1",
        )
    )
    db_session.commit()
    assert _generate(client)["pack_ready"] is False
    resp = client.post(f"/edf-packs/{pack_id}/approve")
    assert resp.status_code == 409


def test_approve_non_draft_returns_409(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    assert client.post(f"/edf-packs/{pack_id}/approve").status_code == 200
    assert client.post(f"/edf-packs/{pack_id}/approve").status_code == 409


def test_revoke_endpoint(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    client.post(f"/edf-packs/{pack_id}/approve")
    resp = client.post(f"/edf-packs/{pack_id}/revoke", json={"note": "recount"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "void"


def test_export_json_sets_content_disposition(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    client.post(f"/edf-packs/{pack_id}/approve")
    resp = client.get(f"/edf-packs/{pack_id}/export?format=json")
    assert resp.status_code == 200
    assert "EDF_2026_10_b16.1.json" in resp.headers["content-disposition"]
    assert resp.json()["engine_version"] == "b16.1"


def test_export_csv_and_pdf_media_types(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    client.post(f"/edf-packs/{pack_id}/approve")
    csv_resp = client.get(f"/edf-packs/{pack_id}/export?format=csv")
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    pdf_resp = client.get(f"/edf-packs/{pack_id}/export?format=pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"


def test_export_requires_approved_returns_409(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    assert client.get(f"/edf-packs/{pack_id}/export?format=json").status_code == 409


def test_export_rejects_unknown_format(client, db_session):
    seed(db_session, generate=False)
    pack_id = _generate(client)["id"]
    resp = client.get(f"/edf-packs/{pack_id}/export?format=xml")
    assert resp.status_code == 422


def test_unknown_pack_decision_endpoints_404(client, db_session):
    seed(db_session, generate=False)
    assert client.post("/edf-packs/999999/validate").status_code == 404
    assert client.post("/edf-packs/999999/approve").status_code == 404
    assert client.post("/edf-packs/999999/revoke").status_code == 404
