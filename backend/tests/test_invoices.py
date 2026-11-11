from httpx import Response

from .conftest import CAPTURE, PP

BODY = {"client_name": "Acme Inc", "client_email": "buyer@example.com", "client_country": "US",
        "currency": "USD", "amount": "100.00", "service_description": "Software development",
        "contract_ref": "CONTRACT-001", "purpose_code": "P0802"}


def test_create_rejects_bad_amount_and_currency(client):
    assert client.post("/invoices", json=dict(BODY, amount="abc")).status_code == 422
    assert client.post("/invoices", json=dict(BODY, amount="-5")).status_code == 422
    assert client.post("/invoices", json=dict(BODY, currency="INR")).status_code == 422


def test_send_blocked_without_purpose_code(client, exporter, pp_mock):
    inv = client.post("/invoices", json=dict(BODY, purpose_code=None)).json()
    r = client.post(f"/invoices/{inv['id']}/send")
    assert r.status_code == 422
    assert "Purpose code is missing" in r.json()["detail"]["problems"]


def test_send_blocked_without_exporter_profile(client, pp_mock):
    inv = client.post("/invoices", json=BODY).json()
    assert client.post(f"/invoices/{inv['id']}/send").status_code == 422


def test_send_success_uses_invoicing_scope_and_request_id(client, exporter, pp_mock):
    inv = client.post("/invoices", json=BODY).json()
    pp_mock.post(f"{PP}/v2/invoicing/invoices").mock(return_value=Response(201, json={
        "rel": "self", "href": f"{PP}/v2/invoicing/invoices/INV2-AAAA", "method": "GET"}))
    pp_mock.post(f"{PP}/v2/invoicing/invoices/INV2-AAAA/send").mock(return_value=Response(202, json={}))
    pp_mock.get(f"{PP}/v2/invoicing/invoices/INV2-AAAA").mock(return_value=Response(200, json={
        "id": "INV2-AAAA", "status": "SENT", "detail": {"metadata": {"recipient_view_url": "https://x/view"}}}))
    r = client.post(f"/invoices/{inv['id']}/send")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SENT" and r.json()["paypal_invoice_id"] == "INV2-AAAA"
    token_calls = [c for c in pp_mock.calls if c.request.url.path == "/v1/oauth2/token"]
    assert b"invoicing" in token_calls[0].request.content
    create = [c for c in pp_mock.calls if c.request.url.path == "/v2/invoicing/invoices" and c.request.method == "POST"][0]
    assert create.request.headers["PayPal-Request-Id"]


def test_paypal_error_becomes_502(client, exporter, pp_mock):
    inv = client.post("/invoices", json=BODY).json()
    pp_mock.post(f"{PP}/v2/invoicing/invoices").mock(return_value=Response(403, json={"name": "NOT_AUTHORIZED"}))
    r = client.post(f"/invoices/{inv['id']}/send")
    assert r.status_code == 502


def test_retry_on_503_then_success(client, exporter, pp_mock):
    inv = client.post("/invoices", json=BODY).json()
    route = pp_mock.post(f"{PP}/v2/invoicing/invoices")
    route.side_effect = [Response(503), Response(201, json={"id": "INV2-BBBB"})]
    pp_mock.post(f"{PP}/v2/invoicing/invoices/INV2-BBBB/send").mock(return_value=Response(202, json={}))
    pp_mock.get(f"{PP}/v2/invoicing/invoices/INV2-BBBB").mock(return_value=Response(200, json={"id": "INV2-BBBB"}))
    assert client.post(f"/invoices/{inv['id']}/send").status_code == 200


def test_pay_link_then_return_captures_and_records(client, pp_mock):
    inv = client.post("/invoices", json=BODY).json()
    pp_mock.post(f"{PP}/v2/checkout/orders").mock(return_value=Response(201, json={
        "id": "ORD1", "links": [{"rel": "approve", "href": "https://paypal/approve?token=ORD1"}]}))
    r = client.post(f"/invoices/{inv['id']}/pay-link")
    assert r.json()["approve_url"].endswith("ORD1")
    cap = dict(CAPTURE, custom_id=inv["number"])
    pp_mock.post(f"{PP}/v2/checkout/orders/ORD1/capture").mock(return_value=Response(201, json={
        "id": "ORD1", "purchase_units": [{"payments": {"captures": [cap]}}]}))
    r = client.get("/payments/return", params={"token": "ORD1"})
    assert r.status_code == 303 and "paid=" in r.headers["location"]
    ledger = client.get("/ledger").json()
    assert len(ledger) == 1 and ledger[0]["net"] == "47.34" and ledger[0]["fx_rate_source"] == "unavailable"
    assert client.get(f"/invoices/{inv['id']}").json()["status"] == "PAID"
    client.get("/payments/return", params={"token": "ORD1"})  # second hit must not create a second payment
    assert len(client.get("/ledger").json()) == 1
    assert client.get("/audit").json()["chain_ok"] is True
