"""B16 EDF engine unit tests: pure, deterministic, Decimal-only, offline.

These exercise ``app/services/edf_engine.py`` directly with frozen reference
dataclasses; no database, no network and no AI are involved.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from app.services.edf_engine import (
    BLOCKING,
    ClientRef,
    ExceptionRef,
    ExporterRef,
    InvoiceRef,
    PaymentRef,
    amount_in_words,
    build_pack,
    pack_ready,
    period_bounds,
    resolve_nrv,
    select_invoices,
    validate_pack,
)
from app.rules import engine as rules_engine

CFG = rules_engine.edf_pack_config()
RATES = rules_engine.matching_fx_rates()


def _invoice(
    number: str,
    *,
    amount: str = "1000.00",
    currency: str = "USD",
    issue: str = "2026-10-02",
    purpose: str | None = "P0802",
    sac: str | None = "998314",
    status: str = "SENT",
    invoice_id: int = 1,
    country: str = "US",
    address: str | None = "10 Buyer Street",
) -> InvoiceRef:
    return InvoiceRef(
        id=invoice_id,
        number=number,
        issue_date=date.fromisoformat(issue),
        currency=currency,
        amount=Decimal(amount),
        service_description="Software development services",
        contract_ref=f"SYN-{number}",
        contract_date=date.fromisoformat("2026-09-17"),
        purpose_code=purpose,
        sac_code=sac,
        status=status,
        client=ClientRef(name="Example Buyer Inc", country=country, address=address),
    )


EXPORTER = ExporterRef(
    legal_name="Synthetic Exporter Pvt Ltd",
    entity_type="company",
    pan="AAAAA0000A",
    gstin="00AAAAA0000A1Z0",
    ad_bank_name="Synthetic Bank",
    ad_code="00000000000000",
    ie_code="SYN-IEC-0001",
    address="1 Synthetic Tower",
    sac_code="998314",
)


# ---- amount_in_words ---------------------------------------------------------------


def test_amount_in_words_zero():
    assert amount_in_words(Decimal("0")) == "Indian Rupees Zero Only"


def test_amount_in_words_crore_and_paise():
    assert amount_in_words(Decimal("10000000")) == "Indian Rupees One Crore Only"
    assert (
        amount_in_words(Decimal("1694870.70"))
        == "Indian Rupees Sixteen Lakh Ninety Four Thousand Eight Hundred "
        "Seventy and Seventy Paise Only"
    )


def test_amount_in_words_is_decimal_only():
    # A float would drift here; Decimal must round half up to 2 places.
    assert amount_in_words(Decimal("123.456")) == (
        "Indian Rupees One Hundred Twenty Three and Forty Six Paise Only"
    )


# ---- period_bounds / select_invoices ----------------------------------------------


def test_period_bounds_regular_and_december():
    assert period_bounds(2026, 10) == (date(2026, 10, 1), date(2026, 10, 31))
    assert period_bounds(2026, 2) == (date(2026, 2, 1), date(2026, 2, 28))
    assert period_bounds(2026, 12) == (date(2026, 12, 1), date(2026, 12, 31))


def test_select_invoices_filters_period_and_status_then_sorts():
    invoices = [
        _invoice("INV-B", issue="2026-10-05", invoice_id=2),
        _invoice("INV-A", issue="2026-10-02", invoice_id=1),
        _invoice("INV-DRAFT", issue="2026-10-03", status="DRAFT", invoice_id=3),
        _invoice("INV-NOV", issue="2026-11-01", invoice_id=4),
    ]
    picked = select_invoices(
        invoices, year=2026, month=10, included_statuses=CFG["included_statuses"]
    )
    assert [i.number for i in picked] == ["INV-A", "INV-B"]


# ---- resolve_nrv -------------------------------------------------------------------


def test_resolve_nrv_prefers_paypal_net():
    inv = _invoice("INV-1", amount="1000.00", invoice_id=1)
    nrv = resolve_nrv(
        inv,
        [
            PaymentRef(
                id=5,
                invoice_id=1,
                capture_id="CAP",
                currency="USD",
                net=Decimal("970.00"),
            )
        ],
        {},
    )
    assert (nrv.value, nrv.currency, nrv.source) == (Decimal("970.00"), "USD", "paypal")


def test_resolve_nrv_falls_back_to_fira_inr():
    inv = _invoice("INV-1", amount="1000.00", invoice_id=7)
    nrv = resolve_nrv(inv, [], {7: Decimal("84000.00")})
    assert (nrv.value, nrv.currency, nrv.source) == (
        Decimal("84000.00"),
        "INR",
        "actual",
    )


def test_resolve_nrv_labels_invoiced_amount_expected():
    inv = _invoice("INV-1", amount="1000.00", invoice_id=9)
    nrv = resolve_nrv(inv, [], {})
    assert (nrv.value, nrv.currency, nrv.source) == (
        Decimal("1000.00"),
        "USD",
        "expected",
    )


def test_resolve_nrv_ignores_payment_without_net():
    inv = _invoice("INV-1", amount="1000.00", invoice_id=1)
    nrv = resolve_nrv(
        inv,
        [PaymentRef(id=1, invoice_id=1, capture_id="CAP", currency="USD", net=None)],
        {},
    )
    assert nrv.source == "expected"


# ---- validation --------------------------------------------------------------------


def test_validate_pack_is_ready_when_all_blockers_pass():
    invoice = _invoice("INV-1")
    lines = [
        {
            "invoice_number": "INV-1",
            "currency": "USD",
            "amount": "1000.00",
            "net_realisable_value": "970.00",
            "purpose_code": "P0802",
            "sac_code": "998314",
        }
    ]
    totals = {"by_currency": {"USD": "1000.00"}, "unconvertible_currencies": []}
    items = validate_pack(
        exporter=EXPORTER,
        lines=lines,
        totals=totals,
        cfg=CFG,
        reference_rates=RATES,
        open_exceptions=[],
    )
    assert pack_ready(items) is True
    assert all(i["ok"] for i in items if i["level"] == BLOCKING)


def test_validate_pack_flags_missing_purpose_code_as_blocking():
    lines = [
        {
            "invoice_number": "INV-1",
            "currency": "USD",
            "amount": "1000.00",
            "net_realisable_value": "970.00",
            "purpose_code": None,
            "sac_code": "998314",
        }
    ]
    totals = {"by_currency": {"USD": "1000.00"}, "unconvertible_currencies": []}
    items = validate_pack(
        exporter=EXPORTER,
        lines=lines,
        totals=totals,
        cfg=CFG,
        reference_rates=RATES,
        open_exceptions=[],
    )
    assert pack_ready(items) is False
    failed = {i["key"] for i in items if i["level"] == BLOCKING and not i["ok"]}
    assert failed == {"purpose_code"}


def test_validate_pack_flags_open_blocking_exception():
    lines = [
        {
            "invoice_number": "INV-1",
            "currency": "USD",
            "amount": "1000.00",
            "net_realisable_value": "970.00",
            "purpose_code": "P0802",
            "sac_code": "998314",
        }
    ]
    totals = {"by_currency": {"USD": "1000.00"}, "unconvertible_currencies": []}
    items = validate_pack(
        exporter=EXPORTER,
        lines=lines,
        totals=totals,
        cfg=CFG,
        reference_rates=RATES,
        open_exceptions=[ExceptionRef(category="unmatched", severity="high")],
    )
    assert pack_ready(items) is False
    # A non-blocking category must not block the pack.
    items_ok = validate_pack(
        exporter=EXPORTER,
        lines=lines,
        totals=totals,
        cfg=CFG,
        reference_rates=RATES,
        open_exceptions=[ExceptionRef(category="duplicate", severity="medium")],
    )
    assert pack_ready(items_ok) is True


# ---- build_pack --------------------------------------------------------------------


def test_build_pack_is_deterministic():
    invoices = [_invoice("INV-1", invoice_id=1), _invoice("INV-2", invoice_id=2)]
    payments = [
        PaymentRef(
            id=1, invoice_id=1, capture_id="CAP1", currency="USD", net=Decimal("970.00")
        )
    ]
    kwargs = dict(
        exporter=EXPORTER,
        invoices=invoices,
        payments=payments,
        fira_inr={},
        open_exceptions=[],
        reference_rates=RATES,
        cfg=CFG,
        year=2026,
        month=10,
        is_synthetic=True,
    )
    first = build_pack(**kwargs).snapshot
    second = build_pack(**kwargs).snapshot
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_build_pack_sections_and_totals():
    invoices = [_invoice("INV-1", amount="1000.00", invoice_id=1)]
    built = build_pack(
        exporter=EXPORTER,
        invoices=invoices,
        payments=[],
        fira_inr={},
        open_exceptions=[],
        reference_rates=RATES,
        cfg=CFG,
        year=2026,
        month=10,
        is_synthetic=True,
    )
    snapshot = built.snapshot
    assert snapshot["engine_version"] == "b16.1"
    assert snapshot["period"]["start"] == "2026-10-01"
    assert snapshot["period"]["end"] == "2026-10-31"
    assert snapshot["section_1_general_information"]["type_of_export"] == "Service"
    assert snapshot["section_1_general_information"]["ad_code"] == "00000000000000"
    assert snapshot["section_1_general_information"][
        "exporters_name_address"
    ].startswith("Synthetic Exporter Pvt Ltd")
    assert len(snapshot["section_2b_services"]) == 1
    # USD 1000 expected-NRV converted at the simulated YAML rate (84.00).
    assert snapshot["totals"]["total_inr"] == "84000.00"
    assert snapshot["section_4_declaration"]["realisation_date"] == "2027-07-02"
    assert "DRAFT WORKSHEET" in snapshot["section_4_declaration"]["worksheet_note"]
