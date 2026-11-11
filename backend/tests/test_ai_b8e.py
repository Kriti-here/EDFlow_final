"""Tests for B8E: the Gemini provider (REST over httpx, no SDK, no network).

Every test injects an ``httpx.MockTransport`` so nothing touches the network.
Covers protocol conformance, the request/response mapping to Gemini's shape, the
typed error surface (``AIProviderError`` / ``AIProviderTimeout``) and retries.
"""

from __future__ import annotations

import json

import httpx
import pytest
from app.ai.provider import LLMProvider, ProviderRequest
from app.ai.providers.gemini import (
    AIProviderError,
    AIProviderTimeout,
    GeminiProvider,
)
from app.config import Settings


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    """Keep the retry loop instant in tests."""
    monkeypatch.setattr(GeminiProvider, "BACKOFF", 0)


@pytest.fixture()
def settings(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-api-key")
    return Settings()


def _request(**over) -> ProviderRequest:
    base = {
        "task": "purpose_explain",
        "task_version": "b8.1",
        "system_prompt": "You are a helper.",
        "user_prompt": "Explain P0101.",
    }
    base.update(over)
    return ProviderRequest(**base)


def _ok(text: str = "Because it fits.", *, finish: str = "STOP", total: int = 42):
    return {
        "candidates": [
            {
                "content": {"role": "model", "parts": [{"text": text}]},
                "finishReason": finish,
            }
        ],
        "usageMetadata": {"totalTokenCount": total},
        "modelVersion": "gemini-2.0-flash",
    }


def _provider(handler, settings, *, model="gemini-2.0-flash") -> GeminiProvider:
    client = httpx.Client(
        base_url=settings.ai_base_url, transport=httpx.MockTransport(handler)
    )
    return GeminiProvider(settings=settings, model=model, client=client)


# ---- Protocol and defaults --------------------------------------------------


def test_gemini_provider_satisfies_protocol(settings):
    provider = _provider(lambda r: httpx.Response(200, json=_ok()), settings)
    assert isinstance(provider, LLMProvider)
    assert provider.name == "gemini"
    assert provider.model == "gemini-2.0-flash"


def test_model_defaults_from_rules(settings):
    client = httpx.Client(
        base_url=settings.ai_base_url,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json=_ok())),
    )
    assert GeminiProvider(settings=settings, client=client).model == "gemini-2.0-flash"


# ---- Request mapping --------------------------------------------------------


def test_request_maps_to_gemini_shape(settings):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, json=_ok("hello"))

    provider = _provider(handler, settings)
    provider.complete(_request())

    assert "/v1beta/models/gemini-2.0-flash:generateContent" in captured["url"]
    # the secret travels as a header, never in the URL (rule 3)
    assert "key=" not in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "test-api-key"

    body = captured["body"]
    assert body["system_instruction"]["parts"][0]["text"] == "You are a helper."
    assert body["contents"][0]["role"] == "user"
    assert body["contents"][0]["parts"][0]["text"] == "Explain P0101."
    config = body["generationConfig"]
    assert config["temperature"] == 0.0
    assert config["maxOutputTokens"] == 1024
    assert config["responseMimeType"] == "application/json"


def test_request_temperature_and_max_tokens_are_forwarded(settings):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_ok())

    _provider(handler, settings).complete(
        _request(temperature=0.3, max_output_tokens=256)
    )
    assert captured["body"]["generationConfig"]["temperature"] == 0.3
    assert captured["body"]["generationConfig"]["maxOutputTokens"] == 256


# ---- Response mapping -------------------------------------------------------


def test_response_maps_to_provider_response(settings):
    provider = _provider(
        lambda r: httpx.Response(200, json=_ok("mapped text")), settings
    )
    response = provider.complete(_request())
    assert response.text == "mapped text"
    assert response.provider == "gemini"
    assert response.model == "gemini-2.0-flash"
    assert response.is_synthetic is False
    assert response.raw["finish_reason"] == "STOP"
    assert response.raw["usage_metadata"]["totalTokenCount"] == 42


def test_multiple_parts_are_concatenated(settings):
    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "part one "}, {"text": "part two"}],
                },
                "finishReason": "STOP",
            }
        ]
    }
    provider = _provider(lambda r: httpx.Response(200, json=payload), settings)
    assert provider.complete(_request()).text == "part one part two"


# ---- Typed errors -----------------------------------------------------------


def test_missing_api_key_raises_provider_error(settings):
    settings.ai_api_key = ""
    provider = _provider(lambda r: httpx.Response(200, json=_ok()), settings)
    with pytest.raises(AIProviderError):
        provider.complete(_request())


def test_http_error_raises_provider_error(settings):
    provider = _provider(
        lambda r: httpx.Response(400, json={"error": {"message": "bad request"}}),
        settings,
    )
    with pytest.raises(AIProviderError) as excinfo:
        provider.complete(_request())
    assert "400" in str(excinfo.value)


def test_safety_block_raises_provider_error(settings):
    payload = {"candidates": [], "promptFeedback": {"blockReason": "SAFETY"}}
    provider = _provider(lambda r: httpx.Response(200, json=payload), settings)
    with pytest.raises(AIProviderError) as excinfo:
        provider.complete(_request())
    assert "SAFETY" in str(excinfo.value)


def test_empty_text_raises_provider_error(settings):
    payload = {"candidates": [{"content": {"parts": [{"text": "  "}]}}]}
    provider = _provider(lambda r: httpx.Response(200, json=payload), settings)
    with pytest.raises(AIProviderError):
        provider.complete(_request())


def test_timeout_raises_provider_timeout(settings):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("too slow")

    provider = _provider(handler, settings)
    with pytest.raises(AIProviderTimeout):
        provider.complete(_request())


def test_transport_error_raises_provider_error(settings):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    provider = _provider(handler, settings)
    with pytest.raises(AIProviderError):
        provider.complete(_request())


# ---- Retries ----------------------------------------------------------------


def test_retries_on_5xx_then_succeeds(settings):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, text="unavailable")
        return httpx.Response(200, json=_ok("recovered"))

    provider = _provider(handler, settings)
    assert provider.complete(_request()).text == "recovered"
    assert calls["n"] == 2


def test_retries_exhausted_on_persistent_5xx(settings):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, text="boom")

    provider = _provider(handler, settings)
    with pytest.raises(AIProviderError):
        provider.complete(_request())
    assert calls["n"] == 3  # max_retries (2) + 1
