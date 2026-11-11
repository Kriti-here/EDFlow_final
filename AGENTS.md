# EDFlow project rules (read before every task)

Product: EDFlow, a month-end close assistant for Indian service exporters paid via PayPal.
It creates export invoices (PayPal Invoicing v2), records PayPal payments and fees, reads a weekly FIRA PDF,
matches FIRA lines to invoices, flags exceptions, and prepares a monthly EDF worksheet for the user's bank or CA.
It NEVER files with the RBI or a bank, and NEVER moves money without an explicit human click.

## Hard rules

1. Money: use Python Decimal only. Never float. Store money as NUMERIC or string.
2. AI proposes, code decides. LLM output is always a proposal validated by Pydantic schemas and deterministic checks.
   LLMs never create, send, capture, refund or pay anything. Only service functions called by an authenticated user
   action or an approved agent tool can do that, and every such call is written to audit_log.
3. Secrets only from environment variables via app/config.py. Never hardcode keys. Never log secrets or full PII.
   Keep .env.example complete with placeholder values. There is ONE real .env at the repo root (git-ignored).
4. PayPal: sandbox base URL https://api-m.sandbox.paypal.com. Use PayPal-Request-Id headers on create calls for
   idempotency. Verify every webhook with PayPal's verify-webhook-signature endpoint. Store webhook event ids
   and ignore duplicates. Demo buyers must be non-Indian sandbox accounts (India-to-India checkout fails).
5. PII: before any text goes to an LLM, run app/ai/pii.py masking (names, emails, phones, account numbers, PAN, GSTIN).
6. Rules (deadlines, thresholds, purpose codes) live in rules/india_export.yaml with source and last_verified.
   Never hardcode a regulation in code. Anything marked unverified must be shown as unverified in the UI.
7. Every feature gets tests (pytest). Do not mark a task done until tests pass and the app starts.
8. Keep functions small, typed, and documented. Use ruff formatting. No dead code. No TODO without a note.
9. Frontend: Next.js App Router, TypeScript, Tailwind, Framer Motion for UI animation, GSAP for the hero timeline,
   AG Grid Community for tables. Respect prefers-reduced-motion. Keep animations at 60fps (animate transform and opacity).
10. Demo safety: add a record/replay cache for LLM calls and a "simulated" label wherever data is not from PayPal.
11. Do not add dependencies without saying why. Prefer the standard library.
12. After each task, print: files changed, commands to run, and how to verify.

## Facts learned in the sandbox spike (3-5 Nov 2026)

- Orders v2 create, buyer approval and capture work. The capture returned paypal_fee and net_amount.
- receivable_amount and exchange_rate were empty when the seller received USD with no conversion, so FX markup
  must come from an external rate (Frankfurter) or be labelled "simulated".
- Invoicing v2 needs the https://uri.paypal.com/services/invoicing scope and the Invoicing feature enabled on the app.
- Reporting API data can be delayed by hours.