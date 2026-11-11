"""Rules endpoints: the loaded regulation config and per-exporter coverage."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ExporterProfile
from ..rules import engine
from ..rules.loader import RulesConfigError, load_rules, rules_path

router = APIRouter(tags=["rules"])


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


@router.get("/rules")
def get_rules():
    try:
        rules = load_rules()
        summary = engine.rule_status_summary(rules=rules)
    except RulesConfigError as e:
        raise HTTPException(500, str(e))
    summary["config_path"] = str(rules_path())
    summary["purpose_codes"] = [
        {
            "code": entry.get("code", key),
            "description": entry.get("description"),
            "category": entry.get("category"),
            "verified": bool(entry.get("verified")),
            "source": entry.get("source"),
            "last_verified": entry.get("last_verified"),
        }
        for key, entry in rules["purpose_codes"].items()
    ]
    return summary


@router.get("/rules/entity-check/{exporter_id}")
def entity_check(exporter_id: int, db: Session = Depends(get_db)):
    exporter = db.get(ExporterProfile, exporter_id)
    if not exporter:
        raise HTTPException(404, "Exporter not found")
    try:
        rules = load_rules()
        coverage = engine.entity_coverage(
            entity_type=exporter.entity_type,
            pan=exporter.pan,
            gstin=exporter.gstin,
            lut_number=exporter.lut_number,
            lut_not_applicable=exporter.lut_not_applicable,
            rules=rules,
        )
    except RulesConfigError as e:
        raise HTTPException(500, str(e))
    return {
        "exporter_id": exporter.id,
        "legal_name": exporter.legal_name,
        "source": "rules/india_export.yaml",
        "verification_status": rules.get("g2_status"),
        "last_verified": rules.get("last_updated"),
        "coverage": _jsonable(coverage),
    }
