import os

os.environ.update({"PAYPAL_CLIENT_ID": "test-id", "PAYPAL_CLIENT_SECRET": "test-secret",
                   "PAYPAL_WEBHOOK_ID": "WH-TEST", "PAYPAL_BASE_URL": "https://api-m.sandbox.paypal.com",
                   "ALLOW_UNVERIFIED_WEBHOOKS": "false", "MERCHANT_EMAIL": "",
                   "PUBLIC_BASE_URL": "http://localhost:8000", "FRONTEND_URL": "http://localhost:3000"})

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services.paypal_client import PayPalClient

PP = "https://api-m.sandbox.paypal.com"
PayPalClient.BACKOFF = 0


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    from app import models  # noqa: F401
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    s = Session()
    yield s
    s.close()


@pytest.fixture()
def client(db_session):
    def _db():
        yield db_session
    app.dependency_overrides[get_db] = _db
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


@pytest.fixture()
def pp_mock():
    with respx.mock(assert_all_called=False) as m:
        m.post(f"{PP}/v1/oauth2/token").mock(return_value=Response(200, json={"access_token": "tok", "expires_in": 3600}))
        yield m


@pytest.fixture()
def exporter(client):
    r = client.put("/exporter", json={"legal_name": "Demo Exporter Pvt Ltd", "entity_type": "company",
                                      "gstin": "FAKEGSTIN0000001", "lut_number": "FAKE-LUT-1"})
    assert r.status_code == 200


CAPTURE = {"id": "CAP123", "status": "COMPLETED", "amount": {"currency_code": "USD", "value": "50.00"},
           "custom_id": "INV-X", "create_time": "2026-11-05T10:00:00Z",
           "seller_receivable_breakdown": {"gross_amount": {"currency_code": "USD", "value": "50.00"},
                                           "paypal_fee": {"currency_code": "USD", "value": "2.66"},
                                           "net_amount": {"currency_code": "USD", "value": "47.34"}}}
