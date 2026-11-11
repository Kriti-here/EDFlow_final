"""Async PayPal sandbox client: OAuth (cached per scope), Invoicing v2, Orders v2, captures, webhook verification."""
import asyncio
import time
import uuid

import httpx

from ..config import Settings, get_settings

INVOICING_SCOPE = "https://uri.paypal.com/services/invoicing"
_TOKEN_CACHE: dict[tuple, tuple[str, float]] = {}


class PayPalError(Exception):
    def __init__(self, status: int, body: str, action: str):
        super().__init__(f"PayPal {action} failed ({status}): {body[:300]}")
        self.status, self.body, self.action = status, body, action


class PayPalClient:
    BACKOFF = 0.5  # seconds; tests set this to 0

    def __init__(self, settings: Settings | None = None):
        self.s = settings or get_settings()
        self._http = httpx.AsyncClient(base_url=self.s.paypal_base_url, timeout=30)

    async def aclose(self):
        await self._http.aclose()

    async def _token(self, scope: str | None) -> str:
        key = (self.s.paypal_base_url, self.s.paypal_client_id, scope)
        cached = _TOKEN_CACHE.get(key)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
        data = {"grant_type": "client_credentials"}
        if scope:
            data["scope"] = scope
        r = await self._http.post("/v1/oauth2/token", data=data,
                                  auth=(self.s.paypal_client_id, self.s.paypal_client_secret),
                                  headers={"Accept": "application/json"})
        if r.status_code != 200:
            raise PayPalError(r.status_code, r.text, "oauth token")
        j = r.json()
        _TOKEN_CACHE[key] = (j["access_token"], time.time() + int(j.get("expires_in", 300)))
        return j["access_token"]

    async def _request(self, method: str, path: str, *, scope: str | None = None, json=None,
                       params=None, request_id: str | None = None, action: str = ""):
        token = await self._token(scope)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                   "Accept": "application/json"}
        if method == "POST":
            headers["PayPal-Request-Id"] = request_id or str(uuid.uuid4())
        last: Exception | None = None
        for attempt in range(3):
            try:
                r = await self._http.request(method, path, headers=headers, json=json, params=params)
            except httpx.TransportError as e:
                last = e
                await asyncio.sleep(self.BACKOFF * 2 ** attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                await asyncio.sleep(self.BACKOFF * 2 ** attempt)
                continue
            if r.status_code >= 400:
                raise PayPalError(r.status_code, r.text, action or path)
            return r.json() if r.content else {}
        raise PayPalError(0, str(last), action or path)

    # ---- Invoicing v2 (needs the invoicing scope and the Invoicing feature on the app)
    async def create_invoice(self, payload: dict, request_id: str) -> dict:
        return await self._request("POST", "/v2/invoicing/invoices", scope=INVOICING_SCOPE, json=payload,
                                   request_id=request_id, action="create invoice")

    async def send_invoice(self, invoice_id: str) -> dict:
        return await self._request("POST", f"/v2/invoicing/invoices/{invoice_id}/send", scope=INVOICING_SCOPE,
                                   json={"send_to_invoicer": True}, action="send invoice")

    async def get_invoice(self, invoice_id: str) -> dict:
        return await self._request("GET", f"/v2/invoicing/invoices/{invoice_id}", scope=INVOICING_SCOPE,
                                   action="get invoice")

    # ---- Orders v2 and captures
    async def create_order(self, *, amount: str, currency: str, custom_id: str, description: str,
                           request_id: str, return_url: str, cancel_url: str) -> dict:
        body = {"intent": "CAPTURE",
                "purchase_units": [{"reference_id": custom_id, "custom_id": custom_id, "description": description[:120],
                                    "amount": {"currency_code": currency, "value": amount}}],
                "application_context": {"return_url": return_url, "cancel_url": cancel_url, "user_action": "PAY_NOW"}}
        return await self._request("POST", "/v2/checkout/orders", json=body, request_id=request_id,
                                   action="create order")

    async def capture_order(self, order_id: str, request_id: str | None = None) -> dict:
        return await self._request("POST", f"/v2/checkout/orders/{order_id}/capture", json={},
                                   request_id=request_id, action="capture order")

    async def get_capture(self, capture_id: str) -> dict:
        return await self._request("GET", f"/v2/payments/captures/{capture_id}", action="get capture")

    # ---- Webhooks
    async def verify_webhook(self, headers: dict, event: dict) -> bool:
        h = {k.lower(): v for k, v in headers.items()}
        body = {"auth_algo": h.get("paypal-auth-algo"), "cert_url": h.get("paypal-cert-url"),
                "transmission_id": h.get("paypal-transmission-id"), "transmission_sig": h.get("paypal-transmission-sig"),
                "transmission_time": h.get("paypal-transmission-time"), "webhook_id": self.s.paypal_webhook_id}
        if not all(body.values()):
            return False
        body["webhook_event"] = event
        res = await self._request("POST", "/v1/notifications/verify-webhook-signature", json=body,
                                  action="verify webhook")
        return res.get("verification_status") == "SUCCESS"


async def get_paypal():
    """FastAPI dependency: a client per request (tests override or mock HTTP with respx)."""
    c = PayPalClient()
    try:
        yield c
    finally:
        await c.aclose()
