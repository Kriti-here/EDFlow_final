"""Hash-chained audit log: editing or deleting any row breaks verify_chain()."""
import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AuditLog

GENESIS = "0" * 64


def _canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _hash(prev: str, payload: dict) -> str:
    return hashlib.sha256((prev + _canon(payload)).encode()).hexdigest()


def append(db: Session, actor: str, action: str, entity: str, entity_id, details: dict | None = None) -> AuditLog:
    last = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(1)).first()
    prev = last.hash if last else GENESIS
    details_json = _canon(details or {})
    payload = {"ts": datetime.now(timezone.utc).isoformat(), "actor": actor, "action": action,
               "entity": entity, "entity_id": str(entity_id), "details": json.loads(details_json)}
    row = AuditLog(ts=payload["ts"], actor=actor, action=action, entity=entity, entity_id=str(entity_id),
                   details_json=details_json, prev_hash=prev, hash=_hash(prev, payload))
    db.add(row)
    db.flush()
    return row


def verify_chain(db: Session) -> tuple[bool, int | None]:
    """Return (ok, id_of_first_bad_row)."""
    prev = GENESIS
    for row in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        payload = {"ts": row.ts, "actor": row.actor, "action": row.action, "entity": row.entity,
                   "entity_id": row.entity_id, "details": json.loads(row.details_json)}
        if row.prev_hash != prev or row.hash != _hash(prev, payload):
            return False, row.id
        prev = row.hash
    return True, None
