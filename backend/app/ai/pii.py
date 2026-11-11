"""PII masking for the B8 AI layer (AGENTS.md rule 5).

Every string that leaves the process for an LLM passes through a ``Masker``.
Structured identity fields (client/remitter name, email, PAN, GSTIN, account
number, UTR) are replaced with stable per-call tokens; free text (an invoice
description, a contract reference, an exception summary) is scanned with the
detector set from ``rules/india_export.yaml``.

Codes that are deliberately NOT masked (approved B8 decision 4) are never routed
through this module: AD code, IEC code, SAC code, purpose code and currency codes
stay visible because they are business identifiers, not personal data.

The reverse map (token -> original) lives in memory for the duration of one call
and is never persisted, cached or audited.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Fallback detectors (mirror rules/india_export.yaml `ai.pii.detectors`) so the
# output verifier works even without a loaded config.
DEFAULT_DETECTORS: dict[str, str] = {
    "email": r"[\w.+-]+@[\w-]+\.[\w.-]+",
    "gstin": r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
    "pan": r"\b[A-Z]{5}\d{4}[A-Z]\b",
    "utr": r"\b[A-Z]{4}\d{7,}\b",
    # A bare 10-digit run is ambiguous: an IEC code (a business identifier that
    # must stay visible, B8 decision 4) looks identical to a 10-digit account.
    # Account numbers therefore require 11-18 digits and must not directly follow
    # a '+', so the digit body of an international phone falls through to `phone`.
    "account": r"(?<![\d+])\d{11,18}(?!\d)",
    # Phones must carry a leading '+' or an internal separator; otherwise a plain
    # 10-digit run (e.g. an IEC code) would be misread as a phone number.
    "phone": r"(?<!\d)(?=\+|\d[\d\s-]*[-\s])\+?\d[\d\s-]{7,}\d(?!\d)",
}


@dataclass
class MaskedText:
    """The masked payload plus the in-memory reverse map (never persisted)."""

    text: str
    mapping: dict[str, str] = field(default_factory=dict)
    kinds: tuple[str, ...] = ()


class Masker:
    """Deterministic per-call masker: the same value maps to the same token.

    The counter order is the order in which values are masked, so identical input
    always yields identical tokens (required for reproducible record/replay).
    """

    def __init__(
        self,
        *,
        placeholder_format: str = "[[{kind}_{n}]]",
        detectors: dict[str, str] | None = None,
    ) -> None:
        self._fmt = placeholder_format
        self._patterns = {
            str(kind): re.compile(str(pattern))
            for kind, pattern in (detectors or DEFAULT_DETECTORS).items()
        }
        self._counters: dict[str, int] = {}
        self._by_value: dict[tuple[str, str], str] = {}
        self.mapping: dict[str, str] = {}
        self._kinds: set[str] = set()

    def token_for(self, kind: str, value: str) -> str:
        """Return a stable placeholder for one structured PII value (e.g. a name)."""
        if not value:
            return ""
        key = (str(kind), str(value))
        existing = self._by_value.get(key)
        if existing is not None:
            return existing
        self._counters[kind] = self._counters.get(kind, 0) + 1
        token = self._fmt.format(kind=str(kind).upper(), n=self._counters[kind])
        self._by_value[key] = token
        self.mapping[token] = str(value)
        self._kinds.add(str(kind))
        return token

    def mask_text(self, text: str | None) -> str:
        """Replace every detected PII value in free text with a placeholder."""
        masked = "" if text is None else str(text)
        for kind, pattern in self._patterns.items():
            masked = pattern.sub(
                lambda match, kind=kind: self.token_for(kind, match.group(0)), masked
            )
        return masked

    def seal(self, text: str) -> MaskedText:
        """Freeze the masked payload and a copy of the reverse map for one call."""
        return MaskedText(
            text=text, mapping=dict(self.mapping), kinds=tuple(sorted(self._kinds))
        )


def find_pii(text: str | None, *, detectors: dict[str, str] | None = None) -> list[str]:
    """Names of detector kinds still present in ``text`` (used to verify output)."""
    if not text:
        return []
    patterns = detectors or DEFAULT_DETECTORS
    return [
        str(kind)
        for kind, pattern in patterns.items()
        if re.search(str(pattern), str(text))
    ]
