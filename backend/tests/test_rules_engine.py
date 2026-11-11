"""B7 tests: rules loader/validation, engine date math, purpose codes, coverage, endpoints."""

from datetime import date
from decimal import Decimal

import pytest

from app.rules import engine
from app.rules.loader import RulesConfigError, load_rules, validate

VALID_DEADLINES = (
    "deadlines:\n  service_edf_submission:\n    days: 30\n    verified: true\n"
)


def _write(tmp_path, text):
    p = tmp_path / "rules.yaml"
    p.write_text(text, encoding="utf-8")
    return p


# ---- Loader: structure + fail-fast ------------------------------------------------


def test_load_rules_returns_validated_config():
    rules = load_rules()
    assert rules["version"]
    assert "service_edf_submission" in rules["deadlines"]
    assert "P0802" in rules["purpose_codes"]
    assert "deemed_submission_non_individual" in rules["thresholds"]


def test_load_rules_is_cached():
    assert load_rules() is load_rules()


def test_load_rules_missing_file(tmp_path):
    with pytest.raises(RulesConfigError):
        load_rules(tmp_path / "nope.yaml")


def test_load_rules_invalid_yaml(tmp_path):
    with pytest.raises(RulesConfigError):
        load_rules(_write(tmp_path, "version: [unclosed\n"))


def test_load_rules_rejects_non_mapping(tmp_path):
    with pytest.raises(RulesConfigError):
        load_rules(_write(tmp_path, "- just\n- a\n- list\n"))


def test_load_rules_rejects_missing_keys(tmp_path):
    with pytest.raises(RulesConfigError, match="missing required keys"):
        load_rules(_write(tmp_path, 'version: "x"\n'))


def test_load_rules_rejects_bad_deadline(tmp_path):
    bad = VALID_DEADLINES.replace("days: 30", "days: soon")
    with pytest.raises(RulesConfigError, match="integer 'days' or 'months'"):
        load_rules(
            _write(
                tmp_path,
                'version: "x"\nlast_updated: "y"\n'
                "governing_regulations: {a: 1}\n"
                + bad
                + "thresholds:\n  deemed_submission_resident_individual: {}\n"
                "  deemed_submission_non_individual: {}\n"
                "purpose_codes:\n  P1:\n    verified: true\n"
                "specified_authorities:\n  dta_services: {}\n",
            )
        )


def test_validate_rejects_purpose_code_without_verified(tmp_path):
    data = load_rules()
    data = {**data, "purpose_codes": {"P9999": {"code": "P9999"}}}
    with pytest.raises(RulesConfigError, match="boolean 'verified'"):
        validate(data, source="inline")


# ---- Engine: dates ----------------------------------------------------------------


@pytest.mark.parametrize(
    "issued,expected",
    [
        (date(2026, 11, 7), date(2026, 12, 30)),  # end of Nov + 30
        (date(2026, 11, 30), date(2026, 12, 30)),  # month end
        (date(2026, 1, 31), date(2026, 3, 2)),  # Jan end + 30 rolls past Feb (non-leap)
        (date(2026, 2, 10), date(2026, 3, 30)),  # non-leap February
        (date(2024, 2, 10), date(2024, 3, 30)),  # leap year February
        (date(2024, 2, 29), date(2024, 3, 30)),  # leap day itself
        (date(2026, 12, 15), date(2027, 1, 30)),  # year rollover
    ],
)
def test_edf_due_date(issued, expected):
    assert engine.edf_due_date(issued) == expected


def test_days_remaining_and_overdue():
    assert engine.days_remaining(date(2026, 11, 7), today=date(2026, 11, 7)) == 53
    assert engine.days_remaining(date(2026, 11, 7), today=date(2026, 12, 30)) == 0
    assert engine.days_remaining(date(2026, 11, 7), today=date(2027, 1, 1)) == -2


@pytest.mark.parametrize(
    "days_left,expected",
    [
        (-1, "overdue"),
        (0, "critical"),
        (7, "critical"),
        (8, "warning"),
        (15, "warning"),
        (16, "ok"),
    ],
)
def test_risk_level(days_left, expected):
    assert engine.risk_level(days_left) == expected


# ---- Engine: purpose codes --------------------------------------------------------


def test_validate_purpose_code():
    ok = engine.validate_purpose_code("P0802")
    assert ok["valid"] and ok["verified"] is True and ok["last_verified"]
    assert engine.validate_purpose_code("p0802")["valid"] is True  # case-insensitive
    unverified = engine.validate_purpose_code("P1101")
    assert unverified["valid"] is True and unverified["verified"] is False
    assert engine.validate_purpose_code("ZZZZ")["valid"] is False
    assert engine.validate_purpose_code(None)["valid"] is False


