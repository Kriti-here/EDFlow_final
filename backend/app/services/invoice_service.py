"""Export-invoice logic: pre-send checks, PayPal payload, numbering."""
import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Client, ExporterProfile, Invoice
from ..rules import engine as rules_engine
from ..rules.loader import RulesConfigError

ALLOWED_CURRENCIES = {"USD", "EUR", "GBP", "AUD", "CAD", "SGD"}


def money(d: Decimal) -> str:
    return str(Decimal(d).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def next_number(db: Session, today: date | None = None) -> str:
    today = today or date.today()
    count = db.scalar(select(func.count()).select_from(Invoice)) or 0
    return f"EDF-{today:%y%m}-{count + 1:04d}"


def presend_problems(inv: Invoice, exporter: ExporterProfile | None) -> list[str]:
    """Deterministic checks that must pass before an invoice is sent through PayPal."""
    problems = []
    if not inv.purpose_code:
        problems.append("Purpose code is missing")
    else:
        try:
            if not rules_engine.validate_purpose_code(inv.purpose_code)["valid"]:
                problems.append(f"Unknown purpose code {inv.purpose_code}")
        except RulesConfigError:
            problems.append("Rules configuration unavailable")
    if exporter is None:
        return problems + ["Exporter profile is not set"]
    if not exporter.gstin:
        problems.append("Exporter GSTIN is missing")
    if not exporter.lut_number and not exporter.lut_not_applicable:
        problems.append("LUT number is missing (or mark LUT as not applicable)")
    if inv.currency not in ALLOWED_CURRENCIES:
        problems.append(f"Currency {inv.currency} is not allowed")
    if inv.amount <= 0:
        problems.append("Amount must be positive")
    return problems


def request_id_for(inv: Invoice) -> str:
    """Deterministic so a retry can never create a duplicate PayPal invoice."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"edflow-invoice-{inv.number}"))


def build_paypal_invoice(inv: Invoice, client: Client, exporter: ExporterProfile, merchant_email: str = "") -> dict:
    lut = exporter.lut_number or "NOT-APPLICABLE"
    note = f"PurposeCode: {inv.purpose_code} | GSTIN: {exporter.gstin} | LUT: {lut} | Contract: {inv.contract_ref or '-'}"
    payload = {
        "detail": {
            "invoice_number": inv.number, "currency_code": inv.currency, "note": note[:4000],
            "reference": (inv.contract_ref or inv.number)[:120],
            "memo": f"Export of services - {inv.service_description}"[:500],
            "terms_and_conditions": "Export of services. Payment in foreign currency.",
            "invoice_date": inv.issue_date.isoformat(),
            "payment_term": {"term_type": "DUE_ON_DATE_SPECIFIED", "due_date": inv.due_date.isoformat()},
        },
        "invoicer": {"name": {"business_name": exporter.legal_name[:300]}},
        "primary_recipients": [{"billing_info": {"name": {"business_name": client.name[:300]},
                                                 "email_address": client.email}}],
        "items": [{"name": (inv.service_description or "Services")[:200], "quantity": "1",
                   "unit_amount": {"currency_code": inv.currency, "value": money(inv.amount)}}],
    }
    if merchant_email:
        payload["invoicer"]["email_address"] = merchant_email
    return payload


def recipient_url(full: dict, invoice_id: str, base: str = "https://www.sandbox.paypal.com") -> str:
    url = ((full.get("detail") or {}).get("metadata") or {}).get("recipient_view_url")
    if url:
        return url
    for link in full.get("links", []):
        if link.get("rel") in ("payer-view", "recipient-view") and link.get("href"):
            return link["href"]
    return f"{base}/invoice/p/#{invoice_id}"
