"""Pure, Decimal-only true-cost math for a PayPal payment.

gross / paypal_fee / net are in the payment (billing) currency. We convert to a target
currency (INR by default) two ways:
  * mid_market_value -- the amount at the mid-market rate (Frankfurter).
  * actual_value     -- the amount the exporter really received: PayPal's own receivable
                        figure, else net at PayPal's effective rate, else (labelled)
                        net at the mid-market rate when nothing better exists.

Everything here is a pure function of Decimals. No float, no I/O, no ORM.
"""

from decimal import ROUND_HALF_UP, Decimal

Q2 = Decimal("0.01")  # money
Q4 = Decimal("0.0001")  # percentages
HUNDRED = Decimal("100")
ZERO = Decimal("0")


def _q(value: Decimal | None, quantum: Decimal) -> Decimal | None:
    return None if value is None else value.quantize(quantum, rounding=ROUND_HALF_UP)


def percent(part: Decimal | None, whole: Decimal | None) -> Decimal | None:
    """part / whole * 100 as a Decimal, or None when it is not computable."""
    if part is None or whole is None or whole == ZERO:
        return None
    return _q(part / whole * HUNDRED, Q4)


def fee_percent(gross: Decimal | None, paypal_fee: Decimal | None) -> Decimal | None:
    return percent(paypal_fee, gross)


def mid_market_value(
    amount: Decimal | None, mid_rate: Decimal | None
) -> Decimal | None:
    if amount is None or mid_rate is None:
        return None
    return _q(amount * mid_rate, Q2)


def actual_value(
    net: Decimal | None,
    mid_rate: Decimal | None,
    *,
    target_currency: str,
    receivable_amount: Decimal | None = None,
    receivable_currency: str | None = None,
    paypal_rate: Decimal | None = None,
) -> tuple[Decimal | None, str]:
    """Best available received-in-target amount, and where it came from."""
    if receivable_amount is not None and receivable_currency == target_currency:
        return _q(receivable_amount, Q2), "paypal"
    if net is not None and paypal_rate is not None:
        return _q(net * paypal_rate, Q2), "paypal"
    if net is not None and mid_rate is not None:
        return _q(net * mid_rate, Q2), "simulated"
    return None, "unavailable"


def fx_markup_percent(
    net_mid_market: Decimal | None, actual: Decimal | None
) -> Decimal | None:
    """How much worse the received amount is than the mid-market value of the net."""
    if net_mid_market is None or actual is None or net_mid_market == ZERO:
        return None
    return _q((net_mid_market - actual) / net_mid_market * HUNDRED, Q4)


def total_cost_percent(
    gross_mid_market: Decimal | None, actual: Decimal | None
) -> Decimal | None:
    """Everything lost against the mid-market value of the gross (fee + FX markup)."""
    if gross_mid_market is None or actual is None or gross_mid_market == ZERO:
        return None
    return _q((gross_mid_market - actual) / gross_mid_market * HUNDRED, Q4)


def compute_true_cost(
    *,
    gross: Decimal | None,
    paypal_fee: Decimal | None,
    net: Decimal | None,
    mid_rate: Decimal,
    target_currency: str = "INR",
    receivable_amount: Decimal | None = None,
    receivable_currency: str | None = None,
    paypal_rate: Decimal | None = None,
) -> dict:
    """Return the true-cost figures for one payment. Values stay Decimal; the router serialises."""
    gross_mid = mid_market_value(gross, mid_rate)
    net_mid = mid_market_value(net, mid_rate)
    actual, actual_source = actual_value(
        net,
        mid_rate,
        target_currency=target_currency,
        receivable_amount=receivable_amount,
        receivable_currency=receivable_currency,
        paypal_rate=paypal_rate,
    )
    return {
        "gross": gross,
        "paypal_fee": paypal_fee,
        "net": net,
        "fee_percent": fee_percent(gross, paypal_fee),
        "mid_market_value": gross_mid,
        "actual_value": actual,
        "fx_markup_percent": fx_markup_percent(net_mid, actual),
        "total_cost_percent": total_cost_percent(gross_mid, actual),
        "actual_source": actual_source,
    }
