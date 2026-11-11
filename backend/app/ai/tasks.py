"""Task registry for the B8 AI layer (B8D).

Every AI capability is a named, versioned *task*; there is deliberately no
generic chat. A task binds four things together:

* ``schema``         -- the strict Pydantic shape the model must return (B8A),
* ``validator``      -- deterministic, offline checks over the parsed output,
* ``prompt_version`` -- version of the prompt template below (code-owned),
* ``task_version``   -- version of the task's contract/logic (YAML-owned).

Scoring is data-driven: the per-check weights and the confidence bands come from
``rules/india_export.yaml`` (``ai.tasks.<task>``), never hardcoded here
(AGENTS.md rule 6). This module performs no I/O, no network and no provider call.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from ..rules import engine as rules_engine
from .pii import find_pii
from .schemas import ExceptionRemediation, PurposeExplanation

# Version of the prompt templates below. Bumped whenever a template changes so a
# recorded answer can be tied back to the prompt that produced it.
PROMPT_VERSION = "b8.1"

# Minimum length (characters) for the free-text answer to count as "adequate".
# This is an output-quality guard, not a regulation, so it stays a code constant.
MIN_TEXT_CHARS = 40

_PURPOSE_SYSTEM = (
    "You explain, for an Indian service exporter, why a given export purpose code "
    "applies to one invoice. Respond with a single JSON object of the form "
    '{"explanation": string, "key_factors": string[]} and nothing else. '
    "Never invent codes, amounts or personal data."
)
_EXCEPTION_SYSTEM = (
    "You propose how a human should resolve one reconciliation exception. "
    "Respond with a single JSON object of the form "
    '{"remediation": string, "suggested_actions": string[]} and nothing else. '
    "Never move money, file anything or invent personal data."
)


class UnknownTaskError(Exception):
    """Raised when a task name is unknown or its task is disabled."""


@dataclass(frozen=True)
class Check:
    """One deterministic verification result, named to match a YAML weight."""

    name: str
    ok: bool
    detail: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {"check": self.name, "ok": self.ok, "detail": self.detail}


# A validator is pure: it reads the parsed output and the (already masked)
# context and returns checks. It must not call a provider, the network or the DB.
Validator = Callable[[BaseModel, Mapping[str, Any]], list[Check]]


@dataclass(frozen=True)
class TaskSpec:
    """Everything needed to run and verify one task."""

    name: str
    schema: type[BaseModel]
    validator: Validator
    prompt_version: str
    task_version: str
    system_prompt: str
    config: dict[str, Any]


def render_user_prompt(context: Mapping[str, Any]) -> str:
    """Deterministic ``key: value`` block from the already-masked context."""
    return "\n".join(f"{key}: {value}" for key, value in sorted(context.items()))


def _no_pii(texts: Iterable[str]) -> Check:
    """Fail when the model echoed personal data back (AGENTS.md rule 5)."""
    found = find_pii(" \n ".join(t for t in texts if t))
    return Check("no_pii", not found, "" if not found else f"remaining PII: {found}")


# ---------------------------------------------------------------------------
# Validators (one per task) -- pure and deterministic
# ---------------------------------------------------------------------------
def _validate_purpose_explain(
    output: BaseModel, context: Mapping[str, Any]
) -> list[Check]:
    explanation = str(getattr(output, "explanation", "") or "")
    factors = [str(f) for f in (getattr(output, "key_factors", []) or [])]
    code = str(context.get("purpose_code") or "").strip().upper()
    known = context.get("known_purpose_codes")
    known_set = {str(c).strip().upper() for c in known} if known else None
    mentions = code and (
        code in explanation.upper() or any(code in f.upper() for f in factors)
    )
    return [
        Check(
            "code_known",
            bool(code) and (known_set is None or code in known_set),
            f"code={code or 'n/a'}",
        ),
        Check("mentions_code", bool(mentions), "code referenced in the answer"),
        Check(
            "adequate_length",
            len(explanation) >= MIN_TEXT_CHARS,
            f"{len(explanation)} chars",
        ),
        _no_pii([explanation, *factors]),
    ]


def _validate_exception_remediation(
    output: BaseModel, context: Mapping[str, Any]
) -> list[Check]:
    remediation = str(getattr(output, "remediation", "") or "")
    actions = [str(a) for a in (getattr(output, "suggested_actions", []) or [])]
    category = str(context.get("category") or "").strip().lower()
    known = context.get("known_categories")
    known_set = {str(c).strip().lower() for c in known} if known else None
    mentions = category and (
        category in remediation.lower() or any(category in a.lower() for a in actions)
    )
    return [
        Check(
            "known_category",
            bool(category) and (known_set is None or category in known_set),
            f"category={category or 'n/a'}",
        ),
        Check("mentions_category", bool(mentions), "category referenced in the answer"),
        Check(
            "adequate_length",
            len(remediation) >= MIN_TEXT_CHARS,
            f"{len(remediation)} chars",
        ),
        _no_pii([remediation, *actions]),
    ]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
def _build_purpose_explain(config: dict[str, Any]) -> TaskSpec:
    return TaskSpec(
        name="purpose_explain",
        schema=PurposeExplanation,
        validator=_validate_purpose_explain,
        prompt_version=PROMPT_VERSION,
        task_version=str(config["task_version"]),
        system_prompt=_PURPOSE_SYSTEM,
        config=config,
    )


def _build_exception_remediation(config: dict[str, Any]) -> TaskSpec:
    return TaskSpec(
        name="exception_remediation",
        schema=ExceptionRemediation,
        validator=_validate_exception_remediation,
        prompt_version=PROMPT_VERSION,
        task_version=str(config["task_version"]),
        system_prompt=_EXCEPTION_SYSTEM,
        config=config,
    )


_BUILDERS: dict[str, Callable[[dict[str, Any]], TaskSpec]] = {
    "purpose_explain": _build_purpose_explain,
    "exception_remediation": _build_exception_remediation,
}


def task_names() -> tuple[str, ...]:
    """Registered task names, in display order."""
    return tuple(_BUILDERS)


def get_task(name: str, *, rules: dict[str, Any] | None = None) -> TaskSpec:
    """Return the spec for ``name``, its ``task_version``/weights from the YAML."""
    builder = _BUILDERS.get(name)
    if builder is None:
        raise UnknownTaskError(f"unknown AI task: {name!r}")
    config = rules_engine.ai_task_config(name, rules=rules)
    if not config["enabled"]:
        raise UnknownTaskError(f"AI task is disabled: {name!r}")
    return builder(config)


def _band(confidence_bp: int, config: Mapping[str, Any]) -> str:
    if confidence_bp >= int(config.get("high_bp", 7000)):
        return "high"
    if confidence_bp >= int(config.get("medium_bp", 4000)):
        return "medium"
    return "low"


def evaluate(
    spec: TaskSpec, output: BaseModel, context: Mapping[str, Any]
) -> tuple[list[dict[str, Any]], int, str]:
    """Run the deterministic checks and score them with the YAML weights.

    Returns ``(checks, confidence_bp, confidence_band)``. Confidence is the sum of
    the weights of the passing checks -- derived in code, never asked of the model.
    """
    checks = spec.validator(output, context)
    weights = spec.config.get("verify_weights_bp") or {}
    confidence_bp = sum(int(weights.get(c.name, 0)) for c in checks if c.ok)
    return (
        [c.as_dict() for c in checks],
        confidence_bp,
        _band(confidence_bp, spec.config),
    )
