"""
tests/test_india_export_rules.py
Tests verifying that rules/india_export.yaml and docs/edf-fields.md exist,
are non-empty, and contain the verified regulatory deadlines, thresholds,
STPI recognition under Regulation 2(1)(f)(iii), separate ₹10 Lakh provisions,
and the verified official RBI Form EDF Annex PDF structure.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent


def test_docs_edf_fields_exists_and_verified():
    doc_path = REPO_ROOT / "docs" / "edf-fields.md"
    assert doc_path.exists(), "docs/edf-fields.md must exist"
    content = doc_path.read_text(encoding="utf-8")
    assert len(content) > 1000, "docs/edf-fields.md should contain detailed documentation"

    # Verify primary sources cited
    assert "FEMA 23(R)/2026-RB" in content
    assert "FEMA 23(R)/(1)/2026-RB" in content
    assert "FEMA 23(R)/(2)/2026-RB" in content
    assert "A.P. (DIR Series) Circular No. 20" in content
    assert "13277" in content

    # Verify official RBI Annex PDF source, retrieval date, and pages
    assert "NRAR23R16012026_AN.pdf" in content
    assert "https://rbidocs.rbi.org.in/rdocs/content/pdfs/NRAR23R16012026_AN.pdf" in content
    assert "Pages 11" in content or "Pages 11–12" in content or "11-12" in content
    assert "November 5, 2026" in content

    # Verify Regulations 2, 3, 4, 5, 6, 18
    assert "Regulation 2" in content
    assert "Regulation 3" in content
    assert "Regulation 4" in content
    assert "Regulation 5" in content
    assert "Regulation 6" in content
    assert "Regulation 18" in content

    # Verify STPI specified authority status under Reg 2(1)(f)(iii) and Section 5
    assert "STPI" in content
    assert "2(1)(f)(iii)" in content or "Regulation 2(1)(f)(iii)" in content

    # Verify key verified rules and deadlines
    assert "30 days" in content
    assert "9 months" in content
    assert "12 months" in content
    assert "₹10 Lakh" in content
    assert "resident individual" in content
    assert "deemed" in content.lower()

    # Verify separation of the four ₹10 Lakh provisions
    assert "Deemed EDF Submission" in content
    assert "EDPMS" in content and "Closure" in content
    assert "Reduction in Export Realisation" in content
    assert "IDPMS" in content and "Import" in content

    # Verify verified status of Annex fields
    assert "VERIFIED AGAINST OFFICIAL RBI PRIMARY SOURCES" in content
    assert "2A. Details of Export Value^ of Goods" in content
    assert "2B. Details of Export Value^ of Services" in content
    assert "4. Declaration by the Exporters" in content
    assert "5. Space for use of Specified Authority" in content


def test_rules_india_export_yaml_exists_and_valid():
    yaml_path = REPO_ROOT / "rules" / "india_export.yaml"
    assert yaml_path.exists(), "rules/india_export.yaml must exist"
    content = yaml_path.read_text(encoding="utf-8")
    assert len(content) > 500, "rules/india_export.yaml should not be empty"

    # Verify regulatory identifiers and amendments
    assert "FEMA 23(R)/2026-RB" in content
    assert "FEMA 23(R)/(1)/2026-RB" in content
    assert "FEMA 23(R)/(2)/2026-RB" in content

    # Verify official Annex PDF reference
    assert "NRAR23R16012026_AN.pdf" in content
    assert "https://rbidocs.rbi.org.in/rdocs/content/pdfs/NRAR23R16012026_AN.pdf" in content
    assert "complete_verified" in content

    # Verify deadlines
    assert "service_edf_submission" in content
    assert "realisation_period_standard" in content
    assert "realisation_period_inr_settlement" in content

    # Verify the four distinct ₹10 Lakh provisions
    assert "provisions_10_lakh:" in content
    assert "deemed_edf_submission_non_individual" in content
    assert "edpms_entry_closure" in content
    assert "reduction_in_export_realisation" in content
    assert "idpms_service_import_reporting" in content

    # Verify STPI is recognized for software in DTA under Reg 2(1)(f)(iii)
    assert "dta_software" in content
    assert "STPI" in content
    assert "Regulation 2(1)(f)(iii)" in content

    # Verify verified flags
    assert "verified: true" in content
    assert 'last_verified: "2026-11-05"' in content

    # Verify purpose codes
    assert "P0802" in content
    assert "P1006" in content
    assert "P1099" in content

    # Verify Annex fields are verified from PDF
    assert "verified_from_primary_pdf" in content
    assert "section_1_general_information:" in content
    assert "section_2b_services:" in content
    assert "section_4_declaration:" in content
    assert "section_5_specified_authority:" in content
