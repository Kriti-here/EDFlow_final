"""Exception orchestration (B13).

Derives the exception set from the current match records and ledger gaps
(``app/services/exception_engine.py``), persists it idempotently and owns the
review lifecycle. The ``MatchRecord`` table stays the source of truth; this
service never mutates a match decision.

Derivation semantics:

* a new condition creates an ``open`` exception (audited);
* a still-present condition refreshes its row (and re-opens one the system had
  previously auto-closed) but never overrides a human resolve/dismiss;
* a condition that has disappeared auto-closes its ``open``/``acknowledged``
  exception with ``resolved_by="system"`` and the configured note -- every
  auto-close is audited.

No AI, no EDF generation, no agent and no frontend here (AGENTS.md rules 2 and 6).
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    ExceptionRecord,
    FiraDocument,
    FiraLine,
    Invoice,
    MatchRecord,
    Payment,
    utcnow,
)
from ..rules import engine as rules_engine
from ..rules.loader import load_rules
from . import audit, exception_engine
from .exception_engine import (
    ACKNOWLEDGED,
    DISMISSED,
    LineRef,
    InvoiceRef,
    MatchRef,
    OPEN,
    PaymentRef,
    RESOLVED,
    SYSTEM_ACTOR,
    DerivedException,
)

_OPEN_STATUSES = (OPEN, ACKNOWLEDGED)
_CLOSED_STATUSES = (RESOLVED, DISMISSED)


class ExceptionNotFound(Exception):
    """Raised when a requested exception does not exist."""


class ExceptionTransitionError(Exception):
    """Raised when a lifecycle transition is not allowed from the current status."""


# ---------------------------------------------------------------------------
# ORM -> engine inputs
# ---------------------------------------------------------------------------
def _match_refs(db: Session) -> list[MatchRef]:
    return [
        MatchRef(
            id=row.id,
            fira_line_id=row.fira_line_id,
            match_type=row.match_type,
            status=row.status,
            confidence_bp=row.confidence_bp,
            invoice_id=row.invoice_id,
            payment_id=row.payment_id,
        )
        for row in db.scalars(select(MatchRecord))
    ]


def _line_refs(db: Session) -> dict[int, LineRef]:
    synthetic = {doc.id: doc.is_synthetic for doc in db.scalars(select(FiraDocument))}
    return {
        row.id: LineRef(
            id=row.id,
            document_id=row.document_id,
            line_no=row.line_no,
            is_synthetic=synthetic.get(row.document_id, False),
        )
        for row in db.scalars(select(FiraLine))
    }


def _invoice_refs(db: Session) -> list[InvoiceRef]:
    return [
        InvoiceRef(id=row.id, number=row.number) for row in db.scalars(select(Invoice))
    ]


def _payment_refs(db: Session) -> list[PaymentRef]:
    return [
        PaymentRef(
            id=row.id,
            invoice_id=row.invoice_id,
            capture_id=row.paypal_capture_id,
            is_synthetic=row.data_source == "synthetic",
        )
        for row in db.scalars(select(Payment))
    ]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _apply(row: ExceptionRecord, derived: DerivedException, *, version: str) -> None:
    row.category = derived.category
    row.severity = derived.severity
    row.source = derived.source
    row.match_id = derived.match_id
    row.fira_line_id = derived.fira_line_id
    row.fira_document_id = derived.fira_document_id
    row.invoice_id = derived.invoice_id
    row.payment_id = derived.payment_id
    row.confidence_bp = derived.confidence_bp
    row.summary = derived.summary
    row.details_json = json.dumps(derived.details, sort_keys=True)
    row.engine_version = version
    row.is_synthetic = derived.is_synthetic
    row.last_seen_at = utcnow()


def derive_exceptions(
    db: Session, *, actor: str = SYSTEM_ACTOR, rules: dict | None = None
) -> dict:
    """Recompute the exception set; persist creations, reopens and auto-closes."""
    rules = rules or load_rules()
    config = rules_engine.exception_config(rules=rules)
    version = config["engine_version"]
    auto_close_note = config["auto_close_note"]

    desired = exception_engine.derive_exceptions(
        _match_refs(db),
        _line_refs(db),
        _invoice_refs(db),
        _payment_refs(db),
        config=config,
    )
    existing = {row.dedupe_key: row for row in db.scalars(select(ExceptionRecord))}

    created = updated = reopened = auto_closed = 0
    seen: set[str] = set()
    for derived in desired:
        seen.add(derived.dedupe_key)
        row = existing.get(derived.dedupe_key)
        if row is None:
            row = ExceptionRecord(
                dedupe_key=derived.dedupe_key, status=OPEN, source=derived.source
            )
            db.add(row)
            _apply(row, derived, version=version)
            db.flush()
            created += 1
            audit.append(
                db,
                actor,
                "exception.derived",
                "exception",
                row.dedupe_key,
                {"category": derived.category, "severity": derived.severity},
            )
            continue
        _apply(row, derived, version=version)
        if row.status == RESOLVED and row.resolved_by == SYSTEM_ACTOR:
            row.status = OPEN
            row.resolved_at = None
            row.resolved_by = None
            row.resolution_note = None
            reopened += 1
            audit.append(
                db,
                actor,
                "exception.reopened",
                "exception",
                row.dedupe_key,
                {"category": derived.category},
            )
        else:
            updated += 1

    for key, row in existing.items():
        if key in seen or row.status not in _OPEN_STATUSES:
            continue
        row.status = RESOLVED
        row.resolved_at = utcnow()
        row.resolved_by = SYSTEM_ACTOR
        row.resolution_note = auto_close_note
        auto_closed += 1
        audit.append(
            db,
            actor,
            "exception.auto_closed",
            "exception",
            key,
            {"category": row.category, "reason": auto_close_note},
        )

    db.flush()
    summary = {
        "engine_version": version,
        "total": len(desired),
        "created": created,
        "updated": updated,
        "reopened": reopened,
        "auto_closed": auto_closed,
        "by_category": dict(Counter(d.category for d in desired)),
        "by_severity": dict(Counter(d.severity for d in desired)),
    }
    audit.append(db, actor, "exceptions.derive", "exception_run", version, summary)
    db.commit()
    return summary


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def get_exception(db: Session, exception_id: int) -> ExceptionRecord:
    row = db.get(ExceptionRecord, exception_id)
    if row is None:
        raise ExceptionNotFound(f"exception {exception_id} not found")
    return row


def _require_open(row: ExceptionRecord, action: str) -> None:
    if row.status in _CLOSED_STATUSES:
        raise ExceptionTransitionError(
            f"cannot {action} an exception that is already {row.status}"
        )


def acknowledge(
    db: Session, exception_id: int, *, actor: str = "user", note: str | None = None
) -> ExceptionRecord:
    """Open -> acknowledged. Idempotent once acknowledged."""
    row = get_exception(db, exception_id)
    _require_open(row, "acknowledge")
    if row.status == OPEN:
        row.status = ACKNOWLEDGED
        row.acknowledged_at = utcnow()
        row.acknowledged_by = actor
        row.acknowledged_note = note
        db.flush()
        audit.append(
            db,
            actor,
            "exception.acknowledged",
            "exception",
            row.id,
            {"category": row.category},
        )
        db.commit()
    return row


def resolve(
    db: Session, exception_id: int, *, actor: str = "user", note: str | None = None
) -> ExceptionRecord:
    """Open/acknowledged -> resolved by a human."""
    row = get_exception(db, exception_id)
    _require_open(row, "resolve")
    row.status = RESOLVED
    row.resolved_at = utcnow()
    row.resolved_by = actor
    row.resolution_note = note
    db.flush()
    audit.append(
        db,
        actor,
        "exception.resolved",
        "exception",
        row.id,
        {"category": row.category, "note": note},
    )
    db.commit()
    return row


def dismiss(
    db: Session, exception_id: int, *, actor: str = "user", note: str | None = None
) -> ExceptionRecord:
    """Open/acknowledged -> dismissed (accepted, no action)."""
    row = get_exception(db, exception_id)
    _require_open(row, "dismiss")
    row.status = DISMISSED
    row.dismissed_at = utcnow()
    row.dismissed_by = actor
    row.dismissed_note = note
    db.flush()
    audit.append(
        db,
        actor,
        "exception.dismissed",
        "exception",
        row.id,
        {"category": row.category, "note": note},
    )
    db.commit()
    return row


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
# Asia/Kolkata is UTC+05:30 all year (no daylight saving), so a constant offset
# converts an IST midnight into a UTC instant exactly without a timezone database.
_IST_OFFSET = timedelta(hours=5, minutes=30)
_ONE_DAY = timedelta(days=1)


def _ist_day_bounds(moment: datetime | None = None) -> tuple[datetime, datetime]:
    """The current Indian business day as the UTC interval ``[since, until)``.

    ``since`` is today's IST midnight and ``until`` is the next IST midnight,
    both expressed in UTC. Stored timestamps stay in UTC; only the day edges are
    shifted, so a row resolved at (for example) 19:00 UTC belongs to the next
    Indian day rather than the current UTC one.
    """
    reference = (moment if moment is not None else utcnow()).astimezone(timezone.utc)
    ist_midnight = (reference + _IST_OFFSET).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    since = (ist_midnight - _IST_OFFSET).astimezone(timezone.utc)
    return since, since + _ONE_DAY


def _as_utc(value: datetime | None) -> datetime | None:
    """Treat a naive timestamp (SQLite drops tzinfo) as UTC so comparisons are stable."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def list_exceptions(
    db: Session,
    *,
    status: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    document_id: int | None = None,
    resolved_since: datetime | None = None,
    resolved_until: datetime | None = None,
    limit: int = 200,
) -> list[ExceptionRecord]:
    """List exceptions, newest first, optionally filtered.

    ``resolved_since`` (inclusive) and ``resolved_until`` (exclusive) bound the
    ``resolved_at`` timestamp, so a caller can fetch one calendar-day slice by
    date instead of scanning by row id (which is what made "resolved today"
    depend on the newest N records).
    """
    query = select(ExceptionRecord).order_by(ExceptionRecord.id.desc())
    if status:
        query = query.where(ExceptionRecord.status == status)
    if category:
        query = query.where(ExceptionRecord.category == category)
    if severity:
        query = query.where(ExceptionRecord.severity == severity)
    if document_id is not None:
        query = query.where(ExceptionRecord.fira_document_id == document_id)
    if resolved_since is not None:
        query = query.where(ExceptionRecord.resolved_at >= resolved_since)
    if resolved_until is not None:
        query = query.where(ExceptionRecord.resolved_at < resolved_until)
    return list(db.scalars(query.limit(min(max(limit, 1), 500))).all())


