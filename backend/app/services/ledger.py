"""Turn mapped PayPal payments into ledger rows and keep invoice status in sync."""
import json
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Invoice, Payment
from . import audit

def decimal_text(value):
    return format(value.normalize(), "f") if value is not None else None

def find_invoice(db: Session, mapped: dict) -> Invoice | None:
    for ref in (mapped.get("custom_id"), mapped.get("invoice_ref")):
        if ref:
            inv = db.scalars(select(Invoice).where(Invoice.number == ref)).first()
            if inv:
                return inv
    return None


def record_payment(db: Session, mapped: dict, raw: dict, *, event_id: str | None = None,
                   invoice: Invoice | None = None, actor: str = "system") -> tuple[Payment, bool]:
    """Idempotent: the same PayPal capture id never creates two rows. Returns (payment, created)."""
    existing = db.scalars(select(Payment).where(Payment.paypal_capture_id == mapped["capture_id"])).first()
    if existing:
        return existing, False
    invoice = invoice or find_invoice(db, mapped)
    pay = Payment(invoice_id=invoice.id if invoice else None, paypal_event_id=event_id,
                  paypal_capture_id=mapped["capture_id"], paid_at=mapped.get("paid_at"),
                  currency=mapped.get("currency"), gross=mapped.get("gross"), paypal_fee=mapped.get("paypal_fee"),
                  net=mapped.get("net"), receivable_currency=mapped.get("receivable_currency"),
                  receivable_amount=mapped.get("receivable_amount"), fx_rate=mapped.get("fx_rate"),
                  fx_rate_source=mapped.get("fx_rate_source"), data_source=mapped.get("data_source", "paypal-capture"),
                  raw_json=json.dumps(raw, default=str)[:200000])
    db.add(pay)
    if invoice and invoice.status in ("DRAFT", "SENT"):
        invoice.status = "PAID"
    db.flush()
    audit.append(db, actor, "payment.recorded", "payment", pay.id,
                 {"capture_id": pay.paypal_capture_id, "invoice": invoice.number if invoice else None,
                  "gross": pay.gross, "fee": pay.paypal_fee, "net": pay.net, "source": pay.data_source})
    return pay, True


def ledger_rows(db: Session) -> list[dict]:
    rows = []
    for p in db.scalars(select(Payment).order_by(Payment.id.desc())):
        rows.append({
            "id": p.id, "invoice": p.invoice.number if p.invoice else None,
            "client": p.invoice.client.name if p.invoice else None,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None, "currency": p.currency,
            "receivable_currency": p.receivable_currency,
            "gross": decimal_text(p.gross),
            "paypal_fee": decimal_text(p.paypal_fee),
            "net": decimal_text(p.net),
            "receivable_amount": decimal_text(p.receivable_amount),
            "fx_rate": decimal_text(p.fx_rate),
            "fx_rate_source": p.fx_rate_source or "unavailable",
            "data_source": p.data_source,
            "capture_id": p.paypal_capture_id,
        })
    return rows
