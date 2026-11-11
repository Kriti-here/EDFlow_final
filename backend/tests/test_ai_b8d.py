"""Tests for B8D: the task registry and the AI task client.

Covers the two registered tasks (schema + validator + prompt_version +
task_version), deterministic scoring, and the ``ai_client`` pipeline: masking
before egress, record/replay caching, the null-provider failure, strict schema
parsing and persistence of a ``proposed`` proposal.
"""

from __future__ import annotations

import copy
import json

import pytest
from app.ai import tasks
from app.ai.ai_client import TaskOutputError, run_task
from app.ai.cache import CacheMiss, RecordReplayCache
from app.ai.provider import AIDisabled, ProviderResponse
from app.ai.schemas import ExceptionRemediation, PurposeExplanation
from app.models import AiProposal
from app.rules.loader import load_rules
from sqlalchemy import func, select


class _StubProvider:
    """A deterministic offline provider that records what it was asked."""

    name = "stub"

    def __init__(self, text: str, *, model: str = "stub-1", synthetic: bool = False):
        self._text = text
        self._model = model
        self._synthetic = synthetic
        self.requests = []

    def complete(self, request):
        self.requests.append(request)
        return ProviderResponse(
            text=self._text,
            provider=self.name,
            model=self._model,
            is_synthetic=self._synthetic,
        )


PURPOSE_CTX = {
    "purpose_code": "P1007",
    "known_purpose_codes": ["P1007", "P1008"],
    "service_description": "Consulting for buyer john.doe@example.com",
}
EXCEPTION_CTX = {
    "category": "fx_variance",
    "known_categories": ["fx_variance", "missing_reference"],
}


def _purpose_json(code: str = "P1007") -> str:
    return json.dumps(
        {
            "explanation": (
                f"Purpose code {code} applies because the service is a business "
                "consultancy export billed in USD to an overseas client."
            ),
            "key_factors": [f"code {code}", "SAC 998311", "USD invoicing"],
        }
    )


def _exception_json(category: str = "fx_variance") -> str:
    return json.dumps(
        {
            "remediation": (
                f"The {category} exception is resolved by re-checking the invoice FX "
                "rate against the FIRA line and recomputing the net amount."
            ),
            "suggested_actions": [
                f"confirm {category}",
                "recompute net amount",
                "attach rate evidence",
            ],
        }
    )


# ---- Task registry ---------------------------------------------------------


def test_task_names_are_the_two_adopters():
    assert tasks.task_names() == ("purpose_explain", "exception_remediation")


def test_get_task_binds_schema_validator_and_versions():
    spec = tasks.get_task("purpose_explain")
    assert spec.schema is PurposeExplanation
    assert spec.validator is tasks._validate_purpose_explain
    assert spec.prompt_version == tasks.PROMPT_VERSION
    assert spec.task_version == "b8.1"

    exception = tasks.get_task("exception_remediation")
    assert exception.schema is ExceptionRemediation
    assert exception.task_version == "b8.1"


def test_unknown_task_raises():
    with pytest.raises(tasks.UnknownTaskError):
        tasks.get_task("not_a_task")


def test_disabled_task_raises():
    rules = copy.deepcopy(load_rules())
    rules["ai"]["tasks"]["purpose_explain"]["enabled"] = False
    with pytest.raises(tasks.UnknownTaskError):
        tasks.get_task("purpose_explain", rules=rules)


def test_render_user_prompt_is_deterministic_and_sorted():
    assert tasks.render_user_prompt({"b": 1, "a": 2}) == "a: 2\nb: 1"


# ---- Scoring (deterministic, YAML-weighted) --------------------------------


def test_evaluate_purpose_explain_perfect_answer_scores_full():
    spec = tasks.get_task("purpose_explain")
    output = PurposeExplanation(
        explanation=("Purpose code P1007 fits the consultancy export billed in USD."),
        key_factors=["code P1007", "SAC 998311"],
    )
    checks, bp, band = tasks.evaluate(spec, output, PURPOSE_CTX)
    assert bp == 10000
    assert band == "high"
    assert all(check["ok"] for check in checks)


def test_evaluate_purpose_explain_flags_missing_code_mention():
    spec = tasks.get_task("purpose_explain")
    output = PurposeExplanation(
        explanation=(
            "This service is a consultancy export billed in USD to an overseas buyer."
        ),
        key_factors=["SAC 998311"],
    )
    checks, bp, _ = tasks.evaluate(spec, output, PURPOSE_CTX)
    assert bp == 7500  # mentions_code (2500) fails
    by_name = {check["check"]: check["ok"] for check in checks}
    assert by_name["mentions_code"] is False
    assert by_name["code_known"] is True


def test_validator_flags_echoed_pii():
    spec = tasks.get_task("purpose_explain")
    output = PurposeExplanation(
        explanation=(
            "Contact the buyer at john.doe@example.com because P1007 fits this export."
        ),
        key_factors=["code P1007"],
    )
    checks, bp, _ = tasks.evaluate(spec, output, PURPOSE_CTX)
    by_name = {check["check"]: check["ok"] for check in checks}
    assert by_name["no_pii"] is False
    assert bp == 8000  # no_pii (2000) fails