def summary(db: Session) -> dict:
    """Aggregate counts by status, category and severity.

    ``resolved_today`` counts rows resolved on the current **Indian business day**
    (Asia/Kolkata), derived from the same UTC ``[since, until)`` bounds the
    frontend uses, not from row order, so it stays correct no matter how many
    older records exist. ``active_by_severity`` and ``active_by_category`` cover
    the whole active queue (open + acknowledged), so the UI never has to estimate
    them from a capped page. Every pre-existing key is unchanged.
    """
    rows = db.scalars(select(ExceptionRecord)).all()
    by_status = Counter(row.status for row in rows)
    active = [row for row in rows if row.status in _OPEN_STATUSES]
    day_start, day_end = _ist_day_bounds()
    resolved_today = 0
    for row in rows:
        if row.status != RESOLVED:
            continue
        resolved_at = _as_utc(row.resolved_at)
        if resolved_at is not None and day_start <= resolved_at < day_end:
            resolved_today += 1
    return {
        "total": len(rows),
        "open": by_status.get(OPEN, 0),
        "acknowledged": by_status.get(ACKNOWLEDGED, 0),
        "resolved": by_status.get(RESOLVED, 0),
        "dismissed": by_status.get(DISMISSED, 0),
        "resolved_today": resolved_today,
        "by_status": dict(by_status),
        "by_category": dict(Counter(row.category for row in rows)),
        "by_severity": dict(Counter(row.severity for row in rows)),
        "active_by_severity": dict(Counter(row.severity for row in active)),
        "active_by_category": dict(Counter(row.category for row in active)),
    }
