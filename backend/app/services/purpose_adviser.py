"""Deterministic purpose code adviser (B12).

Pure and side-effect free: it takes an invoice, the committed ledger history and
the purpose codes seen on FIRA lines already matched to that invoice, plus the
YAML ``purpose_adviser`` configuration, and returns a ranked list of proposed RBI
purpose codes. Persistence, the review lifecycle and audit live in
``app/services/purpose_service.py``.

The adviser never decides anything: it only *proposes*. ``Invoice.purpose_code``
is only changed by an explicit human accept (AGENTS.md rule 2). There is no AI,
no network and no EDF generation here. Scoring is integer-only (basis points) and
every signal weight, threshold and keyword comes from the YAML (AGENTS.md rule 6).

Candidate generation blends:

* lexicon hits in the service description (the earliest then longest phrase is
  the *primary* cue -- the leading term usually carries the classification);
* the purpose code actually seen on a FIRA line matched to this invoice;
* codes the exporter committed on earlier invoices (same client or similar text);
* nodes reachable from the contract reference.

The same inputs always yield the same ranking: candidates sort by
``(score desc, code asc)``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal

# Recommendation lifecycle states owned by the purpose_recommendations table.
PROPOSED = "proposed"
ACCEPTED = "accepted"
REJECTED = "rejected"
SUPERSEDED = "superseded"

# Origins of a proposal.
SOURCE_ADVISER = "adviser"
SOURCE_FIRA_ECHO = "fira_echo"
SOURCE_HISTORY = "history"
SOURCE_FALLBACK = "fallback"

# Confidence bands (mirror the YAML vocabulary).
LOW = "low"
MEDIUM = "medium"
HIGH = "high"

# The signal names; keys must exist in the YAML ``weights_bp`` mapping.
SIGNALS = (
    "keyword_primary",
    "fira_echo",
    "keyword_phrase",
    "history_same_client",
    "history_similar_service",
    "contract_ref_match",
)

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class InvoiceInput:
    """One invoice, flattened for the adviser."""

    id: int
    number: str
    client_id: int
    service_description: str
    contract_ref: str | None


@dataclass(frozen=True)
class HistoryEntry:
    """A previously committed purpose code (source user/adviser_accepted only)."""

    client_id: int
    code: str
    tokens: frozenset[str]


@dataclass
class Recommendation:
    """The adviser's verdict: one proposed purpose code for an invoice."""

    code: str
    rank: int
    confidence_bp: int
    confidence_band: str
    source: str
    score: dict[str, int] = field(default_factory=dict)
    matched_keywords: list[str] = field(default_factory=list)
    rationale: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def normalize_tokens(text: str | None, stopwords: list[str] | set[str]) -> list[str]:
    """Lower-case, strip punctuation and drop stopwords, keeping token order."""
    cleaned = _NON_ALNUM.sub(" ", (text or "").lower())
    return [token for token in cleaned.split() if token and token not in stopwords]


def band_for(bp: int, *, high_bp: int, medium_bp: int) -> str:
    """Map a basis-point score onto a confidence band."""
    if bp >= high_bp:
        return HIGH
    if bp >= medium_bp:
        return MEDIUM
    return LOW


def _find_phrase(description: list[str], phrase: list[str]) -> int | None:
    """Earliest token index where ``phrase`` appears as a contiguous sequence."""
    if not phrase or len(phrase) > len(description):
        return None
    span = len(phrase)
    for start in range(len(description) - span + 1):
        if description[start : start + span] == phrase:
            return start
    return None


def _jaccard_percent(left: set[str], right: set[str]) -> Decimal:
    """Token overlap as an integer-safe percentage (Decimal, never float)."""
    if not left or not right:
        return Decimal("0")
    union = left | right
    return (Decimal(len(left & right)) / Decimal(len(union))) * Decimal("100")


@dataclass(frozen=True)
class _KeywordMatch:
    """One lexicon hit: which code, which phrase and where."""

    code: str
    phrase: str
    position: int
    length: int


def keyword_matches(description: list[str], config: dict) -> list[_KeywordMatch]:
    """Every lexicon hit in the description, deterministic order."""
    stopwords = set(config.get("stopwords") or [])
    matches: list[_KeywordMatch] = []
    for code in sorted(config.get("keywords") or {}):
        for phrase in config["keywords"][code]:
            phrase_tokens = normalize_tokens(phrase, stopwords)
            position = _find_phrase(description, phrase_tokens)
            if position is not None:
                matches.append(
                    _KeywordMatch(
                        code=code,
                        phrase=phrase,
                        position=position,
                        length=len(phrase_tokens),
                    )
                )
    return sorted(matches, key=lambda m: (m.position, -m.length, m.code, m.phrase))


