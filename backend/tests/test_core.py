from decimal import Decimal

from app.models import Invoice
from app.services import audit
from app.services.paypal_mapper import extract_capture, map_capture
from .conftest import CAPTURE


def test_money_roundtrip_is_exact(db_session, client):
    from app.models import Client
    from datetime import date
    c = Client(name="A", email="a@x.com")
    db_session.add(c); db_session.flush()
    inv = Invoice(number="N1", client_id=c.id, issue_date=date.today(), due_date=date.today(),
                  currency="USD", amount=Decimal("0.10") + Decimal("0.20"))
    db_session.add(inv); db_session.commit(); db_session.expire_all()
    assert db_session.get(Invoice, inv.id).amount == Decimal("0.30")


def test_audit_chain_detects_tampering(db_session):
    audit.append(db_session, "user", "a", "x", 1, {"v": Decimal("1.5")})
    audit.append(db_session, "ai", "b", "x", 2)
    audit.append(db_session, "system", "c", "x", 3)
    db_session.commit()
    assert audit.verify_chain(db_session) == (True, None)
    from app.models import AuditLog
    row = db_session.get(AuditLog, 2)
    row.action = "tampered"; db_session.commit()
    ok, bad = audit.verify_chain(db_session)
    assert ok is False and bad == 2


def test_mapper_without_exchange_rate():
    m = map_capture(CAPTURE)
    assert (m["gross"], m["paypal_fee"], m["net"]) == (Decimal("50.00"), Decimal("2.66"), Decimal("47.34"))
    assert m["fx_rate"] is None and m["fx_rate_source"] is None


def test_mapper_with_exchange_rate_and_wrapped_response():
    cap = dict(CAPTURE)
    cap["seller_receivable_breakdown"] = dict(CAPTURE["seller_receivable_breakdown"],
        receivable_amount={"currency_code": "EUR", "value": "43.10"},
        exchange_rate={"source_currency": "USD", "target_currency": "EUR", "value": "0.91"})
    wrapped = {"purchase_units": [{"payments": {"captures": [cap]}}]}
    m = map_capture(extract_capture(wrapped))
    assert m["fx_rate"] == Decimal("0.91") and m["fx_rate_source"] == "paypal"
    assert m["receivable_amount"] == Decimal("43.10") and m["receivable_currency"] == "EUR"


def test_cors_allows_local_vite_dev_origin(client):
    r = client.get("/healthz", headers={"Origin": "http://localhost:5173"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_allows_vite_fallback_ports(client):
    """Explicitly allowlisted fallback ports stay trusted (Vite uses strictPort)."""
    for origin in ("http://localhost:5174", "http://localhost:5175", "http://127.0.0.1:5175"):
        r = client.get("/healthz", headers={"Origin": origin})
        assert r.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_unconfigured_origin(client):
    r = client.get("/healthz", headers={"Origin": "https://not-allowed.example"})
    assert "access-control-allow-origin" not in r.headers
