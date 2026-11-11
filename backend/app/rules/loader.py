"""Loads and validates rules/india_export.yaml.

Regulations live as data (AGENTS.md rule 6); this module is the only place that
reads the file. It fails fast on malformed config and caches the parsed mapping
so repeated lookups are cheap.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import yaml

from ..config import get_settings

REQUIRED_TOP_LEVEL = (
    "version",
    "last_updated",
    "governing_regulations",
    "deadlines",
    "thresholds",
    "purpose_codes",
    "specified_authorities",
)
REQUIRED_DEADLINES = ("service_edf_submission",)
REQUIRED_THRESHOLDS = (
    "deemed_submission_resident_individual",
    "deemed_submission_non_individual",
)

_CACHE: dict[tuple[str, int], dict[str, Any]] = {}
_LOCK = threading.Lock()


class RulesConfigError(Exception):
    """Raised when rules/india_export.yaml is missing, unreadable or malformed."""


def rules_path() -> Path:
    """Configured path to the rules file (overridable via Settings.rules_path)."""
    return Path(get_settings().rules_path)


def load_rules(path: str | Path | None = None) -> dict[str, Any]:
    """Return the validated rules mapping, cached by file path and mtime."""
    p = Path(path) if path is not None else rules_path()
    try:
        stat = p.stat()
    except OSError as e:
        raise RulesConfigError(f"rules file not found: {p} ({e})") from e
    key = (str(p.resolve()), stat.st_mtime_ns)
    with _LOCK:
        hit = _CACHE.get(key)
        if hit is not None:
            return hit
    try:
        raw = p.read_text(encoding="utf-8")
    except OSError as e:
        raise RulesConfigError(f"cannot read rules file: {p} ({e})") from e
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        raise RulesConfigError(f"invalid YAML in {p}: {e}") from e
    validate(data, source=str(p))
    with _LOCK:
        _CACHE.clear()  # keep a single current version in memory
        _CACHE[key] = data
    return data


def validate(data: Any, source: str = "india_export.yaml") -> None:
    """Structural check that must pass before the file is used. Raises RulesConfigError."""
    if not isinstance(data, dict):
        raise RulesConfigError(f"{source}: top level must be a mapping")
    missing = [k for k in REQUIRED_TOP_LEVEL if k not in data]
    if missing:
        raise RulesConfigError(f"{source}: missing required keys: {missing}")
    for key in ("deadlines", "thresholds", "purpose_codes", "specified_authorities"):
        if not isinstance(data.get(key), dict) or not data[key]:
            raise RulesConfigError(f"{source}: '{key}' must be a non-empty mapping")
    for key in REQUIRED_DEADLINES:
        if key not in data["deadlines"]:
            raise RulesConfigError(f"{source}: deadlines.{key} is required")
    for key in REQUIRED_THRESHOLDS:
        if key not in data["thresholds"]:
            raise RulesConfigError(f"{source}: thresholds.{key} is required")
    for name, entry in data["deadlines"].items():
        if not isinstance(entry, dict):
            raise RulesConfigError(f"{source}: deadlines.{name} must be a mapping")
        if not isinstance(entry.get("days"), int) and not isinstance(
            entry.get("months"), int
        ):
            raise RulesConfigError(
                f"{source}: deadlines.{name} needs an integer 'days' or 'months'"
            )
        if not isinstance(entry.get("verified"), bool):
            raise RulesConfigError(
                f"{source}: deadlines.{name}.verified must be a boolean"
            )
    for name, entry in data["purpose_codes"].items():
        if not isinstance(entry, dict) or not isinstance(entry.get("verified"), bool):
            raise RulesConfigError(
                f"{source}: purpose_codes.{name} must be a mapping with boolean 'verified'"
            )
