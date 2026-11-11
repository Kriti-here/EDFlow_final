import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Invoice, WebhookEvent
from ..services import audit, ledger
from ..services.paypal_client import PayPalClient, PayPalError, get_paypal
from ..services.paypal_mapper import extract_capture, map_capture, map_invoice_transaction

router = APIRouter()


@router.post("/webhooks/paypal")
async def paypal_webhook(request: Request, db: Session = Depends(get_db), pp: PayPalClient = Depends(get_paypal)):
    raw = await request.body()
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Body is not JSON")
    ok = get_settings().allow_unverified_webhooks or await pp.verify_webhook(dict(request.headers), event)
    if not ok:
        audit.append(db, "system", "webhook.rejected", "webhook", event.get("id", "?"), {"type": event.get("event_type")})
        db.commit()
        raise HTTPException(400, "Invalid webhook signature")
    ev_id, ev_type = event.get("id"), event.get("event_type", "")
    if not ev_id:
        raise HTTPException(400, "Event has no id")
    if db.scalars(select(WebhookEvent).where(WebhookEvent.paypal_event_id == ev_id)).first():
        return {"status": "duplicate"}
    db.add(WebhookEvent(paypal_event_id=ev_id, event_type=ev_type))
    db.flush()
    resource = event.get("resource") or {}

    if ev_type == "PAYMENT.CAPTURE.COMPLETED":
        cap = resource
        if "seller_receivable_breakdown" not in cap and cap.get("id"):
            try:
                cap = await pp.get_capture(cap["id"])
            except PayPalError:
                cap = resource
        pay, created = ledger.record_payment(db, map_capture(extract_capture(cap) or resource), cap, event_id=ev_id)
        result = {"status": "recorded" if created else "already_recorded", "payment_id": pay.id}
    elif ev_type == "INVOICING.INVOICE.PAID":
        inv_id = (resource.get("invoice") or {}).get("id") or resource.get("id")
        inv = db.scalars(select(Invoice).where(Invoice.paypal_invoice_id == inv_id)).first() if inv_id else None
        result = {"status": "ignored", "reason": "invoice not found"}
        if inv:
            full = await pp.get_invoice(inv_id)
            txs = ((full.get("payments") or {}).get("transactions")) or [{}]
            for tx in txs:
                mapped = None
                if tx.get("payment_id"):
                    try:
                        mapped = map_capture(extract_capture(await pp.get_capture(tx["payment_id"])))
                    except (PayPalError, TypeError, KeyError):
                        mapped = None
                mapped = mapped or map_invoice_transaction(tx, (full.get("amount") or {}).get("breakdown"))
                ledger.record_payment(db, mapped, tx, event_id=ev_id, invoice=inv)
            result = {"status": "recorded"}
    elif ev_type in ("PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED", "INVOICING.INVOICE.CANCELLED",
                     "INVOICING.INVOICE.REFUNDED"):
        audit.append(db, "system", "webhook.attention", "webhook", ev_id, {"type": ev_type})
        result = {"status": "flagged"}
    else:
        result = {"status": "ignored", "type": ev_type}
    db.commit()
    return result
