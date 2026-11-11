"""AI task client: the single orchestration point for running a named AI task (B8D).

This is the only module that wires the B8 pieces together for one run, in the
fixed order required by AGENTS.md:

    mask (rule 5) -> cache/replay (rules 7, 10) -> provider egress (rule 2)
    -> strict schema parse (rule 2) -> deterministic verification (rule 2)
    -> persist as a proposal (never applied automatically, rule 2)

It contains no provider implementation, no Gemini code, no router and no HTTP
endpoint. It never mutates a business record: the result is always a ``proposed``
``AiProposal`` that a human must still accept through ``app.services.ai_service``.
Masking is not optional -- free-text fields are routed through a ``Masker`` before
they can reach a provider, and the task registry's ``no_pii`` check re-verifies the
answer. ``replay`` never calls a provider and never falls back to the network.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..rules import engine as rules_engine
from ..services import ai_service
from . import tasks
from .cache import RecordReplayCache, cache_key
from .pii import Masker
from .provider import LLMProvider, ProviderRequest, ProviderResponse
from .providers.null import NullProvider


class TaskOutputError(ValueError):
    """Raised when a provider answer is not valid JSON for the task's schema."""


@dataclass(frozen=True)
class TaskRunResult:
    """One completed task run: the persisted proposal plus its verification."""

    task: str
    task_version: str
    prompt_version: str
    provider: str
    model: str
    cache_hit: bool
    is_synthetic: bool
    payload: dict[str, Any]
    checks: list[dict[str, Any]]
    confidence_bp: int
    confidence_band: str
    proposal_id: int


def _build_masker(config: Mapping[str, Any], masker: Masker | None) -> Masker:
    """Use the injected masker, or build one from the YAML detector set (rule 6)."""
    if masker is not None:
        return masker
    pii = config["pii"]
    return Masker(
        placeholder_format=pii["placeholder_format"], detectors=pii["detectors"]
    )


def _mask_free_text(
    context: Mapping[str, Any], fields: Sequence[str], masker: Masker
) -> dict[str, Any]:
    """Mask the named free-text fields so no PII can leave the process (rule 5).

    Structured business identifiers (AD/IEC/SAC/purpose/currency codes) are never
    listed here and therefore stay visible (B8 decision 4).
    """
    masked = dict(context)
    for field in fields:
        value = masked.get(field)
        if isinstance(value, str):
            masked[field] = masker.mask_text(value)
    return masked


def _respond(
    request: ProviderRequest,
    *,
    provider: LLMProvider | None,
    cache: RecordReplayCache | None,
) -> tuple[ProviderResponse, bool]:
    """Serve from the cache when possible, else call the provider (rule 2/7/10).

    In ``replay`` mode a miss raises ``CacheMiss`` from ``cache.get`` so a replay
    run can never silently fall back to a live call. With no provider configured
    the null provider raises ``AIDisabled``, failing loudly instead of fabricating.
    """
    if cache is not None:
        cached = cache.get(request)
        if cached is not None:
            return cached, True
    active = provider or NullProvider()
    response = active.complete(request)
    if cache is not None:
        cache.put(request, response)
    return response, False


def _parse(spec: tasks.TaskSpec, response: ProviderResponse):
    """Parse the answer with the task's strict schema (rule 2)."""
    try:
        return spec.schema.model_validate_json(response.text)
    except ValidationError as e:
        raise TaskOutputError(f"{spec.name}: invalid provider output: {e}") from e


def run_task(
    db: Session,
    *,
    task: str,
    target_type: str,
    target_id: int,
    context: Mapping[str, Any],
    mask_fields: Sequence[str] = (),
    provider: LLMProvider | None = None,
    cache: RecordReplayCache | None = None,
    masker: Masker | None = None,
    rules: dict[str, Any] | None = None,
    actor: str = "system",
) -> TaskRunResult:
    """Run one named AI task and persist the result as a ``proposed`` proposal.

    ``context`` is the task input; keys in ``mask_fields`` are free text and are
    masked before egress, while the remaining keys are structured business data
    that stays visible. ``provider``/``cache``/``masker`` are injectable so tests
    can run fully offline. The returned ``AiProposal`` is never applied -- a human
    must still accept it.
    """
    spec = tasks.get_task(task, rules=rules)
    config = rules_engine.ai_config(rules=rules)
    limits = config["limits"]

    masked_context = _mask_free_text(
        context, mask_fields, _build_masker(config, masker)
    )
    request = ProviderRequest(
        task=spec.name,
        task_version=spec.task_version,
        system_prompt=spec.system_prompt,
        user_prompt=tasks.render_user_prompt(masked_context),
        temperature=limits["temperature"],
        max_output_tokens=limits["max_output_tokens"],
    )
    # The key covers only the masked input, so identical input always replays.
    request = replace(request, request_key=cache_key(request))

    response, cache_hit = _respond(request, provider=provider, cache=cache)

    output = _parse(spec, response)
    checks, confidence_bp, confidence_band = tasks.evaluate(
        spec, output, masked_context
    )

    proposal = ai_service.record_proposal(
        db,
        task=spec.name,
        task_version=spec.task_version,
        target_type=target_type,
        target_id=target_id,
        provider=response.provider,
        model=response.model,
        payload=output.model_dump(),
        validation=checks,
        confidence_bp=confidence_bp,
        confidence_band=confidence_band,
        engine_version=rules_engine.ai_engine_version(rules=rules),
        cache_hit=cache_hit,
        is_synthetic=response.is_synthetic,
        actor=actor,
    )
    return TaskRunResult(
        task=spec.name,
        task_version=spec.task_version,
        prompt_version=spec.prompt_version,
        provider=response.provider,
        model=response.model,
        cache_hit=cache_hit,
        is_synthetic=response.is_synthetic,
        payload=output.model_dump(),
        checks=checks,
        confidence_bp=confidence_bp,
        confidence_band=confidence_band,
        proposal_id=proposal.id,
    )
