"""SQLAlchemy models for the EDFlow starter backend.

FIRA extraction (B10) adds `fira_documents` and `fira_lines`, which store an
uploaded FIRA statement and its extracted remittance rows. Matching (B11) adds
`match_records`: one durable, deterministic decision per FIRA line. The exception
engine (B13) adds `exceptions`: the review lifecycle projected over those
decisions and over ledger gaps. The purpose code adviser (B12) adds
`purpose_recommendations`: proposed RBI purpose codes awaiting human review.
EDF pack generation (B16) adds `edf_packs` and `edf_pack_lines`: a monthly,
deterministic EDF worksheet assembled from the ledger for the exporter's bank or
CA. A pack is a worksheet, never a filing, and is frozen (with a SHA-256 snapshot
hash) when a human approves it.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Money(TypeDecorator):
    """Exact decimal stored as text, so SQLite never turns money into a float.

    Sort and total in Python (Decimal), not in SQL, because the column is text.
    """

    impl = String(40)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else str(Decimal(str(value)))

    def process_result_value(self, value, dialect):
        return None if value is None else Decimal(value)


class ExporterProfile(Base):
    __tablename__ = "exporter_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_name: Mapped[str] = mapped_column(String(300), nullable=False)
    entity_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="company"
    )
    pan: Mapped[str | None] = mapped_column(String(20))
    gstin: Mapped[str | None] = mapped_column(String(20))
    lut_number: Mapped[str | None] = mapped_column(String(100))
    lut_not_applicable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    ad_bank_name: Mapped[str | None] = mapped_column(String(200))
    # EDF Section 1 identity fields (B16). User data, not regulation.
    ad_code: Mapped[str | None] = mapped_column(String(40))
    ie_code: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    sac_code: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (UniqueConstraint("email", name="uq_clients_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    country: Mapped[str | None] = mapped_column(String(100))
    # EDF Section 2B "Service recipient Name & Address" (B16).
    address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="client")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("number", name="uq_invoices_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    service_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    contract_ref: Mapped[str | None] = mapped_column(String(120))
    # EDF Section 2B additions (B16): SAC code and the contract date.
    sac_code: Mapped[str | None] = mapped_column(String(20))
    contract_date: Mapped[date | None] = mapped_column(Date)
    purpose_code: Mapped[str | None] = mapped_column(String(20))
    purpose_code_source: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT")
    paypal_invoice_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    paypal_invoice_url: Mapped[str | None] = mapped_column(Text)
    paypal_order_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="invoices")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True, index=True
    )
    paypal_event_id: Mapped[str | None] = mapped_column(String(100), index=True)
    paypal_capture_id: Mapped[str] = mapped_column(
        String(120), nullable=False, unique=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str | None] = mapped_column(String(3))
    gross: Mapped[Decimal | None] = mapped_column(Money)
    paypal_fee: Mapped[Decimal | None] = mapped_column(Money)
    net: Mapped[Decimal | None] = mapped_column(Money)
    receivable_currency: Mapped[str | None] = mapped_column(String(3))
    receivable_amount: Mapped[Decimal | None] = mapped_column(Money)
    fx_rate: Mapped[Decimal | None] = mapped_column(Money)
    fx_rate_source: Mapped[str | None] = mapped_column(String(40))
    data_source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="paypal-capture"
    )
    raw_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    invoice: Mapped["Invoice | None"] = relationship(back_populates="payments")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[str] = mapped_column(String(40), nullable=False)
    actor: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(120), nullable=False)
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paypal_event_id: Mapped[str] = mapped_column(
        String(120), nullable=False, unique=True
    )
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


# ---- B10: FIRA extraction --------------------------------------------------------
#
# Scope is strictly PDF -> validation -> extraction -> verification -> storage.
# There is deliberately NO matching, NO invoice linking and NO EDF generation here;
# those arrive in later phases. `FiraLine` therefore carries no `matched_invoice_id`.
#
# AI seam (future only): a later phase may add an LLM fallback extractor behind
# `FiraDocument.source`. Any such output MUST be a proposal validated by
# `app/services/fira_verify.py` and re-checked deterministically before storage
# (AGENTS.md rule 2). No AI code exists in this phase.


class FiraDocument(Base):
    """One uploaded FIRA statement and its extraction/verification outcome."""

    __tablename__ = "fira_documents"
    __table_args__ = (UniqueConstraint("sha256", name="uq_fira_documents_sha256"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    content: Mapped[bytes | None] = mapped_column(LargeBinary)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    fira_reference: Mapped[str | None] = mapped_column(String(80))
    bank_name: Mapped[str | None] = mapped_column(String(300))
    ad_code: Mapped[str | None] = mapped_column(String(40))
    statement_period_start: Mapped[date | None] = mapped_column(Date)
    statement_period_end: Mapped[date | None] = mapped_column(Date)
    generated_on: Mapped[date | None] = mapped_column(Date)

    # "deterministic" today; a future AI path would set "ai" and remain a proposal.
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="deterministic"
    )
    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="needs_review"
    )
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    line_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    issues_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    raw_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    lines: Mapped[list["FiraLine"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="FiraLine.line_no",
    )


class FiraLine(Base):
    """One extracted remittance row from a FIRA statement.

    Money columns use `Money` (exact Decimal stored as text). No invoice link is
    stored: matching is a later phase.
    """

    __tablename__ = "fira_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("fira_documents.id"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)

    utr: Mapped[str | None] = mapped_column(String(80))
    value_date: Mapped[date | None] = mapped_column(Date)
    remitter_name: Mapped[str | None] = mapped_column(String(300))
    remitter_country: Mapped[str | None] = mapped_column(String(120))
    currency: Mapped[str | None] = mapped_column(String(3))
    gross_amount: Mapped[Decimal | None] = mapped_column(Money)
    bank_charges: Mapped[Decimal | None] = mapped_column(Money)
    net_amount_inr: Mapped[Decimal | None] = mapped_column(Money)
    purpose_code: Mapped[str | None] = mapped_column(String(20))
    invoice_reference: Mapped[str | None] = mapped_column(String(80))

    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="needs_review"
    )
    issues_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    raw_text: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    document: Mapped["FiraDocument"] = relationship(back_populates="lines")


# ---- B11: deterministic matching -------------------------------------------------
#
# Scope is strictly FIRA line -> invoice/payment matching. There is deliberately
# NO exception engine, NO purpose-code suggestion, NO EDF generation and NO AI
# here; those arrive in later phases. A `MatchRecord` is a *stored decision*
# (auditable and reproducible) rather than a computed view, so `FiraLine` stays
# unchanged and never gains a `matched_invoice_id` (AGENTS.md rules 2 and 6).


class MatchRecord(Base):
    """The deterministic decision linking one FIRA line to the ledger.

    Exactly one row per ``FiraLine``. Every field is derived by
    ``app/services/matching.py`` from the line, the invoice/payment ledger and the
    weights/thresholds in ``rules/india_export.yaml``. Matching never mutates the
    source rows; it records a decision, its evidence and its confidence.
    """

    __tablename__ = "match_records"
    __table_args__ = (
        UniqueConstraint("fira_line_id", name="uq_match_records_fira_line"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    fira_line_id: Mapped[int] = mapped_column(
        ForeignKey("fira_lines.id"), nullable=False, index=True
    )
    # Populated only for auto-matched lines (never for duplicate/unmatched lines).
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True, index=True
    )
    # Populated only when high confidence AND exactly one payment candidate exists.
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id"), nullable=True, index=True
    )

    # exact | fx_variance | split | duplicate | missing_reference | unmatched |
    # ambiguous | amount_mismatch
    match_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # matched | matched_with_variance | duplicate | exception | needs_review
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confidence_band: Mapped[str] = mapped_column(
        String(10), nullable=False, default="low"
    )

    candidates_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    score_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")

    duplicate_of_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("fira_lines.id"), nullable=True
    )

    split_group: Mapped[str | None] = mapped_column(String(80))
    split_part: Mapped[int | None] = mapped_column(Integer)
    split_parts_total: Mapped[int | None] = mapped_column(Integer)

    fx_expected_rate: Mapped[Decimal | None] = mapped_column(Money)
    fx_actual_rate: Mapped[Decimal | None] = mapped_column(Money)
    fx_variance_bp: Mapped[int | None] = mapped_column(Integer)

    # Version of the deterministic engine that produced this decision.
    engine_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by: Mapped[str | None] = mapped_column(String(60))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# ---- B13: exception engine -------------------------------------------------------
#
# An exception is a *projection* of the current match records and ledger gaps, not a
# new source of truth: `MatchRecord` stays authoritative and a FIRA line's decision
# is never mutated here. The exception table owns only the review lifecycle (open ->
# acknowledged -> resolved/dismissed) plus auto-close when the condition disappears.
# Severity and enablement are YAML-driven (AGENTS.md rule 6). No AI, no EDF
# generation, no agent and no frontend are part of this phase.


class ExceptionRecord(Base):
    """One outstanding (or historically closed) compliance exception.

    Rows are created and auto-closed by ``app/services/exception_service.py`` from
    the deterministic derivation in ``app/services/exception_engine.py``. The
    ``dedupe_key`` makes derivation idempotent: the same condition maps to the same
    row, so re-deriving never duplicates and a vanished condition auto-closes.
    """

    __tablename__ = "exceptions"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_exceptions_dedupe_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # unmatched | ambiguous | duplicate | fx_variance | missing_reference |
    # missing_fira | missing_payment | orphan_payment
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # low | medium | high | critical
    severity: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # open | acknowledged | resolved | dismissed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", index=True
    )
    # match_record (derived from a MatchRecord) | ledger (derived from a ledger gap)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="ledger")
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)

    match_id: Mapped[int | None] = mapped_column(
        ForeignKey("match_records.id"), nullable=True, index=True
    )
    fira_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("fira_lines.id"), nullable=True, index=True
    )
    fira_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("fira_documents.id"), nullable=True, index=True
    )
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True, index=True
    )
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id"), nullable=True, index=True
    )

    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # Version of the deterministic engine that last derived this exception.
    engine_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[str | None] = mapped_column(String(60))
    acknowledged_note: Mapped[str | None] = mapped_column(Text)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(String(60))
    resolution_note: Mapped[str | None] = mapped_column(Text)

    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_by: Mapped[str | None] = mapped_column(String(60))
    dismissed_note: Mapped[str | None] = mapped_column(Text)

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# The purpose code adviser (B12) proposes an RBI purpose code for an invoice from
# its service description, contract reference, ledger history and the code seen on
# a matching FIRA line. A recommendation is a proposal, not a decision: the adviser
# never writes ``Invoice.purpose_code``. Only an explicit human accept does, via
# ``POST /purpose-recommendations/{id}/accept`` (AGENTS.md rule 2). Weights,
# thresholds and the keyword lexicon are YAML-driven (AGENTS.md rule 6) and scoring
# is deterministic and integer-only. No AI, no EDF generation, no agent.


class PurposeRecommendation(Base):
    """One proposed purpose code for one invoice, with its review lifecycle.

    This table owns the recommendation lifecycle (proposed -> accepted/rejected,
    plus superseded when re-derivation replaces it). ``Invoice.purpose_code``
    remains the authoritative committed value; a row here only becomes binding when
    a human accepts it. The unique ``(invoice_id, code)`` pair keeps the advice
    idempotent: re-running the adviser updates or supersedes rather than duplicates.
    """

    __tablename__ = "purpose_recommendations"
    __table_args__ = (
        UniqueConstraint("invoice_id", "code", name="uq_purpose_recs_invoice_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # high | medium | low
    confidence_band: Mapped[str] = mapped_column(
        String(10), nullable=False, default="low", index=True
    )
    # adviser (keyword) | fira_echo | history | fallback
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="adviser")
    # proposed | accepted | rejected | superseded
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="proposed", index=True
    )

    score_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    matched_keywords_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]"
    )
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Version of the deterministic adviser that last proposed this code.
    engine_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[str | None] = mapped_column(String(60))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[str | None] = mapped_column(String(60))
    decision_note: Mapped[str | None] = mapped_column(Text)

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# EDF pack generation (B16) assembles a *worksheet* -- one calendar month of
# raised invoices mapped onto the RBI EDF form (Sections 1, 2B and 4). It is
# deterministic, offline and Decimal-only: every field is derived from the
# ledger, never from an LLM or the network (AGENTS.md rules 2 and 6). A pack
# owns its own lifecycle (draft -> approved -> exported) and is frozen with a
# SHA-256 snapshot hash on approval. It NEVER files anything with a bank or the
# RBI; it only produces a document for the exporter's bank or CA.


class EDFPack(Base):
    """One monthly EDF worksheet and its approval lifecycle.

    The unique ``(period_year, period_month)`` pair makes generation idempotent:
    re-generating a draft refreshes it in place rather than duplicating. Once
    approved, the ``snapshot_json`` is frozen and its SHA-256 stored in
    ``approved_snapshot_hash`` so the reviewed document is reproducible.
    """

    __tablename__ = "edf_packs"
    __table_args__ = (
        UniqueConstraint("period_year", "period_month", name="uq_edf_packs_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # draft | approved | exported | void
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", index=True
    )
    line_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Frozen Section 1 identity, currency totals and the completeness checklist.
    exporter_snapshot_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}"
    )
    totals_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    validation_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    pack_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # The complete, self-contained worksheet document. Frozen on approval.
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    approved_snapshot_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, default=""
    )

    # Version of the deterministic engine that produced this pack.
    engine_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(String(60))
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exported_by: Mapped[str | None] = mapped_column(String(60))
    note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    lines: Mapped[list["EDFPackLine"]] = relationship(
        back_populates="pack",
        cascade="all, delete-orphan",
        order_by="EDFPackLine.sequence",
    )


class EDFPackLine(Base):
    """One Section 2B row: a frozen snapshot of a single invoice in a pack.

    Provenance FKs (``invoice_id`` / ``payment_id`` / ``match_id``) point back to
    the ledger rows the row was derived from. Money columns use ``Money`` (exact
    Decimal stored as text).
    """

    __tablename__ = "edf_pack_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pack_id: Mapped[int] = mapped_column(
        ForeignKey("edf_packs.id"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True, index=True
    )
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id"), nullable=True
    )
    match_id: Mapped[int | None] = mapped_column(
        ForeignKey("match_records.id"), nullable=True
    )

    client_name: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    client_country: Mapped[str | None] = mapped_column(String(100))
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    invoice_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str | None] = mapped_column(String(3))
    amount: Mapped[Decimal | None] = mapped_column(Money)

    net_realisable_value: Mapped[Decimal | None] = mapped_column(Money)
    nrv_currency: Mapped[str | None] = mapped_column(String(3))
    # paypal | actual | simulated | expected
    nrv_source: Mapped[str] = mapped_column(String(20), nullable=False, default="")

    contract_ref: Mapped[str | None] = mapped_column(String(120))
    contract_date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sac_code: Mapped[str | None] = mapped_column(String(20))
    remarks: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    pack: Mapped["EDFPack"] = relationship(back_populates="lines")


# The AI layer (B8) adds `ai_proposals`: task-oriented proposals produced by an LLM
# and *never* applied automatically (AGENTS.md rule 2). AI proposes, code decides
# (strict Pydantic schema + deterministic verification) and a human approves via the
# explicit accept action. No business record is mutated here. Free text is PII-masked
# before egress (rule 5); the layer is offline by default and every call, proposal
# and decision is written to the audit log. There is deliberately no generic chat:
# every proposal belongs to a named task (purpose_explain, exception_remediation).


class AiProposal(Base):
    """One AI proposal for one named task and target, with its review lifecycle.

    The unique ``dedupe_key`` makes re-running a task idempotent: the same
    (task, target, task_version) maps to the same row. The row owns only the
    proposal lifecycle (proposed -> accepted/rejected, plus superseded/failed); it
    stores the validated payload and the deterministic verification that checked it.
    A human decision is never overwritten by re-running the task.
    """

    __tablename__ = "ai_proposals"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_ai_proposals_dedupe_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # purpose_explain | exception_remediation
    task: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    task_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    # invoice | exception (the kind of record the proposal concerns)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # proposed | accepted | rejected | superseded | failed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="proposed", index=True
    )

    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    confidence_bp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # high | medium | low
    confidence_band: Mapped[str] = mapped_column(
        String(10), nullable=False, default="low"
    )

    # Validated proposal content (strict Pydantic schema) and the deterministic checks.
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    validation_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    failed_reason: Mapped[str | None] = mapped_column(Text)

    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False, default="")

    # Version of the deterministic engine/registry that produced this proposal.
    engine_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[str | None] = mapped_column(String(60))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[str | None] = mapped_column(String(60))
    decision_note: Mapped[str | None] = mapped_column(Text)

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
