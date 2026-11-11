"""File-backed record/replay cache for provider responses (B8B).

The cache is what makes the AI layer reproducible and demo-safe: a run can serve
recorded answers (``replay``) with zero network access, or record answers once
(``record``) so later runs replay them (AGENTS.md rules 7 and 10). It only stores
bytes on disk -- it never calls a provider itself, so wiring it never triggers
an egress on its own.

Entries are keyed by a deterministic hash of the masked request, so identical
input always maps to the same file and the same answer.
"""

from __future__ import annotations

import hashlib
import json
from enum import Enum
from pathlib import Path

from .provider import ProviderRequest, ProviderResponse


class CacheMode(str, Enum):
    """How the cache behaves, mirroring ``Settings.ai_mode``."""

    OFF = "off"
    REPLAY = "replay"
    RECORD = "record"
    LIVE = "live"


class AICacheError(RuntimeError):
    """Raised when a cache file exists but cannot be read or parsed."""


class CacheMiss(LookupError):
    """Raised by ``replay`` on a miss, because a replay run must never fall back."""


def cache_key(request: ProviderRequest) -> str:
    """Deterministic identity for a request (the cache file name, without suffix).

    The key covers every field that can change an answer, so changing the prompt
    or the task version produces a different entry. It is a plain SHA-256 hex
    digest of canonical JSON -- no secrets and no PII (the request is masked
    before it reaches the provider).
    """
    canonical = json.dumps(
        {
            "task": request.task,
            "task_version": request.task_version,
            "system_prompt": request.system_prompt,
            "user_prompt": request.user_prompt,
            "temperature": request.temperature,
            "max_output_tokens": request.max_output_tokens,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class RecordReplayCache:
    """A cache whose behaviour is chosen by mode (off / replay / record / live).

    * ``off``    - disabled: reads always miss and writes are ignored. The caller
      must not call a provider at all in this mode.
    * ``replay`` - read-only: a hit is served from disk, a miss raises
      ``CacheMiss`` so no network fallback can happen.
    * ``record`` - read-through: a hit is served, a miss returns ``None`` so the
      caller can call the provider and then ``put`` the answer.
    * ``live``   - bypass: reads always miss and writes are ignored, so answers
      are never persisted.
    """

    def __init__(
        self,
        *,
        mode: CacheMode | str = CacheMode.OFF,
        cache_dir: str | Path | None = None,
    ) -> None:
        try:
            self.mode = mode if isinstance(mode, CacheMode) else CacheMode(str(mode))
        except ValueError as e:
            raise ValueError(f"unknown cache mode: {mode!r}") from e
        self.cache_dir = Path(cache_dir) if cache_dir is not None else None

    def get(self, request: ProviderRequest) -> ProviderResponse | None:
        """Serve a recorded response, or ``None``/raise depending on mode."""
        if self.mode in (CacheMode.OFF, CacheMode.LIVE):
            return None
        path = self._path(request)
        if not path.is_file():
            if self.mode is CacheMode.REPLAY:
                raise CacheMiss(f"no recorded response for key {path.stem}")
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            raise AICacheError(f"cannot read cache entry {path}: {e}") from e
        return ProviderResponse(**data)

    def put(self, request: ProviderRequest, response: ProviderResponse) -> bool:
        """Persist a response in ``record`` mode; ignored in every other mode."""
        if self.mode is not CacheMode.RECORD:
            return False
        path = self._path(request)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "text": response.text,
            "provider": response.provider,
            "model": response.model,
            "is_synthetic": response.is_synthetic,
            "raw": response.raw,
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        return True

    def _path(self, request: ProviderRequest) -> Path:
        if self.cache_dir is None:
            raise AICacheError("cache_dir is not configured")
        key = request.request_key or cache_key(request)
        return self.cache_dir / f"{key}.json"