def _primary_code(matches: list[_KeywordMatch]) -> str | None:
    """The leading cue: earliest, then longest, then lowest code."""
    return matches[0].code if matches else None


# ---------------------------------------------------------------------------
# Engine entry point
# ---------------------------------------------------------------------------
def recommend_for_invoice(
    invoice: InvoiceInput,
    *,
    history: list[HistoryEntry] | None = None,
    fira_echo_codes: set[str] | None = None,
    config: dict,
) -> list[Recommendation]:
    """Return the ranked purpose-code proposals for one invoice, deterministically."""
    history = history or []
    fira_echo_codes = fira_echo_codes or set()
    stopwords = set(config.get("stopwords") or [])
    weights = config.get("weights_bp") or {}
    threshold = Decimal(config.get("history_token_overlap_percent") or 0)

    description = normalize_tokens(invoice.service_description, stopwords)
    description_set = set(description)
    contract_tokens = set(normalize_tokens(invoice.contract_ref, stopwords))

    matches = keyword_matches(description, config)
    primary = _primary_code(matches)
    keywords_by_code: dict[str, list[str]] = {}
    for match in matches:
        keywords_by_code.setdefault(match.code, []).append(match.phrase)

    # Candidate set: lexicon hits, FIRA echoes, committed history and contract cues.
    candidates: set[str] = set(keywords_by_code) | set(fira_echo_codes)
    for entry in history:
        candidates.add(entry.code)

    fallback_code = str(config.get("fallback_code") or "P1099")
    if not candidates:
        candidates = {fallback_code}

    scored: list[Recommendation] = []
    for code in candidates:
        phrase_tokens = {
            token
            for phrase in (config.get("keywords") or {}).get(code, [])
            for token in normalize_tokens(phrase, stopwords)
        }
        signals = {
            "keyword_primary": code == primary,
            "fira_echo": code in fira_echo_codes,
            # The weaker lexicon cue applies to non-primary candidates only: the
            # primary code already earns `keyword_primary`, so it must not
            # double-count its own phrase hit.
            "keyword_phrase": code in keywords_by_code and code != primary,
            "history_same_client": any(
                entry.client_id == invoice.client_id and entry.code == code
                for entry in history
            ),
            "history_similar_service": _similar_history_seen(
                code, description_set, history, threshold
            ),
            "contract_ref_match": bool(phrase_tokens & contract_tokens),
        }
        fired = {
            name: int(weights[name])
            for name in SIGNALS
            if signals[name] and name in weights
        }
        total = sum(fired.values())
        keywords = keywords_by_code.get(code, [])
        scored.append(
            Recommendation(
                code=code,
                rank=0,
                confidence_bp=total,
                confidence_band=band_for(
                    total,
                    high_bp=int(config.get("high_bp", 7000)),
                    medium_bp=int(config.get("medium_bp", 4000)),
                ),
                source=_source_for(signals),
                score=fired,
                matched_keywords=list(keywords),
                rationale=_rationale(code, signals, keywords),
            )
        )

    scored.sort(key=lambda rec: (-rec.confidence_bp, rec.code))
    for index, rec in enumerate(scored, start=1):
        rec.rank = index
    return scored


def _similar_history_seen(
    code: str,
    description: set[str],
    history: list[HistoryEntry],
    threshold: Decimal,
) -> bool:
    """True when a prior invoice with a comparable description committed ``code``."""
    for entry in history:
        if entry.code != code:
            continue
        if _jaccard_percent(description, set(entry.tokens)) >= threshold:
            return True
    return False


def _source_for(signals: dict[str, bool]) -> str:
    """The dominant origin of a proposal, in priority order."""
    if signals["keyword_primary"]:
        return SOURCE_ADVISER
    if signals["fira_echo"]:
        return SOURCE_FIRA_ECHO
    if signals["history_same_client"] or signals["history_similar_service"]:
        return SOURCE_HISTORY
    if signals["keyword_phrase"] or signals["contract_ref_match"]:
        return SOURCE_ADVISER
    return SOURCE_FALLBACK


def _rationale(code: str, signals: dict[str, bool], keywords: list[str]) -> str:
    """Human-readable explanation of why the code was proposed."""
    parts: list[str] = []
    if keywords:
        parts.append("matched description keywords: " + ", ".join(keywords))
    if signals["fira_echo"]:
        parts.append("code seen on a matching FIRA line")
    if signals["history_same_client"]:
        parts.append("used previously for this client")
    if signals["history_similar_service"]:
        parts.append("used previously on a similar service")
    if signals["contract_ref_match"]:
        parts.append("suggested by the contract reference")
    if not parts:
        parts.append("no signal matched; other business services fallback")
    return f"{code}: " + "; ".join(parts)
