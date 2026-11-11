from httpx import Response

from .conftest import CAPTURE, PP

HEADERS = {"paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://cert", "paypal-transmission-id": "t1",
           "paypal-transmission-sig": "sig", "paypal-transmission-time": "2026-11-05T10:00:00Z"}
INV = {"client_name": "Acme", "client_email": "b@example.com", "currency": "USD", "amount": "50.00",
       "purpose_code": "P0802"}


def event(cap, ev_id="WH-EVT-1"):
    return {"id": ev_id, "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": cap}


def test_invalid_signature_rejected(client, pp_mock):
    pp_mock.post(f"{PP}/v1/notifications/verify-webhook-signature").mock(
        return_value=Response(200, json={"verification_status": "FAILURE"}))
    r = client.post("/webhooks/paypal", json=event(CAPTURE), headers=HEADERS)
    assert r.status_code == 400 and client.get("/ledger").json() == []


def test_missing_signature_headers_rejected(client, pp_mock):
    assert client.post("/webhooks/paypal", json=event(CAPTURE)).status_code == 400


def test_valid_capture_event_records_once(client, pp_mock):
    inv = client.post("/invoices", json=INV).json()
    cap = dict(CAPTURE, id="CAPW1", custom_id=inv["number"])
    pp_mock.post(f"{PP}/v1/notifications/verify-webhook-signature").mock(
        return_value=Response(200, json={"verification_status": "SUCCESS"}))
    r1 = client.post("/webhooks/paypal", json=event(cap), headers=HEADERS)
    assert r1.status_code == 200 and r1.json()["status"] == "recorded"
    r2 = client.post("/webhooks/paypal", json=event(cap), headers=HEADERS)  # same event id redelivered
    assert r2.json()["status"] == "duplicate"
    r3 = client.post("/webhooks/paypal", json=event(cap, "WH-EVT-2"), headers=HEADERS)  # same capture, new event
    assert r3.json()["status"] == "already_recorded"
    assert len(client.get("/ledger").json()) == 1
    assert client.get(f"/invoices/{inv['id']}").json()["status"] == "PAID"


def test_sync_records_paid_invoice_without_fee(client, exporter, pp_mock):
    inv = client.post("/invoices", json=dict(INV, purpose_code="P0802")).json()
    pp_mock.post(f"{PP}/v2/invoicing/invoices").mock(return_value=Response(201, json={"id": "INV2-S"}))
    pp_mock.post(f"{PP}/v2/invoicing/invoices/INV2-S/send").mock(return_value=Response(202, json={}))
    pp_mock.get(f"{PP}/v2/invoicing/invoices/INV2-S").mock(return_value=Response(200, json={
        "id": "INV2-S", "status": "PAID", "payments": {"transactions": [
            {"payment_id": "PAYID1", "payment_date": "2026-11-05T11:00:00Z",
             "amount": {"currency_code": "USD", "value": "50.00"}}]}}))
    pp_mock.get(f"{PP}/v2/payments/captures/PAYID1").mock(return_value=Response(404, json={"name": "RESOURCE_NOT_FOUND"}))
    assert client.post(f"/invoices/{inv['id']}/send").status_code == 200
    assert client.post("/payments/sync").json()["new_payments"] == 1
    row = client.get("/ledger").json()[0]
    assert row["net"] is None and row["data_source"] == "paypal-invoice-no-fee"
    assert client.post("/payments/sync").json()["new_payments"] == 0
