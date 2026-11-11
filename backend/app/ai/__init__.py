"""B8 AI layer: the AI proposes, code decides and a human approves.

Task-oriented only -- there is deliberately no generic chat. Every egress passes
through ``ai_client`` (PII-masked, cached, audited); output is validated by a
strict Pydantic schema and re-checked deterministically before a human may accept
it (AGENTS.md rules 2, 5 and 6).
"""
