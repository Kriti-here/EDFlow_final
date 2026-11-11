from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Client, ExporterProfile, Invoice, Payment
from ..rules import engine as rules_engine
from ..rules.loader import RulesConfigError
from ..services import audit, invoice_service as svc, ledger, true_cost
from ..services.fx import FxClient, FxError, get_fx
from ..services.paypal_client import PayPalClient, PayPalError, get_paypal
from ..services.paypal_mapper import extract_capture, map_capture, map_invoice_transaction

router = APIRouter()


def _rule_info(inv: Invoice) -> dict:
    """Rules-derived fields for an invoice. Degrades to nulls if the rules file is unavailable."""
    try:
        return {"edf_due_date": rules_engine.edf_due_date(inv.issue_date).isoformat(),
                "edf_days_remaining": rules_engine.days_remaining(inv.issue_date),
                "purpose_code_verified": rules_engine.validate_purpose_code(inv.purpose_code)["verified"]}
    except RulesConfigError:
        return {"edf_due_date": None, "edf_days_remaining": None, "purpose_code_verified": None}


class InvoiceIn(BaseModel):
    client_name: str = Field(min_length=1)
    client_email: str = Field(min_length=3)
    client_country: str | None = None
    currency: str = "USD"
    amount: str
    service_description: str = ""
    contract_ref: str | None = None
    purpose_code: str | None = None
    issue_date: date | None = None
    due_date: date | None = None


def inv_out(i: Invoice) -> dict:
    return {"id": i.id, "number": i.number, "client": i.client.name, "client_email": i.client.email,
            "client_country": i.client.country, "currency": i.currency, "amount": str(i.amount),
            "issue_date": i.issue_date.isoformat(), "due_date": i.due_date.isoformat(),
            "service_description": i.service_description, "contract_ref": i.contract_ref,
            "purpose_code": i.purpose_code, "status": i.status, "paypal_invoice_id": i.paypal_invoice_id,
            "paypal_invoice_url": i.paypal_invoice_url, "paypal_order_id": i.paypal_order_id,
            **_rule_info(i)}


def get_inv(db: Session, inv_id: int) -> Invoice:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.post("/invoices", status_code=201)
def create_invoice(body: InvoiceIn, db: Session = Depends(get_db)):
    try:
        amount = Decimal(body.amount)
    except InvalidOperation:
        raise HTTPException(422, "amount must be a decimal string like '100.00'")
    if not amount.is_finite():
        raise HTTPException(422, "amount must be a finite decimal")
    if amount <= 0:
        raise HTTPException(422, "amount must be positive")
    if amount.as_tuple().exponent < -2:
        raise HTTPException(422, "amount supports at most 2 decimal places")
    if len(amount.as_tuple().digits) > 16:
        raise HTTPException(422, "amount is too large")
    if body.currency not in svc.ALLOWED_CURRENCIES:
        raise HTTPException(422, f"currency must be one of {sorted(svc.ALLOWED_CURRENCIES)}")
    client = db.scalars(select(Client).where(Client.email == body.client_email)).first() or Client(
        name=body.client_name, email=body.client_email, country=body.client_country)
    db.add(client)
    db.flush()
    issue = body.issue_date or date.today()
    inv = Invoice(number=svc.next_number(db, issue), client_id=client.id, issue_date=issue,
                  due_date=body.due_date or issue + timedelta(days=10), currency=body.currency, amount=amount,
                  service_description=body.service_description, contract_ref=body.contract_ref,
                  purpose_code=body.purpose_code, purpose_code_source="user" if body.purpose_code else None)
    db.add(inv)
    db.flush()
    audit.append(db, "user", "invoice.created", "invoice", inv.id, {"number": inv.number, "amount": inv.amount})
    db.commit()
    return inv_out(inv)


@router.get("/invoices")
def list_invoices(db: Session = Depends(get_db)):
    return [inv_out(i) for i in db.scalars(select(Invoice).order_by(Invoice.id.desc()))]


@router.get("/invoices/{inv_id}")
def get_invoice(inv_id: int, db: Session = Depends(get_db)):
    return inv_out(get_inv(db, inv_id))


@router.post("/invoices/{inv_id}/send")
async def send_invoice(inv_id: int, db: Session = Depends(get_db), pp: PayPalClient = Depends(get_paypal)):
    inv = get_inv(db, inv_id)
    exporter = db.scalars(select(ExporterProfile)).first()
    problems = svc.presend_problems(inv, exporter)
    if problems:
        raise HTTPException(422, {"message": "Pre-send checks failed", "problems": problems})
    payload = svc.build_paypal_invoice(inv, inv.client, exporter, get_settings().merchant_email)
    try:
        created = await pp.create_invoice(payload, svc.request_id_for(inv))
        pp_id = created.get("id") or (created.get("href") or "").rstrip("/").split("/")[-1]
        if not pp_id:
            raise HTTPException(502, "PayPal did not return an invoice id")
        inv.paypal_invoice_id = pp_id
        await pp.send_invoice(pp_id)
        full = await pp.get_invoice(pp_id)
    except PayPalError as e:
        raise HTTPException(502, {"message": "PayPal rejected the request", "action": e.action, "detail": e.body[:500]})
    inv.paypal_invoice_url = svc.recipient_url(full, pp_id)
    inv.status = "SENT"
    audit.append(db, "user", "invoice.sent", "invoice", inv.id, {"paypal_invoice_id": pp_id})
    db.commit()
    return inv_out(inv)


