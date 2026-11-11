"""B10: FIRA API tests -- upload, duplicate detection, listing, detail and audit."""

from __future__ import annotations

import json
from pathlib import Path

from app.config import get_settings
from app.models import AuditLog, FiraDocument, FiraLine
from app.services import audit

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"


def _pdf(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def _ground_truth(name: str) -> dict:
    return json.loads(
        (FIXTURE_DIR / f"{Path(name).stem}.ground_truth.json").read_text()
    )


def _post(
    client, name: str, data: bytes | None = None, content_type: str = "application/pdf"
):
    return client.post(
        "/fira/documents",
        files={"file": (name, data if data is not None else _pdf(name), content_type)},
    )


def test_upload_returns_201_with_extracted_lines(client):
    r = _post(client, "fira_01_clean.pdf")
    assert r.status_code == 201
    body = r.json()
    assert (
        body["fira_reference"]
        == _ground_truth("fira_01_clean.pdf")["fira"]["fira_reference"]
    )
    assert body["source"] == "deterministic"
    assert body["is_synthetic"] is True
    assert body["verification_status"] == "verified"
    assert body["confidence_bp"] == 10000
    assert body["line_count"] == 3
    assert len(body["lines"]) == 3
    assert body["lines"][0]["gross_amount"] == "2500.00"
    assert body["lines"][0]["currency"] == "USD"


def test_upload_matches_ground_truth_for_every_fixture(client):
    for name in (
        "fira_01_clean.pdf",
        "fira_02_fx_variance.pdf",
        "fira_03_split_duplicate.pdf",
        "fira_04_missing_unmatched.pdf",
        "fira_05_ambiguous.pdf",
    ):
        r = _post(client, name)
        assert r.status_code == 201, name
        body = r.json()
        gt = _ground_truth(name)
        assert body["line_count"] == len(gt["lines"])
        for got, expected in zip(body["lines"], gt["lines"]):
            assert got["utr"] == expected["utr"]
            assert got["gross_amount"] == expected["gross_amount"]
            assert got["net_amount_inr"] == expected["net_amount_inr"]
            assert got["purpose_code"] == expected["purpose_code"]
            assert got["invoice_reference"] == expected["invoice_reference"]


def test_duplicate_upload_is_rejected_with_existing_id(client):
    first = _post(client, "fira_02_fx_variance.pdf")
    assert first.status_code == 201
    first_id = first.json()["id"]

    second = _post(client, "fira_02_fx_variance.pdf")
    assert second.status_code == 409
    assert second.json()["detail"]["existing_document_id"] == first_id


def test_only_one_document_persisted_per_content(client, db_session):
    _post(client, "fira_05_ambiguous.pdf")
    _post(client, "fira_05_ambiguous.pdf")
    assert db_session.query(FiraDocument).count() == 1


def test_non_pdf_upload_is_rejected(client):
    r = _post(
        client, "notes.pdf", data=b"this is not a pdf", content_type="application/pdf"
    )
    assert r.status_code == 422


def test_empty_upload_is_rejected(client):
    r = _post(client, "empty.pdf", data=b"", content_type="application/pdf")
    assert r.status_code == 422


def test_oversized_upload_is_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "fira_max_upload_bytes", 16)
    r = _post(client, "fira_01_clean.pdf")
    assert r.status_code == 413


def test_list_documents(client):
    _post(client, "fira_01_clean.pdf")
    r = client.get("/fira/documents")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["documents"][0]["file_name"] == "fira_01_clean.pdf"
    assert "lines" not in body["documents"][0]


def test_get_document_detail(client):
    created = _post(client, "fira_03_split_duplicate.pdf").json()
    r = client.get(f"/fira/documents/{created['id']}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["lines"]) == 4
    assert [line["line_no"] for line in body["lines"]] == [1, 2, 3, 4]


def test_get_missing_document_is_404(client):
    assert client.get("/fira/documents/999").status_code == 404


def test_ingest_writes_audit_entry_and_sound_chain(client, db_session):
    _post(client, "fira_01_clean.pdf")
    actions = [row.action for row in db_session.query(AuditLog).all()]
    assert "fira.document_ingested" in actions
    ok, bad = audit.verify_chain(db_session)
    assert ok is True and bad is None


def test_lines_have_no_matching_column():
    """B10 must not introduce invoice-matching linkage."""
    columns = {column.name for column in FiraLine.__table__.columns}
    assert "matched_invoice_id" not in columns
    assert "invoice_reference" in columns  # the raw reference string is kept as-is
