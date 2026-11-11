# EDFlow

EDFlow is a month-end close assistant for Indian service exporters who are paid through PayPal. It creates export
invoices, records PayPal payments and fees, reads a weekly FIRA PDF, matches FIRA lines to invoices, flags
exceptions, and prepares a monthly EDF worksheet for the user's bank or CA. It never files with the RBI or a bank,
and never moves money without an explicit human click.

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript SPA | Tailwind CSS, React Router, REST calls to the backend |
| Backend | FastAPI (Python) + Uvicorn | SQLAlchemy 2.0 ORM, Pydantic v2 |
| Database | SQLite (local) / PostgreSQL (Render) | Set via `DATABASE_URL`; tables created at startup |
| Rules | `rules/india_export.yaml` | Deadlines, thresholds, purpose codes, EDF fields — never hardcoded |
| External | PayPal (sandbox), Frankfurter (FX) | AI provider optional and disabled by default |

- **Frontend** routes: Landing (`/`), Dashboard, Invoices, FIRA, Matching, Exceptions, Purpose, AI Insights,
  EDF Packs, Audit, Settings, Guide (`src/routes/AppRoutes.tsx`). Every service resolves the backend base URL
  through `src/services/api.ts` (`VITE_API_BASE_URL`).
- **Backend** routers: `core`, `invoices`, `rules`, `webhooks`, `fira`, `matches`, `exceptions`, `purpose`, `edf`,
  `ai` (`backend/app/main.py`).
- **Pipeline**: create invoice → send via PayPal Invoicing v2 → record payment and fee from capture → ingest FIRA
  PDF → match lines to invoices → derive exceptions → propose/accept purpose codes → generate the monthly EDF pack.
- **Money** uses Python `Decimal` only (never float) and is stored as a string/NUMERIC.
- **Rules** are data-driven: `app/rules` loads `rules/india_export.yaml`, which carries a `source` and
  `last_verified` for each entry.

## PayPal usage

- Sandbox base URL `https://api-m.sandbox.paypal.com` (`PAYPAL_BASE_URL`).
- **Invoicing v2** — `POST /invoices/{id}/send` creates and sends the invoice (`create_invoice` + `send_invoice`).
  Requires the Invoicing scope/feature on the app.
- **Orders v2** — `POST /invoices/{id}/pay-link` returns an approval URL; `GET /payments/return` captures the order
  server-side after the buyer approves, recording `paypal_fee` and net amount. This path returns fee/net data, so it
  is the demo's reliable route.
- **Idempotency** — create calls send a `PayPal-Request-Id` header (`request_id_for`).
- **Webhooks** — `POST /webhooks/paypal` verifies signatures with PayPal's verify-webhook-signature endpoint.
  Event ids are stored and duplicates ignored. `ALLOW_UNVERIFIED_WEBHOOKS` must stay `false` outside local testing.
- **Reporting** — `POST /payments/sync` pulls reporting data, which can be delayed by hours.
- Demo buyers must be **non-Indian** sandbox accounts: India-to-India checkout fails.
- Captures happen only on an explicit user action; EDFlow never moves money on its own.

## AI usage

- **Disabled by default.** `AI_ENABLED=false` and `AI_MODE=off`. With those settings no provider is ever called.
- **Modes** — `off | replay | record | live`. `replay` serves recorded fixtures from the AI cache directory
  (`fixtures/ai`) and never touches the network; `record`/`live` are opt-in.
- **Providers** — `none` (Null provider, default) or `gemini` (requires `AI_API_KEY`). The key is read only from the
  environment.
- **Endpoints** — `POST /ai/tasks/{task}/run` produces a proposal; `GET /ai/proposals`, `GET /ai/proposals/{id}`,
  and `POST /ai/proposals/{id}/accept|reject`. When the layer is disabled these return `503`.
- **PII masking** (`app/ai/pii.py`) runs before any text reaches a model.
- LLM output is **always a proposal** validated by Pydantic schemas and deterministic checks. Accepting an AI
  proposal records a human decision and does **not** by itself apply any business record.
- Purpose-code recommendations are a separate, deterministic adviser (`/purpose-adviser`, `/purpose-recommendations`);
  accepting a recommendation is the only path that writes `Invoice.purpose_code`.

## Trust model

- **AI proposes, code decides.** Every model output is a proposal that passes Pydantic validation and deterministic
  checks before it can be acted on.
- **Human in the loop.** Money is never created, sent, captured, refunded or paid without an authenticated user
  action; accept/reject decisions are recorded.
- **No regulatory filing.** EDFlow prepares an EDF worksheet for the user's bank or CA. It never files with the RBI
  or a bank; EDF exports are clearly marked as unfiled drafts.
