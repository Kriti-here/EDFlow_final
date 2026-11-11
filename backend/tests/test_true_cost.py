"""B6 tests: Frankfurter FX lookup, labelled fallback, Decimal-only true-cost math, endpoint."""

import asyncio
from decimal import Decimal

import pytest
import respx
from httpx import Response

from app.services import fx, ledger
from app.services.fx import FxClient
from app.services.true_cost import compute_true_cost

FX = "https://api.frankfurter.app"
FxClient.BACKOFF = 0  # no sleeping in tests


@pytest.fixture(autouse=True)
def _clear_fx_cache():
    fx._RATE_CACHE.clear()
    yield
    fx._RATE_CACHE.clear()


@pytest.fixture()
def fx_mock():
    """Frankfurter returns JSON numbers; the service must convert them to Decimal."""
    with respx.mock(assert_all_called=False) as m:
        m.get(url__regex=r".*/latest").mock(
            return_value=Response(
                200,
                json={
                    "amount": 1.0,
                    "base": "USD",
                    "date": "2026-11-06",
                    "rates": {"INR": 83.2},
                },
            )
        )
        yield m


def _make_payment(db_session, *, receivable: bool = False):
    mapped = {
        "capture_id": "CAP-TC-1",
        "currency": "USD",
        "gross": Decimal("100.00"),
        "paypal_fee": Decimal("5.00"),
        "net": Decimal("95.00"),
        "receivable_currency": None,
        "receivable_amount": None,
        "fx_rate": None,
        "fx_rate_source": None,
        "paid_at": None,
        "data_source": "paypal-capture",
    }
    if receivable:
        mapped.update(
            {
                "receivable_currency": "INR",
                "receivable_amount": Decimal("7800.00"),
                "fx_rate": Decimal("82.00"),
                "fx_rate_source": "paypal",
            }
        )
    pay, _ = ledger.record_payment(db_session, mapped, {})
    db_session.commit()
    return pay


# ---- FX service -------------------------------------------------------------------


def test_fx_lookup_is_decimal_and_labelled(fx_mock):
    rate = asyncio.run(FxClient().rate("USD", "INR"))
    assert rate.source == "frankfurter"
    assert isinstance(rate.rate, Decimal) and rate.rate == Decimal("83.2")
    assert rate.as_of == "2026-11-06"


def test_fx_falls_back_to_simulated_when_api_fails():
    with respx.mock(assert_all_called=False) as m:
        m.get(url__regex=r".*/latest").mock(return_value=Response(500, json={}))
        rate = asyncio.run(FxClient().rate("USD", "INR"))
    assert rate.source == "simulated"
    assert rate.rate == Decimal("83.20")


# ---- True-cost math (pure) --------------------------------------------------------


def test_true_cost_simulated_receivable():
    tc = compute_true_cost(
        gross=Decimal("100.00"),
        paypal_fee=Decimal("5.00"),
        net=Decimal("95.00"),
        mid_rate=Decimal("83.20"),
    )
    assert tc["mid_market_value"] == Decimal("8320.00")
    assert tc["actual_value"] == Decimal(
        "7904.00"
    )  # net * mid-market (no PayPal rate seen)
    assert tc["actual_source"] == "simulated"
    assert tc["fee_percent"] == Decimal("5.0000")
    assert tc["fx_markup_percent"] == Decimal("0.0000")
    assert tc["total_cost_percent"] == Decimal("5.0000")


def test_true_cost_uses_paypal_rate_for_markup():
    tc = compute_true_cost(
        gross=Decimal("100.00"),
        paypal_fee=Decimal("5.00"),
        net=Decimal("95.00"),
        mid_rate=Decimal("83.20"),
        paypal_rate=Decimal("82.00"),
    )
    assert tc["actual_value"] == Decimal("7790.00")  # 95 * 82
    assert tc["actual_source"] == "paypal"
    assert tc["fx_markup_percent"] == Decimal("1.4423")
    assert tc["total_cost_percent"] == Decimal("6.3702")


def test_true_cost_decimal_precision_no_float_drift():
    tc = compute_true_cost(
        gross=Decimal("0.10"),
        paypal_fee=Decimal("0.02"),
        net=Decimal("0.08"),
        mid_rate=Decimal("1"),
    )
    assert tc["net"] == Decimal("0.08")
    assert tc["fee_percent"] == Decimal("20.0000")
    assert tc["total_cost_percent"] == Decimal("20.0000")
    big = compute_true_cost(
        gross=Decimal("123456789.01"),
        paypal_fee=Decimal("1.11"),
        net=Decimal("123456787.90"),
        mid_rate=Decimal("83.20"),
    )
    assert big["mid_market_value"] == Decimal("10271604845.63")


# ---- Endpoint ---------------------------------------------------------------------


def test_endpoint_simulated_receivable(client, db_session, fx_mock):
    pay = _make_payment(db_session)
    r = client.get(f"/payments/{pay.id}/true-cost")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["source"] == "frankfurter"
    assert b["sources"] == {"fx_rate": "frankfurter", "receivable": "simulated"}
    assert b["mid_market_value"] == "8320"
    assert b["actual_value"] == "7904"
    assert b["fee_percent"] == "5"
    assert b["total_cost_percent"] == "5"


def test_endpoint_paypal_receivable(client, db_session, fx_mock):
    pay = _make_payment(db_session, receivable=True)
    b = client.get(f"/payments/{pay.id}/true-cost").json()
    assert b["sources"]["receivable"] == "paypal"
    assert b["actual_value"] == "7800"
    assert b["fx_markup_percent"] == "1.3158"
    assert b["total_cost_percent"] == "6.25"


def test_endpoint_unknown_payment_404(client, fx_mock):
    assert client.get("/payments/9999/true-cost").status_code == 404
