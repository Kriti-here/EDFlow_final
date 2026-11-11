"""Deterministic rules engine over rules/india_export.yaml (loaded via the loader).

Every value here -- deadlines, thresholds, purpose codes, authorities -- comes from
the YAML. Nothing regulatory is hardcoded (AGENTS.md rule 6). Functions are pure or
read the cached config, so they are easy to unit-test.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterator

from .loader import RulesConfigError, load_rules

# Section keys summarised by rule_status_summary, in display order.
_SUMMARY_SECTIONS = (
    "governing_regulations",
    "deadlines",
    "thresholds",
    "provisions_10_lakh",
    "specified_authorities",
    "purpose_codes",
)


def _dec(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _is_resident_individual(entity_type: str | None) -> bool:
    normalized = (entity_type or "").strip().lower().replace("_", " ")
    return normalized in {"individual", "resident individual"}


def _last_day_of_month(d: date) -> date:
    first_next = date(d.year + (d.month == 12), (d.month % 12) + 1, 1)
    return first_next - timedelta(days=1)


# ---- Deadline helpers -------------------------------------------------------------


def edf_due_date(invoice_date: date, *, rules: dict[str, Any] | None = None) -> date:
    """EDF is due `days` calendar days after the end of the invoice month."""
    r = rules or load_rules()
    spec = r["deadlines"]["service_edf_submission"]
    if spec.get("period_type") != "calendar_days_from_end_of_invoice_month":
        raise RulesConfigError(
            f"unsupported period_type for service_edf_submission: {spec.get('period_type')}"
        )
    return _last_day_of_month(invoice_date) + timedelta(days=int(spec["days"]))


def days_remaining(
    invoice_date: date,
    today: date | None = None,
    *,
    rules: dict[str, Any] | None = None,
) -> int:
    """Days from today until the EDF deadline. Negative when overdue."""
    return (edf_due_date(invoice_date, rules=rules) - (today or date.today())).days


def risk_level(days_left: int, *, window_days: int | None = None) -> str:
    """Bucketed urgency derived from the rule's own window, not a magic number."""
    if window_days is None:
        window_days = int(load_rules()["deadlines"]["service_edf_submission"]["days"])
    if days_left < 0:
        return "overdue"
    if days_left <= window_days // 4:
        return "critical"
    if days_left <= window_days // 2:
        return "warning"
    return "ok"


# ---- Purpose codes ----------------------------------------------------------------


