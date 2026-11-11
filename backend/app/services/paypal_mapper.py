"""Pure functions: PayPal JSON -> plain dicts. All money is Decimal."""
from datetime import datetime, timezone
from decimal import Decimal


def D(x) -> Decimal | None:
    return None if x in (None, "") else Decimal(str(x))


def parse_time(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def extract_capture(data: dict) -> dict | None:
    """Accept an order-capture response, or a bare capture object."""
    if "purchase_units" in data:
        caps = (data["purchase_units"][0].get("payments") or {}).get("captures") or []
        return caps[0] if caps else None
    return data if data.get("id") else None


def map_capture(cap: dict) -> dict:
    amt = cap.get("amount") or {}
    srb = cap.get("seller_receivable_breakdown") or {}
    rec = srb.get("receivable_amount") or {}
    ex = srb.get("exchange_rate") or {}
    gross = D((srb.get("gross_amount") or amt).get("value"))
    return {
        "capture_id": cap["id"],
        "currency": amt.get("currency_code"),
        "gross": gross,
        "paypal_fee": D((srb.get("paypal_fee") or {}).get("value")),
        "net": D((srb.get("net_amount") or {}).get("value")),
        "receivable_currency": rec.get("currency_code"),
        "receivable_amount": D(rec.get("value")),
        "fx_rate": D(ex.get("value")),
        "fx_rate_source": "paypal" if ex.get("value") else None,
        "paid_at": parse_time(cap.get("create_time") or cap.get("update_time")),
        "custom_id": cap.get("custom_id"),
        "invoice_ref": cap.get("invoice_id"),
        "data_source": "paypal-capture",
    }


def map_invoice_transaction(tx: dict, invoice_amount: dict | None = None) -> dict:
    """Fallback when an invoice payment has no capture we can fetch (fee/net unknown)."""
    amt = tx.get("amount") or invoice_amount or {}
    return {
        "capture_id": tx.get("payment_id") or f"inv-{tx.get('payment_date', 'unknown')}",
        "currency": amt.get("currency_code"), "gross": D(amt.get("value")),
        "paypal_fee": None, "net": None, "receivable_currency": None, "receivable_amount": None,
        "fx_rate": None, "fx_rate_source": None,
        "paid_at": parse_time(tx.get("payment_date")), "custom_id": None, "invoice_ref": None,
        "data_source": "paypal-invoice-no-fee",
    }
