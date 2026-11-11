"""Strict Pydantic schemas for AI proposals (B8A).

Each schema is the *only* shape an LLM may return for its task. Parsing is strict
(``extra="forbid"``) so an unexpected field fails validation rather than leaking
into storage (AGENTS.md rule 2). The model never computes money or confidence:
those are derived deterministically in code.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AiProposalBase(BaseModel):
    """Base schema for an AI proposal record (B8A)."""

    model_config = ConfigDict(extra="forbid")

    task: str
    task_version: str
    target_type: str
    target_id: int
    status: str = "proposed"
    provider: str
    model: str
    confidence_bp: int = 0
    confidence_band: str = "low"
    payload: dict[str, Any] = Field(default_factory=dict)
    validation: list[dict[str, Any]] = Field(default_factory=list)
    engine_version: str
    is_synthetic: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PurposeExplanation(BaseModel):
    """A plain-English explanation of why a purpose code applies to an invoice."""

    model_config = ConfigDict(extra="forbid")

    explanation: str = Field(
        min_length=1,
        max_length=1200,
        description="Concise explanation of the purpose code applicability.",
    )
    key_factors: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="List of specific factors (e.g. SAC code, service type) that justify the code.",
    )


class ExceptionRemediation(BaseModel):
    """A proposed way to resolve one reconciliation exception."""

    model_config = ConfigDict(extra="forbid")

    remediation: str = Field(
        min_length=1,
        max_length=1200,
        description="Actionable advice on how to resolve the exception.",
    )
    suggested_actions: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="Step-by-step list of actions for the human user.",
    )