def validate_purpose_code(
    code: str | None, *, rules: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Look the code up in the YAML and report validity plus its verification status."""
    r = rules or load_rules()
    entry = (
        (r["purpose_codes"] or {}).get((code or "").strip().upper()) if code else None
    )
    if entry is None:
        return {
            "code": code,
            "valid": False,
            "verified": None,
            "description": None,
            "category": None,
            "source": None,
            "last_verified": None,
        }
    return {
        "code": entry.get("code", code),
        "valid": True,
        "verified": bool(entry.get("verified")),
        "description": entry.get("description"),
        "category": entry.get("category"),
        "source": entry.get("source"),
        "last_verified": entry.get("last_verified"),
    }


# ---- Entity coverage --------------------------------------------------------------


def _authority(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "authority": a.get("authority"),
        "jurisdiction": a.get("jurisdiction"),
        "regulation_reference": a.get("regulation_reference"),
        "source": a.get("source"),
        "last_verified": a.get("last_verified"),
        "verified": bool(a.get("verified")),
    }


def entity_coverage(
    *,
    entity_type: str | None,
    pan: str | None = None,
    gstin: str | None = None,
    lut_number: str | None = None,
    lut_not_applicable: bool = False,
    rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Which deemed-submission threshold, authority and identifiers apply to this exporter."""
    r = rules or load_rules()
    is_individual = _is_resident_individual(entity_type)
    threshold_key = (
        "deemed_submission_resident_individual"
        if is_individual
        else "deemed_submission_non_individual"
    )
    threshold = r["thresholds"][threshold_key]
    missing = [name for name, value in (("pan", pan), ("gstin", gstin)) if not value]
    if not lut_number and not lut_not_applicable:
        missing.append("lut_number")
    return {
        "entity_type": entity_type,
        "is_resident_individual": is_individual,
        "deemed_submission": {
            "threshold_key": threshold_key,
            "threshold_inr": _dec(threshold.get("amount_inr")),
            "has_ceiling": bool(threshold.get("has_ceiling")),
            "description": threshold.get("description"),
            "regulation_reference": threshold.get("regulation_reference"),
            "source": threshold.get("source"),
            "last_verified": threshold.get("last_verified"),
            "verified": bool(threshold.get("verified")),
        },
        "specified_authority": _authority(r["specified_authorities"]["dta_services"]),
        "required_identifiers": ["pan", "gstin", "lut_number"],
        "missing": missing,
        "covered": not missing,
    }


def self_declaration_eligibility(
    *, entity_type: str | None, amount_inr: Decimal, rules: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Whether deemed EDF submission / self-declaration applies for this entity and amount."""
    r = rules or load_rules()
    is_individual = _is_resident_individual(entity_type)
    threshold_key = (
        "deemed_submission_resident_individual"
        if is_individual
        else "deemed_submission_non_individual"
    )
    threshold = r["thresholds"][threshold_key]
    ceiling = _dec(threshold.get("amount_inr"))
    if is_individual:
        eligible = True
        reason = "Resident individual: no monetary ceiling under the First Proviso to Regulation 3(2)."
    elif ceiling is None:
        eligible = False
        reason = "No monetary ceiling configured for non-individual deemed submission."
    else:
        eligible = Decimal(amount_inr) <= ceiling
        reason = (
            f"Non-individual: eligible when the inward remittance is <= INR {ceiling} "
            f"under the Second Proviso (b) to Regulation 3(2)."
        )
    return {
        "eligible": eligible,
        "reason": reason,
        "entity_type": entity_type,
        "is_resident_individual": is_individual,
        "amount_inr": Decimal(amount_inr),
        "threshold_inr": ceiling,
        "has_ceiling": bool(threshold.get("has_ceiling")),
        "regulation_reference": threshold.get("regulation_reference"),
        "source": threshold.get("source"),
        "last_verified": threshold.get("last_verified"),
        "verified": bool(threshold.get("verified")),
    }


# ---- Status summary ---------------------------------------------------------------


def _iter_entries(node: Any, prefix: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield (path, entry) for every mapping that carries a boolean 'verified' flag."""
    if isinstance(node, dict):
        if isinstance(node.get("verified"), bool):
            yield prefix, node
            return
        for key, value in node.items():
            yield from _iter_entries(value, f"{prefix}.{key}" if prefix else str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from _iter_entries(value, f"{prefix}[{i}]")


def _latest_last_verified(rules: dict[str, Any]) -> str | None:
    dates = [
        e.get("last_verified")
        for _, e in _iter_entries(rules)
        if e.get("last_verified")
    ]
    return max(dates) if dates else None


def rule_status_summary(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Verification status per section, plus every entry still marked unverified."""
    r = rules or load_rules()
    sections: dict[str, Any] = {}
    unverified: list[dict[str, Any]] = []
    for name in _SUMMARY_SECTIONS:
        if name not in r:
            continue
        total = verified = 0
        for path, entry in _iter_entries(r[name]):
            total += 1
            if entry.get("verified"):
                verified += 1
            else:
                unverified.append(
                    {
                        "section": name,
                        "key": path,
                        "reason": entry.get("source")
                        or "marked verified: false in rules",
                    }
                )
        sections[name] = {
            "total": total,
            "verified": verified,
            "unverified": total - verified,
        }
    return {
        "source": "rules/india_export.yaml",
        "version": r.get("version"),
        "last_updated": r.get("last_updated"),
        "verification_status": r.get("g2_status"),
        "verified": r.get("g2_status") == "complete_verified",
        "last_verified": _latest_last_verified(r),
        "sections": sections,
        "unverified": unverified,
        "deadlines": {
            key: {
                "days": v.get("days"),
                "months": v.get("months"),
                "period_type": v.get("period_type"),
                "description": v.get("description"),
                "regulation_reference": v.get("regulation_reference"),
                "source": v.get("source"),
                "last_verified": v.get("last_verified"),
                "verified": bool(v.get("verified")),
            }
            for key, v in r["deadlines"].items()
        },
    }


# ---- Matching configuration (B11) -------------------------------------------------
#
# All weights and thresholds for the deterministic matching engine live in the
# YAML `matching` section; nothing is hardcoded in the engine (AGENTS.md rule 6).


def matching_rules(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """The raw ``matching`` block, or a clear error when it is absent."""
    r = rules or load_rules()
    section = r.get("matching")
    if not isinstance(section, dict):
        raise RulesConfigError("rules: 'matching' section is required (B11)")
    return section


def matching_engine_version(*, rules: dict[str, Any] | None = None) -> str:
    """Identifier stamped onto every MatchRecord so a decision is reproducible."""
    return str(matching_rules(rules=rules).get("engine_version") or "unknown")


def matching_fx_rates(*, rules: dict[str, Any] | None = None) -> dict[str, Decimal]:
    """Simulated reference rates (foreign unit -> INR) used only to detect FX variance."""
    section = matching_rules(rules=rules)
    ref = section.get("reference_rates_inr") or {}
    rates = ref.get("rates") if isinstance(ref, dict) else None
    if not isinstance(rates, dict) or not rates:
        raise RulesConfigError(
            "rules: matching.reference_rates_inr.rates must be a non-empty mapping"
        )
    return {str(k).upper(): Decimal(str(v)) for k, v in rates.items()}


def matching_config(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of the ``matching`` block: weights, thresholds and tolerances."""
    section = matching_rules(rules=rules)
    confidence = section.get("confidence") or {}
    weights = section.get("weights_bp") or {}
    suffixes = section.get("remitter_legal_suffixes") or []
    return {
        "engine_version": matching_engine_version(rules=rules),
        "date_window_days": int(section.get("date_window_days", 0)),
        "amount_tolerance": _dec(section.get("amount_tolerance")) or Decimal("0"),
        "fx_variance_tolerance_percent": _dec(
            section.get("fx_variance_tolerance_percent")
        )
        or Decimal("0"),
        "high_bp": int(confidence.get("high_bp", 10000)),
        "medium_bp": int(confidence.get("medium_bp", 5000)),
        "weights_bp": {str(k): int(v) for k, v in weights.items()},
        "remitter_legal_suffixes": [str(s).lower() for s in suffixes],
    }


# ---- Exception configuration (B13) -----------------------------------------------
#
# Which categories raise an exception and at what severity comes from the YAML
# `exceptions` section; nothing is hardcoded in the engine (AGENTS.md rule 6).

# Ledger-level categories are derived from ledger gaps, not from a match record.
EXCEPTION_CATEGORIES = (
    "unmatched",
    "ambiguous",
    "duplicate",
    "fx_variance",
    "missing_reference",
    "missing_fira",
    "missing_payment",
    "orphan_payment",
)


def exception_rules(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """The raw ``exceptions`` block, or a clear error when it is absent."""
    r = rules or load_rules()
    section = r.get("exceptions")
    if not isinstance(section, dict):
        raise RulesConfigError("rules: 'exceptions' section is required (B13)")
    return section


def exception_engine_version(*, rules: dict[str, Any] | None = None) -> str:
    """Identifier stamped onto every exception record so derivation is reproducible."""
    return str(exception_rules(rules=rules).get("engine_version") or "unknown")


def exception_config(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of the ``exceptions`` block: per-category enablement and severity."""
    section = exception_rules(rules=rules)
    raw = section.get("categories") or {}
    if not isinstance(raw, dict) or not raw:
        raise RulesConfigError(
            "rules: exceptions.categories must be a non-empty mapping"
        )
    categories: dict[str, dict[str, Any]] = {}
    for name in EXCEPTION_CATEGORIES:
        spec = raw.get(name) or {}
        categories[name] = {
            "enabled": bool(spec.get("enabled", False)),
            "severity": str(spec.get("severity") or "medium").lower(),
        }
    return {
        "engine_version": exception_engine_version(rules=rules),
        "default_severity": str(section.get("default_severity") or "medium").lower(),
        "auto_close_note": str(
            section.get("auto_close_note") or "Condition no longer present"
        ),
        "categories": categories,
    }


# ---- Purpose adviser configuration (B12) -----------------------------------------
#
# The keyword lexicon, signal weights and confidence thresholds live in the YAML
# `purpose_adviser` section; nothing is hardcoded in the engine (AGENTS.md rule 6).


def purpose_adviser_rules(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """The raw ``purpose_adviser`` block, or a clear error when it is absent."""
    r = rules or load_rules()
    section = r.get("purpose_adviser")
    if not isinstance(section, dict):
        raise RulesConfigError("rules: 'purpose_adviser' section is required (B12)")
    return section


def purpose_adviser_engine_version(*, rules: dict[str, Any] | None = None) -> str:
    """Identifier stamped onto every recommendation so advice is reproducible."""
    return str(purpose_adviser_rules(rules=rules).get("engine_version") or "unknown")


def purpose_adviser_config(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of the ``purpose_adviser`` block: lexicon, weights and thresholds."""
    section = purpose_adviser_rules(rules=rules)
    keywords = section.get("keywords") or {}
    if not isinstance(keywords, dict) or not keywords:
        raise RulesConfigError(
            "rules: purpose_adviser.keywords must be a non-empty mapping"
        )
    weights = section.get("weights_bp") or {}
    if not isinstance(weights, dict) or not weights:
        raise RulesConfigError(
            "rules: purpose_adviser.weights_bp must be a non-empty mapping"
        )
    confidence = section.get("confidence") or {}
    return {
        "engine_version": purpose_adviser_engine_version(rules=rules),
        "fallback_code": str(section.get("fallback_code") or "P1099"),
        "history_token_overlap_percent": _dec(
            section.get("history_token_overlap_percent")
        )
        or Decimal("0"),
        "stopwords": [str(word).lower() for word in section.get("stopwords") or []],
        "keywords": {
            str(code): [str(phrase).lower() for phrase in phrases]
            for code, phrases in keywords.items()
        },
        "weights_bp": {str(k): int(v) for k, v in weights.items()},
        "high_bp": int(confidence.get("high_bp", 7000)),
        "medium_bp": int(confidence.get("medium_bp", 4000)),
    }


def list_purpose_codes(*, rules: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Catalogue of purpose codes (for display), sorted by code."""
    r = rules or load_rules()
    codes = r.get("purpose_codes") or {}
    return [
        {
            "code": str(spec.get("code") or code),
            "description": str(spec.get("description") or ""),
            "category": str(spec.get("category") or ""),
            "verified": bool(spec.get("verified", False)),
        }
        for code, spec in sorted(codes.items())
    ]


# ---- EDF pack configuration (B16) -------------------------------------------------
#
# EDF constants, the included-status policy and the blocking-exception policy live
# in the YAML `edf_pack` section; nothing is hardcoded in the engine (rule 6).


def _add_months(d: date, months: int) -> date:
    """Add calendar months to a date, clamping the day to the target month length."""
    zero_based = d.month - 1 + months
    year = d.year + zero_based // 12
    month = zero_based % 12 + 1
    last_day = _last_day_of_month(date(year, month, 1)).day
    return date(year, month, min(d.day, last_day))


def realisation_due_date(
    invoice_date: date, currency: str | None, *, rules: dict[str, Any] | None = None
) -> date:
    """Realisation deadline: ``months`` after the invoice date, from the YAML.

    INR-settled invoices use the longer INR window; every other currency uses the
    standard window (Regulation 5(1), Second Amendment 2026).
    """
    r = rules or load_rules()
    key = (
        "realisation_period_inr_settlement"
        if (currency or "").strip().upper() == "INR"
        else "realisation_period_standard"
    )
    spec = r["deadlines"][key]
    if spec.get("period_type") != "months_from_invoice_date":
        raise RulesConfigError(
            f"unsupported period_type for {key}: {spec.get('period_type')}"
        )
    return _add_months(invoice_date, int(spec["months"]))


def edf_pack_rules(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """The raw ``edf_pack`` block, or a clear error when it is absent."""
    r = rules or load_rules()
    section = r.get("edf_pack")
    if not isinstance(section, dict):
        raise RulesConfigError("rules: 'edf_pack' section is required (B16)")
    return section


def edf_pack_engine_version(*, rules: dict[str, Any] | None = None) -> str:
    """Identifier stamped onto every pack so a generated worksheet is reproducible."""
    return str(edf_pack_rules(rules=rules).get("engine_version") or "unknown")


def edf_pack_config(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of the ``edf_pack`` block: constants, policy lists and template."""
    section = edf_pack_rules(rules=rules)
    blocking = section.get("blocking_exception_categories")
    if not isinstance(blocking, list):
        raise RulesConfigError(
            "rules: edf_pack.blocking_exception_categories must be a list"
        )
    statuses = section.get("included_statuses")
    if not isinstance(statuses, list) or not statuses:
        raise RulesConfigError(
            "rules: edf_pack.included_statuses must be a non-empty list"
        )
    return {
        "engine_version": edf_pack_engine_version(rules=rules),
        "trade_type": str(section.get("trade_type") or "Service"),
        "mode_of_transport": str(section.get("mode_of_transport") or ""),
        "category_of_exporter": str(section.get("category_of_exporter") or ""),
        "mode_of_realisation": str(section.get("mode_of_realisation") or ""),
        "consignee_for_multiple": str(
            section.get("consignee_for_multiple") or "As per 2B"
        ),
        "country_for_multiple": str(section.get("country_for_multiple") or "As per 2B"),
        "date_placeholder": str(section.get("date_placeholder") or "N/A"),
        "included_statuses": [str(s).upper() for s in statuses],
        "blocking_exception_categories": [str(c) for c in blocking],
        "worksheet_note": str(section.get("worksheet_note") or ""),
        "declaration_template": str(section.get("declaration_template") or ""),
    }


# ---- AI layer configuration (B8) --------------------------------------------------
#
# The task registry, provider/model defaults, limits and the PII detector set live
# in the YAML `ai` section; nothing is hardcoded in the AI layer (AGENTS.md rule 6).
# Only the two task-oriented adopters exist: purpose_explain and
# exception_remediation. There is deliberately no generic chat task.

# Task names supported by the task-oriented AI layer, in display order.
AI_TASKS = ("purpose_explain", "exception_remediation")


def ai_rules(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """The raw ``ai`` block, or a clear error when it is absent."""
    r = rules or load_rules()
    section = r.get("ai")
    if not isinstance(section, dict):
        raise RulesConfigError("rules: 'ai' section is required (B8)")
    return section


def ai_engine_version(*, rules: dict[str, Any] | None = None) -> str:
    """Identifier stamped onto every AI proposal so a proposal is reproducible."""
    return str(ai_rules(rules=rules).get("engine_version") or "unknown")


def ai_task_config(task: str, *, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of one ``ai.tasks.<task>`` entry: enablement, model and weights."""
    section = ai_rules(rules=rules)
    raw = section.get("tasks") or {}
    spec = raw.get(task)
    if not isinstance(spec, dict):
        raise RulesConfigError(f"rules: ai.tasks.{task} is required (B8)")
    weights = spec.get("verify_weights_bp") or {}
    return {
        "task": task,
        "enabled": bool(spec.get("enabled", False)),
        "task_version": str(spec.get("task_version") or ai_engine_version(rules=rules)),
        "provider": str(spec.get("provider") or section.get("default_provider") or ""),
        "model": str(spec.get("model") or section.get("default_model") or ""),
        "high_bp": int(spec.get("high_bp", 7000)),
        "medium_bp": int(spec.get("medium_bp", 4000)),
        "verify_weights_bp": {str(k): int(v) for k, v in weights.items()},
    }


def ai_config(*, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """Typed view of the ``ai`` block: tasks, limits and the PII detector set."""
    section = ai_rules(rules=rules)
    limits = section.get("limits") or {}
    pii = section.get("pii") or {}
    detectors = pii.get("detectors") or {}
    if not isinstance(detectors, dict) or not detectors:
        raise RulesConfigError("rules: ai.pii.detectors must be a non-empty mapping")
    return {
        "engine_version": ai_engine_version(rules=rules),
        "default_provider": str(section.get("default_provider") or ""),
        "default_model": str(section.get("default_model") or ""),
        "tasks": {task: ai_task_config(task, rules=rules) for task in AI_TASKS},
        "limits": {
            "max_prompt_bytes": int(limits.get("max_prompt_bytes", 16000)),
            "max_output_tokens": int(limits.get("max_output_tokens", 1024)),
            "max_retries": int(limits.get("max_retries", 2)),
            "timeout_seconds": float(limits.get("timeout_seconds", 30.0)),
            "temperature": float(limits.get("temperature", 0.0)),
        },
        "pii": {
            "placeholder_format": str(
                pii.get("placeholder_format") or "[[{kind}_{n}]]"
            ),
            "detectors": {str(k): str(v) for k, v in detectors.items()},
        },
    }
