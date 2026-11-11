"""Tests for B8F: the AI router (run a task, review its proposals).

Exercises the HTTP surface over the B8 pipeline using the ``client`` fixture and
an overridden ``get_settings`` dependency. All provider access is stubbed or
served from an on-disk replay cache, so no test touches the network.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.ai.provider import ProviderResponse
from app.ai.providers.gemini import AIProviderError
from app.config import Settings, get_settings
from app.main import app
from app.models import AiProposal
from app.services import ai_service, audit


class _StubProvider:
    """Offline provider standing in for Gemini; counts calls to prove replay."""

    name = "gemini"

    def __init__(self, text: str):
        self._text = text
        self.calls = 0

    def complete(self, request):
        self.calls += 1
        return ProviderResponse(
            text=self._text,
            provider="gemini",
            model="gemini-2.0-flash",
            is_synthetic=True,
        )


class _BoomProvider:
    """Provider that always fails, to exercise the 503 mapping."""

    name = "gemini"

    def complete(self, request):
        raise AIProviderError("upstream exploded")


def _purpose_json(code: str = "P1007") -> str:
    return json.dumps(
        {
            "explanation": (
                f"Purpose code {code} applies because the service is a business "
                "consultancy export billed in USD to an overseas client."
            ),
            "key_factors": [f"code {code}", "SAC 998311"],
        }
    )


RUN_BODY = {
    "target_type": "invoice",
    "target_id": 1,
    "context": {
        "purpose_code": "P1007",
        "known_purpose_codes": ["P1007", "P1008"],
        "service_description": "Consulting for buyer john.doe@example.com",
    },
    "mask_fields": ["service_description"],
}


@pytest.fixture()
def ai_settings(tmp_path):
    """A ready-to-serve, offline AI configuration the router reads via get_settings."""
    s = Settings()
    s.ai_enabled = True
    s.ai_mode = "replay"
    s.ai_provider = "none"
    s.ai_cache_dir = str(tmp_path)
    s.ai_api_key = ""
    return s


@pytest.fixture()
def ai_api(client, ai_settings):
    """The TestClient with the AI settings override installed."""
    app.dependency_overrides[get_settings] = lambda: ai_settings
    yield client, ai_settings
    app.dependency_overrides.pop(get_settings, None)


def _record(db, **over) -> AiProposal:
    base = {
        "task": "purpose_explain",
        "task_version": "b8.1",
        "target_type": "invoice",
        "target_id": 1,
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "payload": {"explanation": "Because SAC 998311 fits.", "key_factors": ["SAC"]},
        "validation": [{"check": "code_known", "ok": True, "detail": ""}],
        "confidence_bp": 7500,
        "confidence_band": "high",
        "engine_version": "b8.1",
    }
    base.update(over)
    return ai_service.record_proposal(db, **base)


# ---- Gate: AI_ENABLED / AI_MODE (rule 10) -----------------------------------


def test_run_requires_ai_enabled(ai_api, monkeypatch):
    client, settings = ai_api
    settings.ai_enabled = False
    monkeypatch.setattr("app.routers.ai._build_provider", lambda s: _StubProvider("{}"))
    resp = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert resp.status_code == 503
    assert "AI_ENABLED" in resp.json()["detail"]


def test_run_requires_non_off_mode(ai_api, monkeypatch):
    client, settings = ai_api
    settings.ai_mode = "off"
    monkeypatch.setattr("app.routers.ai._build_provider", lambda s: _StubProvider("{}"))
    resp = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert resp.status_code == 503
    assert "off" in resp.json()["detail"]


def test_run_gemini_without_key_is_unavailable(ai_api):
    client, settings = ai_api
    settings.ai_provider = "gemini"
    settings.ai_api_key = ""
    resp = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert resp.status_code == 503
    assert "AI_API_KEY" in resp.json()["detail"]


# ---- Run: task registry and provider behaviour ------------------------------


def test_run_unknown_task_returns_404(ai_api):
    client, _ = ai_api
    resp = client.post("/ai/tasks/not_a_task/run", json=RUN_BODY)
    assert resp.status_code == 404


def test_run_records_then_replays_from_cache(ai_api, db_session, monkeypatch):
    client, settings = ai_api
    stub = _StubProvider(_purpose_json())
    monkeypatch.setattr("app.routers.ai._build_provider", lambda s: stub)

    settings.ai_mode = "record"
    first = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert first.status_code == 200
    body = first.json()
    assert body["task"] == "purpose_explain"
    assert body["cache_hit"] is False
    assert body["confidence_band"] == "high"
    assert stub.calls == 1

    settings.ai_mode = "replay"
    second = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert second.status_code == 200
    assert second.json()["cache_hit"] is True
    assert stub.calls == 1  # replay never calls the provider

    rows = db_session.scalars(select(AiProposal)).all()
    assert [row.status for row in rows] == [ai_service.PROPOSED]
    assert rows[0].payload_json  # the proposal is persisted and reviewable


def test_run_provider_failure_returns_503(ai_api, monkeypatch):
    client, settings = ai_api
    settings.ai_mode = "live"
    monkeypatch.setattr("app.routers.ai._build_provider", lambda s: _BoomProvider())
    resp = client.post("/ai/tasks/purpose_explain/run", json=RUN_BODY)
    assert resp.status_code == 503


# ---- Proposals: read --------------------------------------------------------


def test_list_and_filter_proposals(ai_api, db_session):
    client, _ = ai_api
    first = _record(db_session)
    second = _record(db_session, target_id=2)
    ai_service.reject(db_session, second.id, actor="user")

    resp = client.get("/ai/proposals")
    assert resp.status_code == 200
    assert resp.json()["count"] == 2

    only = client.get("/ai/proposals", params={"status": "proposed"})
    assert [p["id"] for p in only.json()["proposals"]] == [first.id]

    by_target = client.get("/ai/proposals", params={"target_id": 2})
    assert [p["id"] for p in by_target.json()["proposals"]] == [second.id]


def test_get_proposal_returns_payload(ai_api, db_session):
    client, _ = ai_api
    row = _record(db_session)
    resp = client.get(f"/ai/proposals/{row.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == row.id
    assert body["payload"]["explanation"] == "Because SAC 998311 fits."
    assert body["validation"][0]["check"] == "code_known"


def test_get_unknown_proposal_returns_404(ai_api):
    client, _ = ai_api
    assert client.get("/ai/proposals/999").status_code == 404


# ---- Proposals: human decisions ---------------------------------------------


def test_accept_proposal_is_human_controlled(ai_api, db_session):
    client, _ = ai_api
    row = _record(db_session)
    resp = client.post(f"/ai/proposals/{row.id}/accept", json={"note": "looks right"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == ai_service.ACCEPTED
    assert body["accepted_by"] == "user"
    assert body["decision_note"] == "looks right"


def test_reject_proposal(ai_api, db_session):
    client, _ = ai_api
    row = _record(db_session)
    resp = client.post(f"/ai/proposals/{row.id}/reject", json={"note": "wrong code"})
    assert resp.status_code == 200
    assert resp.json()["status"] == ai_service.REJECTED


def test_accept_twice_conflicts(ai_api, db_session):
    client, _ = ai_api
    row = _record(db_session)
    client.post(f"/ai/proposals/{row.id}/accept")
    resp = client.post(f"/ai/proposals/{row.id}/accept")
    assert resp.status_code == 409


def test_decide_unknown_proposal_returns_404(ai_api):
    client, _ = ai_api
    assert client.post("/ai/proposals/999/accept").status_code == 404


def test_accept_keeps_audit_chain_valid(ai_api, db_session):
    client, _ = ai_api
    row = _record(db_session)
    assert client.post(f"/ai/proposals/{row.id}/accept").status_code == 200
    ok, bad = audit.verify_chain(db_session)
    assert ok is True
    assert bad is None
