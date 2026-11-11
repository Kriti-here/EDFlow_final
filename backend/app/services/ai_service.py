"""AI proposal persistence and review lifecycle (B8C).

This is the only module that writes an ``AiProposal`` row and the only place its
review lifecycle moves. It contains **no AI**: it never imports a provider, never
touches the network and never calls Gemini (AGENTS.md rules 2 and 7). A task
runner in a later phase produces the already schema-validated payload and hands
it here to be *persisted as a proposal*; the actual decisions are explicit human
actions:

    proposed --(accept)--> accepted
             --(reject)--> rejected
             --(fail)----> failed
             --(supersede)--> superseded

``accept`` is also the single hook where an optional deterministic *apply*
function may commit the accepted payload to a business record -- nothing else in
this module mutates business state. Every transition is appended to the
hash-chained audit log (``ai.proposed`` / ``ai.accepted`` / ``ai.rejected`` /
``ai.failed`` / ``ai.superseded``) so any decision can be reconstructed and
re-verified.
"""

from __future__ import annotations

import json
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AiProposal, utcnow
from . import audit

PROPOSED = "proposed"
ACCEPTED = "accepted"
REJECTED = "rejected"
SUPERSEDED = "superseded"
FAILED = "failed"

# Statuses set by a human; re-recording must never overwrite them (rule 2).
_HUMAN_DECIDED = (ACCEPTED, REJECTED)

# A deterministic, side-effect-free commit of one accepted proposal. It receives
# the live session and the accepted row and must not call AI or the network.
ApplyFn = Callable[[Session, AiProposal], None]


class AiProposalNotFound(Exception):
    """Raised when a requested proposal does not exist."""


class AiProposalTransitionError(Exception):
    """Raised when a lifecycle transition is not allowed from the current status."""


def dedupe_key(
    *, task: str, target_type: str, target_id: int, task_version: str
) -> str:
    """Stable identity for a proposal: same (task, target, version) -> same row."""
    return f"{task}|{target_type}|{target_id}|{task_version}"


def _require_proposed(row: AiProposal, action: str) -> None:
    if row.status != PROPOSED:
        raise AiProposalTransitionError(
            f"cannot {action} a proposal that is already {row.status}"
        )


def _content(
    row: AiProposal,
    *,
    provider: str,
    model: str,
    payload: dict,
    validation: list[dict],
    confidence_bp: int,
    confidence_band: str,
    engine_version: str,
    cache_hit: bool,
    is_synthetic: bool,
) -> None:
    """Fill the (mutable) content fields of a proposal row."""
    row.provider = provider
    row.model = model
    row.payload_json = json.dumps(payload or {}, sort_keys=True, default=str)
    row.validation_json = json.dumps(validation or [], sort_keys=True, default=str)
    row.confidence_bp = confidence_bp
    row.confidence_band = confidence_band
    row.engine_version = engine_version
    row.cache_hit = cache_hit
    row.is_synthetic = is_synthetic
    row.failed_reason = None
    row.last_seen_at = utcnow()


def _audit_details(row: AiProposal) -> dict:
    return {
        "task": row.task,
        "task_version": row.task_version,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "status": row.status,
        "provider": row.provider,
        "model": row.model,
        "confidence_band": row.confidence_band,
    }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def record_proposal(
    db: Session,
    *,
    task: str,
    task_version: str,
    target_type: str,
    target_id: int,
    provider: str,
    model: str,
    payload: dict,
    validation: list[dict] | None = None,
    confidence_bp: int = 0,
    confidence_band: str = "low",
    engine_version: str = "",
    cache_hit: bool = False,
    is_synthetic: bool = False,
    actor: str = "system",
) -> AiProposal:
    """Persist a validated AI payload as a ``proposed`` row (idempotent).

    The same (task, target, task_version) always maps to the same row. A row a
    human has already decided (accepted/rejected) is returned untouched; any
    other row of the same identity is refreshed back to ``proposed``.
    """
    key = dedupe_key(
        task=task,
        target_type=target_type,
        target_id=target_id,
        task_version=task_version,
    )
    row = db.scalars(select(AiProposal).where(AiProposal.dedupe_key == key)).first()
    if row is None:
        row = AiProposal(
            task=task,
            task_version=task_version,
            target_type=target_type,
            target_id=target_id,
            dedupe_key=key,
            status=PROPOSED,
        )
        db.add(row)
    elif row.status in _HUMAN_DECIDED:
        return row  # a human decision is never overwritten by re-running the task
    else:
        row.status = PROPOSED

    _content(
        row,
        provider=provider,
        model=model,
        payload=payload,
        validation=validation or [],
        confidence_bp=confidence_bp,
        confidence_band=confidence_band,
        engine_version=engine_version,
        cache_hit=cache_hit,
        is_synthetic=is_synthetic,
    )
    db.flush()
    audit.append(db, actor, "ai.proposed", "ai_proposal", row.id, _audit_details(row))
    db.commit()
    return row


