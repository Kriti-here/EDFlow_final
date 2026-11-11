"""AI provider implementations (B8B/B8E).

``NullProvider`` is the safe default whenever AI is disabled; ``GeminiProvider``
is the REST-only live implementation. Importing this package re-exports both so a
caller can select a provider by name without reaching into submodules.
"""

from __future__ import annotations

from .gemini import AIProviderError, AIProviderTimeout, GeminiProvider
from .null import NullProvider

__all__ = [
    "AIProviderError",
    "AIProviderTimeout",
    "GeminiProvider",
    "NullProvider",
]