@router.post("/invoices/{inv_id}/pay-link")
async def pay_link(inv_id: int, db: Session = Depends(get_db), pp: PayPalClient = Depends(get_paypal)):
    """Orders v2 payment link. This path returns fee and net data on capture, so it is the demo's reliable route."""
    inv = get_inv(db, inv_id)
    if inv.status == "PAID":
        raise HTTPException(409, "Invoice is already paid")
    s = get_settings()
    try:
        order = await pp.create_order(amount=svc.money(inv.amount), currency=inv.currency, custom_id=inv.number,
                                      description=inv.service_description or inv.number,
                                      request_id=svc.request_id_for(inv) + "-order",
                                      return_url=f"{s.public_base_url}/payments/return",
                                      cancel_url=f"{s.public_base_url}/payments/cancel")
    except PayPalError as e:
        raise HTTPException(502, {"message": "PayPal rejected the request", "action": e.action, "detail": e.body[:500]})
    link = next((l["href"] for l in order.get("links", []) if l.get("rel") in ("approve", "payer-action")), None)
    inv.paypal_order_id = order["id"]
    audit.append(db, "user", "order.created", "invoice", inv.id, {"order_id": order["id"]})
    db.commit()
    return {"order_id": order["id"], "approve_url": link}


@router.get("/payments/return")
async def payment_return(token: str, db: Session = Depends(get_db), pp: PayPalClient = Depends(get_paypal)):
    """PayPal sends the buyer here after approval. We capture server-side, record, then go to the UI."""
    s = get_settings()
    inv = db.scalars(select(Invoice).where(Invoice.paypal_order_id == token)).first()
    if not inv:
        raise HTTPException(404, "Unknown order")
    try:
        data = await pp.capture_order(token)
    except PayPalError as e:
        if "ORDER_ALREADY_CAPTURED" not in e.body:
            raise HTTPException(502, {"message": "Capture failed", "detail": e.body[:500]})
        return RedirectResponse(f"{s.frontend_url}/app/ledger?paid={inv.number}", status_code=303)
    cap = extract_capture(data)
    if not cap:
        raise HTTPException(502, "Capture response had no capture")
    ledger.record_payment(db, map_capture(cap), data, invoice=inv, actor="user")
    db.commit()
    return RedirectResponse(f"{s.frontend_url}/app/ledger?paid={inv.number}", status_code=303)


@router.get("/payments/cancel")
def payment_cancel():
    return RedirectResponse(f"{get_settings().frontend_url}/app/invoices?cancelled=1", status_code=303)


@router.post("/payments/sync")
async def sync_payments(db: Session = Depends(get_db), pp: PayPalClient = Depends(get_paypal)):
    """Fallback when a webhook is late: poll PayPal for SENT invoices that have been paid."""
    created = 0
    for inv in db.scalars(select(Invoice).where(Invoice.status == "SENT", Invoice.paypal_invoice_id.is_not(None))):
        try:
            full = await pp.get_invoice(inv.paypal_invoice_id)
        except PayPalError:
            continue
        txs = ((full.get("payments") or {}).get("transactions")) or []
        for tx in txs:
            mapped = None
            if tx.get("payment_id"):
                try:
                    cap = await pp.get_capture(tx["payment_id"])
                    mapped = map_capture(extract_capture(cap))
                except (PayPalError, TypeError, KeyError):
                    mapped = None
            mapped = mapped or map_invoice_transaction(tx, (full.get("amount") or {}).get("breakdown"))
            _, was_new = ledger.record_payment(db, mapped, tx, invoice=inv)
            created += int(was_new)
    db.commit()
    return {"new_payments": created}


@router.get("/ledger")
def get_ledger(db: Session = Depends(get_db)):
    return ledger.ledger_rows(db)


@router.get("/payments/{payment_id}/true-cost")
async def payment_true_cost(payment_id: int, db: Session = Depends(get_db), fx: FxClient = Depends(get_fx)):
    """Fee + FX cost of one payment, valued in INR at the mid-market rate.

    `source` is the middle-market rate origin (frankfurter or simulated); `sources.receivable`
    is where the received amount came from (paypal or simulated). Nothing is ever silently mixed.
    """
    pay = db.get(Payment, payment_id)
    if not pay:
        raise HTTPException(404, "Payment not found")
    target = "INR"
    currency = pay.currency or target
    try:
        mid = await fx.rate(currency, target)
    except FxError as e:
        raise HTTPException(502, {"message": "FX rate unavailable", "detail": e.detail})
    paypal_rate = pay.fx_rate if pay.fx_rate_source == "paypal" else None
    tc = true_cost.compute_true_cost(gross=pay.gross, paypal_fee=pay.paypal_fee, net=pay.net,
                                     mid_rate=mid.rate, target_currency=target,
                                     receivable_amount=pay.receivable_amount,
                                     receivable_currency=pay.receivable_currency,
                                     paypal_rate=paypal_rate)
    dec = ledger.decimal_text
    return {
        "payment_id": pay.id,
        "capture_id": pay.paypal_capture_id,
        "invoice": pay.invoice.number if pay.invoice else None,
        "currency": currency,
        "target_currency": target,
        "source": mid.source,
        "sources": {"fx_rate": mid.source, "receivable": tc["actual_source"]},
        "fx": {"rate": dec(mid.rate), "source": mid.source, "as_of": mid.as_of},
        "gross": dec(tc["gross"]),
        "paypal_fee": dec(tc["paypal_fee"]),
        "net": dec(tc["net"]),
        "fee_percent": dec(tc["fee_percent"]),
        "mid_market_value": dec(tc["mid_market_value"]),
        "actual_value": dec(tc["actual_value"]),
        "fx_markup_percent": dec(tc["fx_markup_percent"]),
        "total_cost_percent": dec(tc["total_cost_percent"]),
    }
