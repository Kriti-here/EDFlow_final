"""Tests for B8B: provider contract, null provider and the record/replay cache."""

from __future__ import annotations

import dataclasses
import json

import pytest
from app.ai.cache import (
    AICacheError,
    CacheMiss,
    CacheMode,
    RecordReplayCache,
    cache_key,
)
from app.ai.provider import (
    AIDisabled,
    LLMProvider,
    ProviderRequest,
    ProviderResponse,
)
from app.ai.providers.null import NullProvider


def _request(**over) -> ProviderRequest:
    base = {
        "task": "purpose_explain",
        "task_version": "b8.1",
        "system_prompt": "You are a helper.",
        "user_prompt": "Explain P0101.",
    }
    base.update(over)
    return ProviderRequest(**base)


def _response(**over) -> ProviderResponse:
    base = {
        "text": "Because it fits.",
        "provider": "gemini",
        "model": "gemini-2.0-flash",
    }
    base.update(over)
    return ProviderResponse(**base)


# ---- Provider contract and null provider ------------------------------------


def test_null_provider_satisfies_protocol_and_raises_when_disabled():
    provider = NullProvider()
    assert isinstance(provider, LLMProvider)
    assert provider.name == "none"
    with pytest.raises(AIDisabled):
        provider.complete(_request())


def test_provider_dataclasses_are_frozen():
    request = _request()
    with pytest.raises(dataclasses.FrozenInstanceError):
        request.task = "other"
    response = _response()
    with pytest.raises(dataclasses.FrozenInstanceError):
        response.text = "other"


# ---- Cache key --------------------------------------------------------------


def test_cache_key_is_deterministic_and_sensitive_to_input():
    assert cache_key(_request()) == cache_key(_request())  # deterministic
    assert cache_key(_request()) != cache_key(_request(user_prompt="Different."))
    assert cache_key(_request()) != cache_key(_request(task_version="b8.2"))


# ---- Cache modes ------------------------------------------------------------


def test_off_mode_never_reads_or_writes(tmp_path):
    cache = RecordReplayCache(mode=CacheMode.OFF, cache_dir=tmp_path)
    assert cache.get(_request()) is None
    assert cache.put(_request(), _response()) is False
    assert list(tmp_path.iterdir()) == []


def test_live_mode_bypasses_the_cache(tmp_path):
    cache = RecordReplayCache(mode="live", cache_dir=tmp_path)
    assert cache.get(_request()) is None
    assert cache.put(_request(), _response()) is False
    assert list(tmp_path.iterdir()) == []


def test_record_mode_writes_on_miss_and_hits_afterwards(tmp_path):
    cache = RecordReplayCache(mode="record", cache_dir=tmp_path)
    assert cache.get(_request()) is None  # miss
    original = _response(is_synthetic=True, raw={"finish": "STOP"})
    assert cache.put(_request(), original) is True
    served = cache.get(_request())
    assert served == original  # text/provider/model/is_synthetic/raw round-trip
    assert (tmp_path / f"{cache_key(_request())}.json").is_file()


def test_record_mode_overwrites_existing_entry(tmp_path):
    cache = RecordReplayCache(mode="record", cache_dir=tmp_path)
    cache.put(_request(), _response(text="cached"))
    cache.put(_request(), _response(text="updated"))
    assert cache.get(_request()).text == "updated"


def test_replay_mode_serves_recorded_without_writing(tmp_path):
    RecordReplayCache(mode="record", cache_dir=tmp_path).put(_request(), _response())
    replay = RecordReplayCache(mode="replay", cache_dir=tmp_path)
    assert replay.get(_request()).text == "Because it fits."
    # replay never writes, even when asked to.
    assert replay.put(_request(), _response(text="new")) is False


def test_replay_mode_raises_on_miss(tmp_path):
    replay = RecordReplayCache(mode="replay", cache_dir=tmp_path)
    with pytest.raises(CacheMiss):
        replay.get(_request())


def test_corrupt_entry_surfaces_as_cache_error(tmp_path):
    request = _request()
    (tmp_path / f"{cache_key(request)}.json").write_text("{ not json", encoding="utf-8")
    cache = RecordReplayCache(mode="replay", cache_dir=tmp_path)
    with pytest.raises(AICacheError):
        cache.get(request)


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        RecordReplayCache(mode="turbo")


def test_recorded_file_is_plain_json(tmp_path):
    cache = RecordReplayCache(mode="record", cache_dir=tmp_path)
    cache.put(_request(), _response(raw={"a": 1}))
    data = json.loads((tmp_path / f"{cache_key(_request())}.json").read_text("utf-8"))
    assert data["raw"] == {"a": 1}
    assert data["provider"] == "gemini"