# ---------------------------------------------------------------------------
# Lifecycle -- every transition below is an explicit, audited human/system action
# ---------------------------------------------------------------------------
def get_proposal(db: Session, proposal_id: int) -> AiProposal:
    row = db.get(AiProposal, proposal_id)
    if row is None:
        raise AiProposalNotFound(f"proposal {proposal_id} not found")
    return row


def accept(
    db: Session,
    proposal_id: int,
    *,
    actor: str,
    note: str | None = None,
    apply: ApplyFn | None = None,
) -> AiProposal:
    """Accept a proposal (human action).

    When ``apply`` is given it is called with the live session and the accepted
    row so the accepted payload can be committed deterministically. If it raises,
    nothing is committed and the caller's transaction rolls back.
    """
    row = get_proposal(db, proposal_id)
    _require_proposed(row, "accept")
    row.status = ACCEPTED
    row.accepted_at = utcnow()
    row.accepted_by = actor
    row.decision_note = note
    if apply is not None:
        apply(db, row)
    db.flush()
    audit.append(
        db,
        actor,
        "ai.accepted",
        "ai_proposal",
        row.id,
        {**_audit_details(row), "note": note},
    )
    db.commit()
    return row


def reject(
    db: Session, proposal_id: int, *, actor: str, note: str | None = None
) -> AiProposal:
    """Reject a proposal without committing anything to a business record."""
    row = get_proposal(db, proposal_id)
    _require_proposed(row, "reject")
    row.status = REJECTED
    row.rejected_at = utcnow()
    row.rejected_by = actor
    row.decision_note = note
    db.flush()
    audit.append(
        db,
        actor,
        "ai.rejected",
        "ai_proposal",
        row.id,
        {**_audit_details(row), "note": note},
    )
    db.commit()
    return row


def mark_failed(
    db: Session, proposal_id: int, *, reason: str, actor: str = "system"
) -> AiProposal:
    """Mark a proposal failed (e.g. deterministic verification rejected it)."""
    row = get_proposal(db, proposal_id)
    _require_proposed(row, "fail")
    row.status = FAILED
    row.failed_reason = reason
    db.flush()
    audit.append(
        db,
        actor,
        "ai.failed",
        "ai_proposal",
        row.id,
        {**_audit_details(row), "reason": reason},
    )
    db.commit()
    return row


def supersede(db: Session, proposal_id: int, *, actor: str = "system") -> AiProposal:
    """Mark a still-proposed proposal superseded by a newer one for the same target."""
    row = get_proposal(db, proposal_id)
    _require_proposed(row, "supersede")
    row.status = SUPERSEDED
    db.flush()
    audit.append(db, actor, "ai.superseded", "ai_proposal", row.id, _audit_details(row))
    db.commit()
    return row


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def list_proposals(
    db: Session,
    *,
    task: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
) -> list[AiProposal]:
    """List proposals, newest first, optionally filtered."""
    query = select(AiProposal).order_by(AiProposal.id.desc())
    if task:
        query = query.where(AiProposal.task == task)
    if target_type:
        query = query.where(AiProposal.target_type == target_type)
    if target_id is not None:
        query = query.where(AiProposal.target_id == target_id)
    if status:
        query = query.where(AiProposal.status == status)
    return list(db.scalars(query.limit(min(max(limit, 1), 500))).all())
