"""Null provider: the default when the AI layer is off (B8B).

``AI_MODE=off`` is the safe default, so wiring the nullable provider in must
never make an accidental network call. ``NullProvider`` therefore always raises
``AIDisabled`` -- it produces no output at all, not even a placeholder.
"""

from __future__ import annotations

from ..provider import AIDisabled, ProviderRequest, ProviderResponse


class NullProvider:
    """A provider that refuses to run, used whenever AI is disabled."""

    name = "none"

    def complete(self, request: ProviderRequest) -> ProviderResponse:
        """Always raise: a disabled AI layer must not fabricate an answer."""
        raise AIDisabled(
            f"AI is disabled (provider={self.name}); no call is made for "
            f"task={request.task!r}."
        )
