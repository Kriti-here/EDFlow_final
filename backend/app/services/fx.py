"""Async FX rates from Frankfurter, with caching and a clearly-labelled simulated fallback.

Every money/rate value is a Decimal. Frankfurter returns JSON numbers, so we convert
them with Decimal(str(x)) -- no float ever reaches a calculation. If the network or the
API is unavailable we fall back to a static table and label the source "simulated".
"""

import asyncio
import time
from dataclasses import dataclass
from decimal import Decimal

import httpx

from ..config import Settings, get_settings

# Only used when Frankfurter cannot be reached. Base -> INR, clearly labelled "simulated".
SIMULATED_RATES_TO_INR: dict[str, Decimal] = {
    "INR": Decimal("1"),
    "USD": Decimal("83.20"),
    "EUR": Decimal("90.10"),
    "GBP": Decimal("105.40"),
    "AUD": Decimal("54.60"),
    "CAD": Decimal("60.90"),
    "SGD": Decimal("62.10"),
}

_RATE_CACHE: dict[tuple, tuple["FxRate", float]] = {}
_SIMULATED_TTL_CAP = (
    60  # never cache a simulated rate for long; retry frankerfurter soon
)


class FxError(Exception):
    def __init__(self, action: str, detail: str):
        super().__init__(f"FX {action} failed: {detail[:200]}")
        self.action, self.detail = action, detail


@dataclass(frozen=True)
class FxRate:
    """A single base->quote rate. `source` is one of: frankfurter, simulated, identity."""

    base: str
    quote: str
    rate: Decimal
    source: str
    as_of: (
        str | None
    )  # Frankfurter's reference date, or None for a simulated/identity rate


def simulated_rate(base: str, quote: str) -> FxRate:
    """A labelled placeholder rate. Raises FxError when we have no fallback for the pair."""
    base, quote = base.upper(), quote.upper()
    table = SIMULATED_RATES_TO_INR.get(base)
    if quote != "INR" or table is None:
        raise FxError("simulated fallback", f"no simulated rate for {base}/{quote}")
    return FxRate(base, quote, table, "simulated", None)


class FxClient:
    BACKOFF = 0.5  # seconds; tests set this to 0

    def __init__(self, settings: Settings | None = None):
        self.s = settings or get_settings()
        self._http = httpx.AsyncClient(
            base_url=self.s.frankfurter_base_url, timeout=self.s.fx_timeout_seconds
        )

    async def aclose(self):
        await self._http.aclose()

    async def rate(self, base: str, quote: str) -> FxRate:
        """Return a base->quote rate. Cached; falls back to a labelled simulated rate."""
        base, quote = base.upper(), quote.upper()
        if base == quote:
            return FxRate(base, quote, Decimal("1"), "identity", None)
        key = (self.s.frankfurter_base_url, base, quote)
        cached = _RATE_CACHE.get(key)
        if cached and cached[1] > time.time():
            return cached[0]
        try:
            fetched = await self._fetch(base, quote)
        except (FxError, httpx.HTTPError, ValueError):
            fetched = simulated_rate(base, quote)
        ttl = self.s.fx_cache_ttl_seconds
        if fetched.source != "frankfurter":
            ttl = min(ttl, _SIMULATED_TTL_CAP)
        _RATE_CACHE[key] = (fetched, time.time() + ttl)
        return fetched

    async def _fetch(self, base: str, quote: str) -> FxRate:
        last: Exception | None = None
        for attempt in range(3):
            try:
                r = await self._http.get("/latest", params={"from": base, "to": quote})
            except httpx.TransportError as e:
                last = e
                await asyncio.sleep(self.BACKOFF * 2**attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                await asyncio.sleep(self.BACKOFF * 2**attempt)
                continue
            if r.status_code != 200:
                raise FxError("rate lookup", f"HTTP {r.status_code}: {r.text[:200]}")
            j = r.json()
            value = (j.get("rates") or {}).get(quote)
            if value is None:
                raise FxError("rate lookup", f"no {quote} rate for {base}")
            return FxRate(
                base, quote, Decimal(str(value)), "frankfurter", j.get("date")
            )
        raise FxError("rate lookup", f"network error: {last}")


async def get_fx():
    """FastAPI dependency: a client per request (tests mock HTTP with respx)."""
    c = FxClient()
    try:
        yield c
    finally:
        await c.aclose()
