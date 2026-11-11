"""Google Gemini provider: REST over ``httpx`` only, no SDK (B8E).

This is the one component that may touch the network for AI egress. It is
deliberately dumb and task-oriented: a masked ``ProviderRequest`` goes in, a raw
``ProviderResponse`` comes out. It never creates, sends, captures or pays
anything and never persists business records (AGENTS.md rule 2).

Design notes:

* **REST only / httpx only** -- a plain ``POST`` to ``models/{model}:generateContent``
  using ``httpx``. There is deliberately no ``google-generativeai`` SDK.
* **The API key is a header, never a query string** so it can never leak into a
  URL, a log line or a cache key (AGENTS.md rule 3). The key is read only from
  ``Settings`` (environment), never passed in code.
* **The model and limits come from the YAML ``ai`` block** (rule 6), not
  hardcoded here; an explicit ``model`` may still be injected by the caller.
* **Failures are typed**: ``AIProviderError`` for any bad response and
  ``AIProviderTimeout`` for a timeout, so the caller never has to guess.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from ...config import Settings, get_settings
from ...rules import engine as rules_engine
from ..provider import ProviderRequest, ProviderResponse

# Google Generative Language REST surface. The version is part of the mock
# endpoint contract and stays here as the single source of truth.
_API_VERSION = "v1beta"
# Status codes worth one more attempt before giving up.
_RETRY_STATUS = (429, 500, 502, 503, 504)


class AIProviderError(RuntimeError):
    """Raised when a provider call fails: bad HTTP status, bad payload or no key."""


class AIProviderTimeout(AIProviderError):
    """Raised when a provider call exceeds the configured timeout."""


class GeminiProvider:
    """``LLMProvider`` implementation backed by the Gemini REST API (httpx only)."""

    name = "gemini"
    BACKOFF = 0.5  # seconds between retries; tests set this to 0

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        model: str | None = None,
        client: httpx.Client | None = None,
        rules: dict[str, Any] | None = None,
    ) -> None:
        self.s = settings or get_settings()
        config = rules_engine.ai_config(rules=rules)
        # Model and limits are data (rule 6); an explicit model overrides the YAML.
        self.model = model or config["default_model"]
        limits = config["limits"]
        self._timeout = float(limits["timeout_seconds"])
        self._max_attempts = max(1, int(limits["max_retries"]) + 1)
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=self.s.ai_base_url, timeout=self._timeout
        )

    def close(self) -> None:
        """Close the owned HTTP client (a no-op when a client was injected)."""
        if self._owns_client:
            self._client.close()

    def complete(self, request: ProviderRequest) -> ProviderResponse:
        """Map one task request to a Gemini call and back to a ``ProviderResponse``."""
        if not self.s.ai_api_key:
            raise AIProviderError(
                "missing Gemini API key; set AI_API_KEY in the environment"
            )
        url = f"/{_API_VERSION}/models/{self.model}:generateContent"
        data = self._post(
            url,
            self._build_payload(request),
            {
                "Content-Type": "application/json",
                "x-goog-api-key": self.s.ai_api_key,
            },
        )
        return ProviderResponse(
            text=self._extract_text(data),
            provider=self.name,
            model=self.model,
            is_synthetic=False,
            raw=self._raw_meta(data),
        )

    @staticmethod
    def _build_payload(request: ProviderRequest) -> dict[str, Any]:
        """``ProviderRequest`` -> Gemini ``generateContent`` body (deterministic JSON)."""
        return {
            "system_instruction": {"parts": [{"text": request.system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_output_tokens,
                # Ask the model for a bare JSON object the task schema can parse.
                "responseMimeType": "application/json",
            },
        }

    def _post(
        self, url: str, payload: dict[str, Any], headers: dict[str, str]
    ) -> dict[str, Any]:
        """POST with bounded retries; every failure path raises a typed error."""
        for attempt in range(self._max_attempts):
            last = attempt + 1 >= self._max_attempts
            try:
                r = self._client.post(url, json=payload, headers=headers)
            except httpx.TimeoutException as e:
                if last:
                    raise AIProviderTimeout(f"Gemini request timed out: {e}") from e
                self._sleep(attempt)
                continue
            except httpx.TransportError as e:
                if last:
                    raise AIProviderError(f"Gemini transport error: {e}") from e
                self._sleep(attempt)
                continue
            if r.status_code in _RETRY_STATUS and not last:
                self._sleep(attempt)
                continue
            if r.status_code >= 400:
                raise AIProviderError(f"Gemini HTTP {r.status_code}: {r.text[:300]}")
            try:
                return r.json()
            except ValueError as e:
                raise AIProviderError(f"Gemini returned invalid JSON: {e}") from e

    def _sleep(self, attempt: int) -> None:
        time.sleep(self.BACKOFF * 2**attempt)

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        """Pull the answer text out of the first candidate, or fail loudly."""
        candidates = data.get("candidates") or []
        if not candidates:
            block = (data.get("promptFeedback") or {}).get("blockReason")
            raise AIProviderError(
                f"Gemini returned no candidates (blockReason={block})"
            )
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(
            str(part.get("text", "")) for part in parts if isinstance(part, dict)
        )
        if not text.strip():
            raise AIProviderError("Gemini returned an empty response")
        return text

    @staticmethod
    def _raw_meta(data: dict[str, Any]) -> dict[str, Any]:
        """Provenance worth replaying/auditing: finish reason and token usage."""
        candidate = (data.get("candidates") or [{}])[0]
        return {
            "finish_reason": candidate.get("finishReason"),
            "usage_metadata": data.get("usageMetadata") or {},
        }