def test_evaluate_exception_remediation_scores_full():
    spec = tasks.get_task("exception_remediation")
    output = ExceptionRemediation(
        remediation=(
            "The fx_variance exception is resolved by re-checking the FIRA rate."
        ),
        suggested_actions=["confirm fx_variance", "recompute net amount"],
    )
    checks, bp, band = tasks.evaluate(spec, output, EXCEPTION_CTX)
    assert bp == 10000
    assert band == "high"
    assert all(check["ok"] for check in checks)


# ---- Client: masking, caching, parsing, persistence ------------------------


def test_client_masks_free_text_before_egress(db_session):
    stub = _StubProvider(_purpose_json())
    result = run_task(
        db_session,
        task="purpose_explain",
        target_type="invoice",
        target_id=1,
        context=PURPOSE_CTX,
        mask_fields=("service_description",),
        provider=stub,
    )
    sent = stub.requests[0]
    assert "john.doe@example.com" not in sent.user_prompt
    assert "[[EMAIL_1]]" in sent.user_prompt
    # business identifiers are deliberately not masked (B8 decision 4)
    assert "P1007" in sent.user_prompt
    assert sent.task == "purpose_explain"
    assert sent.task_version == "b8.1"
    assert sent.request_key  # a stable cache key was derived
    assert result.cache_hit is False
    assert result.confidence_bp == 10000


def test_client_parses_and_persists_a_proposed_proposal(db_session):
    stub = _StubProvider(_purpose_json())
    result = run_task(
        db_session,
        task="purpose_explain",
        target_type="invoice",
        target_id=7,
        context=PURPOSE_CTX,
        mask_fields=("service_description",),
        provider=stub,
    )
    assert result.proposal_id > 0
    row = db_session.get(AiProposal, result.proposal_id)
    assert row.status == "proposed"
    assert row.target_type == "invoice"
    assert row.target_id == 7
    assert row.engine_version == "b8.1"
    assert json.loads(row.payload_json)["key_factors"][0] == "code P1007"
    assert json.loads(row.validation_json)[0]["check"] == "code_known"


def test_client_record_then_replay_round_trip(db_session, tmp_path):
    recorder = _StubProvider(_purpose_json(), model="stub-1")
    first = run_task(
        db_session,
        task="purpose_explain",
        target_type="invoice",
        target_id=3,
        context=PURPOSE_CTX,
        mask_fields=("service_description",),
        provider=recorder,
        cache=RecordReplayCache(mode="record", cache_dir=tmp_path),
    )
    assert first.cache_hit is False
    assert any(tmp_path.iterdir())  # the answer was written to disk

    replayer = _StubProvider(_purpose_json(), model="should-not-be-called")
    second = run_task(
        db_session,
        task="purpose_explain",
        target_type="invoice",
        target_id=3,
        context=PURPOSE_CTX,
        mask_fields=("service_description",),
        provider=replayer,
        cache=RecordReplayCache(mode="replay", cache_dir=tmp_path),
    )
    assert second.cache_hit is True
    assert replayer.requests == []  # replay never calls a provider
    assert second.model == "stub-1"  # served from the recorded answer


def test_client_replay_miss_raises_and_persists_nothing(db_session, tmp_path):
    with pytest.raises(CacheMiss):
        run_task(
            db_session,
            task="purpose_explain",
            target_type="invoice",
            target_id=9,
            context=PURPOSE_CTX,
            mask_fields=("service_description",),
            cache=RecordReplayCache(mode="replay", cache_dir=tmp_path),
        )
    assert db_session.scalar(select(func.count()).select_from(AiProposal)) == 0


def test_client_without_provider_raises_ai_disabled(db_session):
    with pytest.raises(AIDisabled):
        run_task(
            db_session,
            task="purpose_explain",
            target_type="invoice",
            target_id=1,
            context=PURPOSE_CTX,
            mask_fields=("service_description",),
        )


def test_client_invalid_output_raises_and_persists_nothing(db_session):
    stub = _StubProvider("this is not json")
    with pytest.raises(TaskOutputError):
        run_task(
            db_session,
            task="purpose_explain",
            target_type="invoice",
            target_id=1,
            context=PURPOSE_CTX,
            mask_fields=("service_description",),
            provider=stub,
        )
    assert db_session.scalar(select(func.count()).select_from(AiProposal)) == 0


def test_client_runs_exception_remediation_task(db_session):
    stub = _StubProvider(_exception_json())
    result = run_task(
        db_session,
        task="exception_remediation",
        target_type="exception",
        target_id=5,
        context=EXCEPTION_CTX,
        provider=stub,
    )
    assert result.task == "exception_remediation"
    assert result.confidence_bp == 10000
    assert result.payload["suggested_actions"][0] == "confirm fx_variance"