# ---- Engine: coverage + eligibility -----------------------------------------------


def test_entity_coverage_non_individual():
    cov = engine.entity_coverage(
        entity_type="company", pan=None, gstin=None, lut_number=None
    )
    assert cov["is_resident_individual"] is False
    assert cov["covered"] is False
    assert set(cov["missing"]) == {"pan", "gstin", "lut_number"}
    assert cov["deemed_submission"]["threshold_inr"] == Decimal("1000000")
    assert cov["deemed_submission"]["has_ceiling"] is True
    assert cov["specified_authority"]["authority"]


def test_entity_coverage_complete_and_individual():
    cov = engine.entity_coverage(
        entity_type="company", pan="AAAAA1111A", gstin="GST", lut_number="LUT-1"
    )
    assert cov["covered"] is True and cov["missing"] == []
    ind = engine.entity_coverage(
        entity_type="individual", pan="P", gstin="G", lut_not_applicable=True
    )
    assert ind["is_resident_individual"] is True
    assert ind["deemed_submission"]["threshold_inr"] is None
    assert ind["deemed_submission"]["has_ceiling"] is False


def test_self_declaration_eligibility():
    assert (
        engine.self_declaration_eligibility(
            entity_type="individual", amount_inr=Decimal("99999999")
        )["eligible"]
        is True
    )
    assert (
        engine.self_declaration_eligibility(
            entity_type="company", amount_inr=Decimal("1000000")
        )["eligible"]
        is True
    )
    over = engine.self_declaration_eligibility(
        entity_type="company", amount_inr=Decimal("1000000.01")
    )
    assert over["eligible"] is False and over["threshold_inr"] == Decimal("1000000")


# ---- Engine: status summary -------------------------------------------------------


def test_rule_status_summary():
    s = engine.rule_status_summary()
    assert s["source"] == "rules/india_export.yaml"
    assert s["verification_status"] == "complete_verified"
    assert s["verified"] is True
    assert s["last_verified"] == "2026-11-05"
    assert s["sections"]["purpose_codes"]["unverified"] == 2
    keys = {u["key"] for u in s["unverified"]}
    assert any(k.endswith("P1101") for k in keys) and any(
        k.endswith("P1401") for k in keys
    )


# ---- Endpoints --------------------------------------------------------------------


def test_get_rules_endpoint(client):
    r = client.get("/rules")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["source"] == "rules/india_export.yaml"
    assert b["verification_status"] == "complete_verified"
    assert b["last_verified"] == "2026-11-05"
    assert any(p["code"] == "P0802" and p["verified"] for p in b["purpose_codes"])


def test_entity_check_endpoint(client):
    ex_id = client.put(
        "/exporter",
        json={
            "legal_name": "Demo Exporter Pvt Ltd",
            "entity_type": "company",
            "pan": "AAAAA1111A",
            "gstin": "FAKEGSTIN0000001",
            "lut_number": "FAKE-LUT-1",
        },
    ).json()["id"]
    r = client.get(f"/rules/entity-check/{ex_id}")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["source"] == "rules/india_export.yaml" and b["last_verified"]
    assert b["coverage"]["covered"] is True


def test_entity_check_unknown_exporter_404(client):
    assert client.get("/rules/entity-check/424242").status_code == 404


# ---- Invoice-flow integration -----------------------------------------------------


def test_invoice_exposes_edf_deadline(client):
    body = {
        "client_name": "Acme Inc",
        "client_email": "buyer@example.com",
        "currency": "USD",
        "amount": "100.00",
        "purpose_code": "P0802",
        "issue_date": "2026-11-07",
    }
    inv = client.post("/invoices", json=body).json()
    assert inv["edf_due_date"] == "2026-12-30"
    assert isinstance(inv["edf_days_remaining"], int)
    assert inv["purpose_code_verified"] is True


def test_send_blocks_unknown_purpose_code(client, exporter, pp_mock):
    body = {
        "client_name": "Acme Inc",
        "client_email": "buyer@example.com",
        "currency": "USD",
        "amount": "100.00",
        "purpose_code": "P9999",
    }
    inv = client.post("/invoices", json=body).json()
    r = client.post(f"/invoices/{inv['id']}/send")
    assert r.status_code == 422
    assert "Unknown purpose code P9999" in r.json()["detail"]["problems"]
