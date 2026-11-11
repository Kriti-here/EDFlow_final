"""Provider contract for the B8 AI layer (B8B).

A provider is the only component that may touch the network for AI egress, and
it is deliberately dumb: a task-oriented ``ProviderRequest`` goes in, a raw
``ProviderResponse`` comes out. It never creates, sends, captures or pays
anything, never computes money, and never persists business records
(AGENTS.md rule 2).

The request/response are plain frozen dataclasses rather than Pydantic models:
this is an *internal* boundary between code that already trusts each other. The
payload a human ultimately trusts is validated separately by the strict schemas
in ``app/ai/schemas.py``.

This module holds no provider implementation and performs no I/O. Masking,
caching, validation and auditing are the caller's responsibility and arrive in
later phases.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


class AIDisabled(RuntimeError):
    """Raised when a provider is asked to run while the AI layer is switched off.

    The null provider raises this so a misconfigured caller fails loudly instead
    of silently returning fabricated data (AGENTS.md rules 2 and 10).
    """


@dataclass(frozen=True)
class ProviderRequest:
    """One task-oriented LLM call, already PII-masked by the caller.

    ``task`` and ``task_version`` are carried so a recorded answer can be tied to
    the exact prompt/logic that produced it (B8 decision: AI output is
    versioned). ``request_key`` is a stable, caller-derived identity for the
    record/replay cache; identical masked input must yield an identical key.
    """

    task: str
    task_version: str
    system_prompt: str
    user_prompt: str
    temperature: float = 0.0
    max_output_tokens: int = 1024
    request_key: str = ""


@dataclass(frozen=True)
class ProviderResponse:
    """A raw provider answer plus the provenance needed to replay and audit it.

    ``is_synthetic`` marks answers that did not come straight from a live model
    (e.g. a replayed fixture or a stub), so the UI can label them as simulated
    (AGENTS.md rule 10).
    """

    text: str
    provider: str
    model: str
    is_synthetic: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class LLMProvider(Protocol):
    """Structural contract every provider must satisfy (null, gemini, ...)."""

    name: str

    def complete(self, request: ProviderRequest) -> ProviderResponse:
        """Return the provider's answer for one request, or raise``AIDisabled``."""
        ...