- **Audit trail.** Sensitive actions (invoice created/sent, order created, webhook rejected, exception transitions,
  human decisions) are written to an audit log, exposed read-only via `GET /audit`.
- **Deterministic engines own the decisions** for matching, exceptions, purpose scoring and EDF totals; no model
  participates in those calculations.
- **Secrets** come only from environment variables (`app/config.py`) and are never logged.
- **Honest labels.** Data not sourced from PayPal is marked `simulated`/`synthetic`, and rules entries are surfaced as
  unverified in the UI when `verified` is false.

## Demo instructions

Local development:

```bash
# Backend
cd backend
pip install -r requirements-dev.txt
# copy backend/.env.example to a repo-root .env and fill in your sandbox credentials
uvicorn app.main:app --reload        # http://localhost:8000  (docs at /docs)

# Frontend
npm install
npm run dev                          # http://localhost:5173
```

Ensure `CORS_ORIGINS` includes the frontend origin (defaults cover `http://localhost:5173`).

Sample data: `fixtures/synthetic/` contains five synthetic FIRA PDFs with `*.ground_truth.json` and the
`demo_invoices.json` / `demo_payments.json` datasets. They carry a `SYNTHETIC - NOT A REAL DOCUMENT` watermark and
simulated FX rates. These support the test suite; there is **no one-click seed script**, so a manual walkthrough is:

1. `POST /fira/documents` with a PDF from `fixtures/synthetic/`.
2. `POST /matches/run` to match FIRA lines to invoices.
3. `GET /exceptions` and `GET /exceptions/summary` to review flagged items.
4. `POST /purpose-adviser/run` then review `/purpose-recommendations`.
5. `POST /edf-packs/generate` for the period, then `/edf-packs/summary`.

The FIRA, Matching, Exceptions, Purpose and EDF Packs screens fetch these endpoints live. Dashboard, Invoices,
AI Insights, Audit and Settings currently render static/seed data.

## Deployment instructions

Full details are in `DEPLOY.md`. Summary:

- **Frontend → Vercel.** Build `npm run build`, output `dist`, install `npm install`. `vercel.json` rewrites all
  routes to `index.html` for client-side routing. Set `VITE_API_BASE_URL` to the Render backend URL (inlined at
  build time; see `.env.production.example`).
- **Backend → Render.** Use `render.yaml` (Blueprint) or configure manually: root directory `backend`, build
  `pip install -r requirements-prod.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check
  path `/healthz`.
- **Database → Render PostgreSQL.** Point `DATABASE_URL` at the Render Postgres internal URL. Tables are created at
  startup via `Base.metadata.create_all`.
- **Environment.** Set `CORS_ORIGINS` (exact Vercel URL), `PUBLIC_BASE_URL`, `FRONTEND_URL` and the PayPal keys from
  `backend/.env.production.example`. `ALLOW_UNVERIFIED_WEBHOOKS` stays `false`; AI stays disabled unless enabled
  deliberately.

## Limitations

- The AI layer is **off by default** and its provider integration is minimal (Null and Gemini only); no recorded AI
  fixtures are committed, so `replay` has nothing to serve until fixtures exist.
- FIRA ingestion uses PDF **text** extraction (`pdfplumber`) tuned to the current statement format; image-only or
  scanned PDFs are not OCR'd.
- There is **no migration tool** (no Alembic). Schema is created with `create_all` at startup, so schema changes need
  manual handling.
- Payments are exercised against the **PayPal sandbox**; reporting data can lag by hours, and order/capture flows
  require non-Indian buyers.
- FX markup comes from an external rate (Frankfurter) or is labelled `simulated` when PayPal returns no conversion
  rate.
- Several workspace screens (Dashboard, Invoices, AI Insights, Audit, Settings) still show static/seed data rather
  than live backend data.
- There is **no authentication layer**; the API should be run locally or placed behind your own access control, and
  must not be exposed publicly with real data. `DEMO_ADMIN_KEY` is reserved and not yet enforced.
- EDFlow does not file anything and does not replace a CA's review.

## Screenshots

Placeholders — replace with real captures before publishing.

![Landing](docs/screenshots/01-landing.png)

![Dashboard](docs/screenshots/02-dashboard.png)

![FIRA documents](docs/screenshots/03-fira.png)

![Matching center](docs/screenshots/04-matching.png)

![Exceptions hub](docs/screenshots/05-exceptions.png)

![Purpose advisor](docs/screenshots/06-purpose.png)

![EDF packs](docs/screenshots/07-edf-packs.png)
