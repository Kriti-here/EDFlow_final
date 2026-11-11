"""AI layer endpoints (B8F): run a task and review its proposals.

A thin HTTP surface over the B8 pipeline. ``POST /ai/tasks/{task}/run`` delegates
to ``app.ai.ai_client`` (mask -> cache/provider -> validate -> persist a
proposal); review delegates to ``app.services.ai_service``. Nothing here applies a
proposal automatically: ``accept``/``reject`` are explicit human decisions
(AGENTS.md rule 2) and every one is written to the hash-chained audit log.

There is no generic chat, no agent, no FIRA extraction and no frontend here. The
router is inert unless ``AI_ENABLED`` is true and ``AI_MODE`` is not ``off``
(rule 10: the AI layer is off by default).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai import ai_client, tasks
from ..ai.cache import CacheMiss, CacheMode, RecordReplayCache
from ..ai.provider import AIDisabled, LLMProvider
from ..ai.providers import GeminiProvider, NullProvider
from ..ai.providers.gemini import AIProviderError
from ..config import Settings, get_settings
from ..db import get_db
from ..models import AiProposal
from ..services import ai_service

router = APIRouter(tags=["ai"])


class RunTaskIn(BaseModel):
    """Input for one task run: the target record and the (mostly business) context."""

    target_type: str
    target_id: int
    context: dict = Field(default_factory=dict)
    # Names of context keys that hold free text and must be PII-masked (rule 5).
    mask_fields: list[str] = Field(default_factory=list)


class DecisionIn(BaseModel):
    """Optional reviewer note attached to an accept/reject decision."""

    note: str | None = None


def _iso_dt(value: datetime | None) -> str | None:
    """Serialise timestamps as UTC so re-reads (SQLite drops tzinfo) stay stable."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _loads(raw: str, fallback):
    try:
        parsed = json.loads(raw or "")
    except json.JSONDecodeError:
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def proposal_out(row: AiProposal) -> dict:
    """Serialise a proposal, parsing its stored payload and verification JSON."""
    return {
        "id": row.id,
        "task": row.task,
        "task_version": row.task_version,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "status": row.status,
        "provider": row.provider,
        "model": row.model,
        "cache_hit": row.cache_hit,
        "confidence_bp": row.confidence_bp,
        "confidence_band": row.confidence_band,
        "payload": _loads(row.payload_json, {}),
        "validation": _loads(row.validation_json, []),
        "failed_reason": row.failed_reason,
        "engine_version": row.engine_version,
        "is_synthetic": row.is_synthetic,
        "accepted_at": _iso_dt(row.accepted_at),
        "accepted_by": row.accepted_by,
        "rejected_at": _iso_dt(row.rejected_at),
        "rejected_by": row.rejected_by,
        "decision_note": row.decision_note,
        "last_seen_at": _iso_dt(row.last_seen_at),
        "created_at": _iso_dt(row.created_at),
        "updated_at": _iso_dt(row.updated_at),
    }


def _require_ai_ready(settings: Settings) -> CacheMode:
    """Gate every run on the two switches, returning the resolved cache mode."""
    if not settings.ai_enabled:
        raise HTTPException(503, "AI layer is disabled (set AI_ENABLED=true)")
    try:
        mode = CacheMode(str(settings.ai_mode))
    except ValueError as exc:
        raise HTTPException(503, f"invalid AI_MODE: {settings.ai_mode!r}") from exc
    if mode is CacheMode.OFF:
        raise HTTPException(503, "AI_MODE=off: no AI task can run")
    return mode


def _build_provider(settings: Settings) -> LLMProvider:
    """Pick the provider from settings; gemini needs a key, else it is unavailable."""
    if str(settings.ai_provider) == "gemini":
        if not settings.ai_api_key:
            raise HTTPException(503, "AI provider 'gemini' requires AI_API_KEY")
        return GeminiProvider(settings=settings)
    return NullProvider()


@router.post("/ai/tasks/{task}/run")
def run_ai_task(
    task: str,
    body: RunTaskIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Run one named task and persist the result as a human-reviewable proposal."""
    mode = _require_ai_ready(settings)
    provider = _build_provider(settings)
    try:
        result = ai_client.run_task(
            db,
            task=task,
            target_type=body.target_type,
            target_id=body.target_id,
            context=body.context,
            mask_fields=body.mask_fields,
            provider=provider,
            cache=RecordReplayCache(mode=mode, cache_dir=settings.ai_cache_dir),
            actor="user",
        )
    except tasks.UnknownTaskError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (AIDisabled, CacheMiss, AIProviderError, ai_client.TaskOutputError) as exc:
        raise HTTPException(503, str(exc)) from exc
    finally:
        close = getattr(provider, "close", None)
        if callable(close):
            close()
    return {
        "task": result.task,
        "proposal_id": result.proposal_id,
        "cache_hit": result.cache_hit,
        "confidence_bp": result.confidence_bp,
        "confidence_band": result.confidence_band,
        "checks": result.checks,
        "payload": result.payload,
    }


@router.get("/ai/proposals")
def list_ai_proposals(
    task: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    status: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = ai_service.list_proposals(
        db,
        task=task,
        target_type=target_type,
        target_id=target_id,
        status=status,
        limit=limit,
    )
    return {"count": len(rows), "proposals": [proposal_out(row) for row in rows]}


@router.get("/ai/proposals/{proposal_id}")
def get_ai_proposal(proposal_id: int, db: Session = Depends(get_db)):
    try:
        row = ai_service.get_proposal(db, proposal_id)
    except ai_service.AiProposalNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    return proposal_out(row)


@router.post("/ai/proposals/{proposal_id}/accept")
def accept_ai_proposal(
    proposal_id: int, payload: DecisionIn | None = None, db: Session = Depends(get_db)
):
    """Accept a proposal (human decision). No business record is applied here."""
    note = payload.note if payload else None
    try:
        row = ai_service.accept(db, proposal_id, actor="user", note=note)
    except ai_service.AiProposalNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except ai_service.AiProposalTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return proposal_out(row)


@router.post("/ai/proposals/{proposal_id}/reject")
def reject_ai_proposal(
    proposal_id: int, payload: DecisionIn | None = None, db: Session = Depends(get_db)
):
    """Reject a proposal (human decision); nothing is committed anywhere."""
    note = payload.note if payload else None
    try:
        row = ai_service.reject(db, proposal_id, actor="user", note=note)
    except ai_service.AiProposalNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except ai_service.AiProposalTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return proposal_out(row)
