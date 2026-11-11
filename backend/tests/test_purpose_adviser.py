"""B12 purpose adviser engine tests (pure, deterministic, no DB).

Exercises candidate generation, the weighted scoring, confidence bands and
determinism against the YAML lexicon. No AI, no network.
"""

from __future__ import annotations

import pytest

from app.rules import engine as rules_engine
from app.services import purpose_adviser as pa

from .purpose_helpers import corpus_pairs


@pytest.fixture()
def config():
    return rules_engine.purpose_adviser_config()


def _invoice(description: str, *, client_id: int = 1, contract: str | None = None):
    return pa.InvoiceInput(
        id=1,
        number="INV-TEST",
        client_id=client_id,
        service_description=description,
        contract_ref=contract,
    )


def test_weights_sum_to_exactly_10000(config):
    assert sum(config["weights_bp"].values()) == 10000
    assert set(config["weights_bp"]) == set(pa.SIGNALS)


def test_engine_version_is_yaml_driven(config):
    assert config["engine_version"] == "b12.1"


@pytest.mark.parametrize(
    "bp,expected",
    [
        (10000, "high"),
        (7000, "high"),
        (6999, "medium"),
        (4000, "medium"),
        (3999, "low"),
        (0, "low"),
    ],
)
def test_band_for_thresholds(bp, expected):
    assert pa.band_for(bp, high_bp=7000, medium_bp=4000) == expected


def test_normalize_tokens_drops_stopwords_and_punctuation(config):
    tokens = pa.normalize_tokens("Software-development SERVICES!", config["stopwords"])
    assert tokens == ["software", "development"]


@pytest.mark.parametrize("description,expected", corpus_pairs())
def test_top1_matches_expected_for_corpus(description, expected, config):
    recs = pa.recommend_for_invoice(_invoice(description), config=config)
    assert recs[0].code == expected


def test_software_consultancy_prefers_leading_term(config):
    """'software' leads 'consultancy', so P0802 wins over P1006."""
    recs = pa.recommend_for_invoice(_invoice("Software consultancy"), config=config)
    assert recs[0].code == "P0802"
    codes = {rec.code for rec in recs}
    assert "P1006" in codes  # consultancy is still a candidate, just not primary


def test_market_research_beats_generic_research(config):
    """'market research' (P1007) is primary over the later 'research' (P1008)."""
    recs = pa.recommend_for_invoice(_invoice("Market research services"), config=config)
    assert recs[0].code == "P1007"


def test_primary_without_echo_is_medium_band(config):
    recs = pa.recommend_for_invoice(
        _invoice("Software development services"), config=config
    )
    top = recs[0]
    assert top.code == "P0802"
    assert top.source == pa.SOURCE_ADVISER
    assert top.confidence_bp == config["weights_bp"]["keyword_primary"]
    assert top.confidence_band == pa.MEDIUM


def test_fira_echo_lifts_primary_to_high(config):
    recs = pa.recommend_for_invoice(
        _invoice("Software development services"),
        fira_echo_codes={"P0802"},
        config=config,
    )
    top = recs[0]
    assert top.confidence_bp == (
        config["weights_bp"]["keyword_primary"] + config["weights_bp"]["fira_echo"]
    )
    assert top.confidence_band == pa.HIGH
    assert top.score["fira_echo"] == config["weights_bp"]["fira_echo"]


def test_high_band_requires_primary_or_echo(config):
    """A non-primary candidate can never reach the high band on history alone."""
    history = [
        pa.HistoryEntry(client_id=1, code="P1006", tokens=frozenset({"consultancy"})),
        pa.HistoryEntry(client_id=1, code="P1006", tokens=frozenset({"consultancy"})),
    ]
    recs = pa.recommend_for_invoice(
        _invoice("Software consultancy"), history=history, config=config
    )
    secondary = next(rec for rec in recs if rec.code == "P1006")
    assert secondary.confidence_band != pa.HIGH


def test_history_same_client_adds_weight(config):
    history = [
        pa.HistoryEntry(client_id=1, code="P0802", tokens=frozenset({"software"})),
    ]
    recs = pa.recommend_for_invoice(
        _invoice("Software development services", client_id=1),
        history=history,
        config=config,
    )
    top = recs[0]
    assert (
        top.score["history_same_client"] == config["weights_bp"]["history_same_client"]
    )


def test_history_similar_service_adds_weight(config):
    history = [
        pa.HistoryEntry(
            client_id=99,  # different client, so only the similarity signal applies
            code="P0802",
            tokens=frozenset({"software", "development", "platform"}),
        ),
    ]
    recs = pa.recommend_for_invoice(
        _invoice("Software development services", client_id=1),
        history=history,
        config=config,
    )
    top = recs[0]
    assert (
        top.score["history_similar_service"]
        == config["weights_bp"]["history_similar_service"]
    )


def test_echo_only_candidate_is_surfaced(config):
    """A code seen on a FIRA line is proposed even without a keyword hit."""
    recs = pa.recommend_for_invoice(
        _invoice("unclassified professional work"),
        fira_echo_codes={"P1005"},
        config=config,
    )
    assert recs[0].code == "P1005"
    assert recs[0].source == pa.SOURCE_FIRA_ECHO


def test_fallback_when_no_signal(config):
    recs = pa.recommend_for_invoice(_invoice(""), config=config)
    assert len(recs) == 1
    assert recs[0].code == config["fallback_code"]
    assert recs[0].source == pa.SOURCE_FALLBACK
    assert recs[0].confidence_bp == 0
    assert recs[0].confidence_band == pa.LOW


def test_output_is_sorted_by_score_then_code(config):
    recs = pa.recommend_for_invoice(
        _invoice("Data processing and web hosting"), config=config
    )
    assert [rec.rank for rec in recs] == list(range(1, len(recs) + 1))
    keys = [(-rec.confidence_bp, rec.code) for rec in recs]
    assert keys == sorted(keys)


def test_deterministic_across_calls(config):
    first = pa.recommend_for_invoice(_invoice("Software consultancy"), config=config)
    second = pa.recommend_for_invoice(_invoice("Software consultancy"), config=config)
    assert [(r.code, r.confidence_bp, r.rank) for r in first] == [
        (r.code, r.confidence_bp, r.rank) for r in second
    ]
