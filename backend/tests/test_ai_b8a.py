"""Tests for B8A: PII masking and AI schemas.

Verifies that PII is correctly masked (names, emails, phones, PAN, GSTIN, UTR,
account numbers) and that business identifiers (AD code, IEC, SAC, currency,
purpose codes) are NOT masked. Also validates the AI schemas.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from datetime import datetime

from app.ai.pii import Masker, find_pii
from app.ai.schemas import AiProposalBase, PurposeExplanation, ExceptionRemediation


# ---- PII Masking Tests -------------------------------------------------------

def test_masker_masks_structured_pii():
    masker = Masker()
    
    # Names
    assert masker.token_for("name", "John Doe") == "[[NAME_1]]"
    assert masker.token_for("name", "Jane Smith") == "[[NAME_2]]"
    assert masker.token_for("name", "John Doe") == "[[NAME_1]]"  # Deterministic
    
    # Emails
    assert masker.token_for("email", "john@example.com") == "[[EMAIL_1]]"
    
    # Mapping check
    sealed = masker.seal("Hello [[NAME_1]]")
    assert sealed.mapping["[[NAME_1]]"] == "John Doe"
    assert sealed.mapping["[[NAME_2]]"] == "Jane Smith"
    assert sealed.mapping["[[EMAIL_1]]"] == "john@example.com"


def test_masker_masks_free_text_pii():
    masker = Masker()
    text = (
        "Contact John at john@example.com or +91-9876543210. "
        "PAN: ABCDE1234F, GSTIN: 27ABCDE1234F1Z5, "
        "Account: 123456789012, UTR: ABCD1234567"
    )
    
    masked = masker.mask_text(text)
    
    # Verify placeholders are present
    assert "[[EMAIL_1]]" in masked
    assert "[[PHONE_1]]" in masked
    assert "[[PAN_1]]" in masked
    assert "[[GSTIN_1]]" in masked
    assert "[[ACCOUNT_1]]" in masked
    assert "[[UTR_1]]" in masked
    
    # Verify original values are gone
    assert "john@example.com" not in masked
    assert "ABCDE1234F" not in masked
    assert "27ABCDE1234F1Z5" not in masked


def test_business_identifiers_are_not_masked_by_default():
    masker = Masker()
    # These should NOT be detected by the default regex patterns
    text = "AD Code: 1234567, IEC: 0123456789, SAC: 998311, Currency: USD, Purpose: P0101"
    
    masked = masker.mask_text(text)
    assert masked == text  # No changes


def test_find_pii_detects_remaining_pii():
    text_with_pii = "My email is test@example.com"
    text_without_pii = "My email is [[EMAIL_1]]"
    
    assert "email" in find_pii(text_with_pii)
    assert "email" not in find_pii(text_without_pii)


# ---- Schema Tests ------------------------------------------------------------

def test_ai_proposal_base_validation():
    data = {
        "task": "purpose_explain",
        "task_version": "b8.1",
        "target_type": "invoice",
        "target_id": 1,
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "engine_version": "b8.1",
    }
    proposal = AiProposalBase(**data)
    assert proposal.task == "purpose_explain"
    assert proposal.status == "proposed"
    assert isinstance(proposal.created_at, datetime)


def test_purpose_explanation_validation():
    # Valid
    valid_data = {
        "explanation": "This is a valid explanation of more than 40 characters to satisfy the length requirement in some contexts.",
        "key_factors": ["Factor 1", "Factor 2"]
    }
    exp = PurposeExplanation(**valid_data)
    assert exp.explanation == valid_data["explanation"]
    
    # Invalid: too short
    with pytest.raises(ValidationError):
        PurposeExplanation(explanation="", key_factors=[])
        
    # Invalid: too many key factors
    with pytest.raises(ValidationError):
        PurposeExplanation(explanation="Valid length explanation...", key_factors=["1", "2", "3", "4", "5", "6", "7", "8", "9"])
        
    # Invalid: extra fields
    with pytest.raises(ValidationError):
        PurposeExplanation(explanation="Valid...", key_factors=[], extra_field="not allowed")


def test_exception_remediation_validation():
    # Valid
    valid_data = {
        "remediation": "Propose a fix for the missing FIRA line by checking the bank statement.",
        "suggested_actions": ["Action 1", "Action 2"]
    }
    rem = ExceptionRemediation(**valid_data)
    assert rem.remediation == valid_data["remediation"]
    
    # Invalid: extra fields
    with pytest.raises(ValidationError):
        ExceptionRemediation(remediation="Valid...", suggested_actions=[], extra="forbidden")
