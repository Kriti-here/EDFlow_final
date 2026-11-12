# EDFlow

> **Autonomous Month-End Close & Regulatory Compliance Assistant for Indian Service Exporters on PayPal**

[![Frontend Deployment](https://img.shields.io/badge/Frontend-Vercel-black?style=flat&logo=vercel)](https://edflowfinal.vercel.app)
[![Backend Deployment](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat&logo=render)](https://edflow-backend.onrender.com)
[![API Docs](https://img.shields.io/badge/API_Docs-Swagger_UI-85EA2D?style=flat&logo=fastapi)](https://edflow-backend.onrender.com/docs)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Render_Managed-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Live Deployments & Links

- **Live Application (Frontend)**: [https://edflowfinal.vercel.app](https://edflowfinal.vercel.app)
- **Production Backend API**: [https://edflow-backend.onrender.com](https://edflow-backend.onrender.com)
- **Interactive Swagger Documentation**: [https://edflow-backend.onrender.com/docs](https://edflow-backend.onrender.com/docs)
- **GitHub Repository**: [https://github.com/Kriti-here](https://github.com/Kriti-here)

---

## Overview & Screenshot

EDFlow automates month-end reconciliation, FIRA mapping, and Export Declaration Form (EDF) preparation for Indian software engineers, agencies, and service exporters receiving foreign currency remittances via PayPal.

![EDFlow Hero Banner](src/assets/hero.png)

---

## Problem Statement

Indian digital service exporters receiving cross-border client payments via PayPal face strict, labor-intensive Reserve Bank of India (RBI) and Foreign Exchange Management Act (FEMA) regulatory requirements:

1. **Strict Realization Deadlines**: FEMA mandates foreign currency export remittances be realized and reconciled within 9 months from the invoice date.
2. **Missing FIRA Tracking**: PayPal batches payouts into Authorised Dealer (AD) banks, issuing periodic Foreign Inward Remittance Advices (FIRAs). Matching consolidated FIRA remittance rows against individual client invoices is error-prone and manual.
3. **Opaque Deductions & FX Markup**: Payment gateway fees and currency exchange markups are often obscured across invoices, making net realization and export turnover calculations difficult.
4. **Complex Regulatory Paperwork**: Exporters or their Chartered Accountants (CAs) must assemble structured monthly EDF worksheets (Sections 1, 2B, and 4) cross-referencing invoice details, SAC codes, purpose codes, and AD banking information.

---

## Solution Overview

EDFlow provides a centralized, deterministic month-end close pipeline:

- **Exact Currency Accounting**: Built exclusively with Python `Decimal` data structures—never floats—to guarantee rupee-for-rupee precision across fee splits and currency conversions.
- **Automated FIRA Ingestion**: Extracts remittance lines directly from electronic FIRA statements (`pdfplumber`) and evaluates document integrity via SHA-256 checksums and extraction confidence scores.
- **Deterministic Reconciliation**: Multi-candidate scoring matches bank remittance rows against unpaid invoices based on purpose codes, client names, dates, and currency values.
- **Exception Lifecycle Management**: Proactively flags compliance gaps (FX variance anomalies, unmatched remittances, split payments, duplicate claims) into an auditable lifecycle.
- **Audit-Ready EDF Preparation**: Assembles standard monthly EDF worksheets (with SHA-256 snapshot hashes on human sign-off) for CA review or bank submission.
- **Zero Regulatory Risk**: **EDFlow never files directly with the RBI or AD banks**, and **never moves funds without explicit human approval**.

---

## Implementation Status

To provide full technical transparency, features are categorized by verified status:

### Implemented & Production-Verified
- [x] **Export Invoice Creation**: Generation of export invoices with due-date tracking, purpose codes, and Decimal financial math.
- [x] **PayPal Invoicing v2 & Orders v2**: Creation and dispatch of invoices via PayPal Invoicing API, alongside instant approval payment links via Orders v2.
- [x] **Live PayPal Payment Synchronization (`POST /payments/sync`)**:
  - **Verified in Sandbox**: Invoice `EDF-2611-0002` ($5,000.00 USD from customer *BluePeak Analytics Inc.*, Purpose Code `P0802`) was paid in the PayPal Sandbox, synchronized via `POST /payments/sync` (`new_payments = 1`), accurately recorded into the ledger, and reflected in real-time as **PAID** on the frontend.
- [x] **FIRA PDF Parsing & Verification**: Extraction of remittance rows from statement PDFs with confidence scoring and duplicate statement detection.
- [x] **Deterministic Matching Engine**: Automated scoring linking FIRA lines to invoice ledger entries without floating-point distortion.
- [x] **Compliance Exception Engine**: Deterministic detection of FX variances, duplicate lines, and missing references with full status transitions (`open` &rarr; `acknowledged` &rarr; `resolved` / `dismissed`).
- [x] **Purpose Code Advisor**: Deterministic classification engine matching service descriptions and contracts to RBI purpose codes (e.g., `P0802` for software exports).
- [x] **Monthly EDF Pack Assembly**: Compiles Sections 1, 2B, and 4 of the RBI EDF format, complete with validation checks, frozen SHA-256 approval snapshots, and CSV/JSON export.
- [x] **Cryptographic Audit Chain**: SHA-256 hash-chained immutable audit log for all system actions (`GET /audit`).
- [x] **External Rules Integration**: YAML-driven regulatory parameters loaded dynamically from [`rules/india_export.yaml`](rules/india_export.yaml).

### Partially Implemented / Known In-Progress
- [ ] **PayPal Webhook Delivery**: Webhook endpoint (`POST /webhooks/paypal`) verifies incoming signatures with PayPal's `verify-webhook-signature` API. However, in the Render deployment, synchronous webhook processing currently encounters database transaction timeouts. Webhook signature verification remains strictly enabled, and `POST /payments/sync` serves as the verified operational reconciliation mechanism.
- [ ] **Live vs. Seed Interface Data**: The FIRA, Matching, Exceptions, Purpose, and EDF Packs screens fetch and mutate live backend records. The Dashboard, Invoices, AI Insights, Audit, and Settings screens currently render preview and seed data while their live data bindings are finalized.

### Static & Test Fixtures
- Synthetic FIRA test statements (`fixtures/synthetic/*.pdf`) watermarked `SYNTHETIC - NOT A REAL DOCUMENT` with accompanying ground-truth verification JSON files for automated testing.

### Planned Features
- [ ] Asynchronous background job worker for PayPal webhook processing to resolve transaction timeouts.
- [ ] Automated scheduled polling for PayPal transaction reporting.
- [ ] OCR fallback pipeline for scanned/photocopied FIRA certificates.
- [ ] Multi-tenant authentication and user access management.
- [ ] Direct export bridges for Indian accounting software (Zoho Books, Tally, QuickBooks).

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 React 19 + TypeScript SPA                   │
│          (Vercel: https://edflowfinal.vercel.app)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FastAPI Application Server                  │
│       (Render: https://edflow-backend.onrender.com)         │
├─────────────────────────────────────────────────────────────┤
│  Endpoints:                                                 │
│  • /invoices, /ledger, /payments/sync                       │
│  • /fira/documents                                          │
│  • /matches, /matches/run                                   │
│  • /exceptions, /exceptions/derive                          │
│  • /purpose-recommendations, /purpose-adviser/run            │
│  • /edf-packs, /edf-packs/generate, /export                 │
│  • /audit, /healthz, /                                      │
├──────────────────────────────┬──────────────────────────────┤
│  Business & Rule Logic       │  External Services:          │
│  • Decimal Money Types       │  • PayPal Invoicing v2       │
│  • rules/india_export.yaml   │  • PayPal Orders v2          │
│  • pdfplumber FIRA Parser    │  • Frankfurter FX API        │
│  • Tamper-Evident Hash Chain │  • Gemini AI (Optional)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database on Render                  │
│            (SQLite fallback for local testing)              │
└─────────────────────────────────────────────────────────────┘
```

---

## PayPal Integration Architecture

EDFlow integrates with PayPal's Sandbox API environment (`https://api-m.sandbox.paypal.com`):

1. **Invoicing v2**:
   - `POST /invoices/{id}/send` generates a draft and dispatches a compliant export invoice directly to client emails with designated payment terms.
2. **Orders v2 (Immediate Payment & Capture)**:
   - `POST /invoices/{id}/pay-link` creates a checkout order.
   - `GET /payments/return` executes server-side order capture once the buyer authorizes the transaction. This reliably captures the PayPal fee breakdown and net remittance amount.
3. **Reconciliation & Polling (`POST /payments/sync`)**:
   - Acts as a fallback for delayed webhooks or batched transactions. Polling iterates through uncollected invoices and queries PayPal's capture details, updating invoice status to `PAID`.
4. **Webhook Security**:
   - Incoming webhooks (`POST /webhooks/paypal`) are validated against PayPal's signature verification endpoint. Webhook verification is never bypassed in production.
5. **Idempotency**:
   - Outgoing mutation calls inject unique `PayPal-Request-Id` headers to prevent duplicate billing or capture.
6. **Cross-Border Restriction**:
   - In accordance with PayPal Sandbox behavior, test transactions require non-Indian sandbox buyer accounts (domestic INR-to-INR checkouts fail).

---

## AI Architecture & Human-in-the-Loop Model

EDFlow adheres to a strict trust model: **AI proposes, code decides, human approves**.

- **Disabled by Default**: AI features are turned off by default (`AI_ENABLED=false`, `AI_MODE=off`). No remote LLM provider is invoked without explicit configuration.
- **Strictly Advisory**: An LLM is never permitted to execute payments, alter financial ledger amounts, dispatch invoices, or change reconciliation statuses.
- **PII Sanitization**: Before any text payload is evaluated by a model, `app/ai/pii.py` redacts names, email addresses, tax IDs (PAN/GSTIN), and account numbers.
- **Deterministic Validation**: All model outputs must conform to strict Pydantic schemas and pass deterministic rule assertions before being presented as human-reviewable proposals.
- **Offline Fixture Replay**: Includes an offline record/replay cache (`fixtures/ai`) ensuring local testing and deterministic builds require zero live network calls.

---

## API Endpoints Reference

The backend provides a RESTful interface documented via interactive Swagger UI at [https://edflow-backend.onrender.com/docs](https://edflow-backend.onrender.com/docs):

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | API status and root verification |
| `GET` | `/healthz` | Health check endpoint for uptime monitoring |
| `GET`, `PUT` | `/exporter` | Retrieve or configure Indian exporter company profile |
| `GET` | `/audit` | Verify hash chain integrity and view audit events |
| `GET`, `POST` | `/invoices` | List invoices or create a new export invoice |
| `GET` | `/invoices/{id}` | Retrieve specific invoice with calculated realization deadlines |
| `POST` | `/invoices/{id}/send` | Create and send invoice via PayPal Invoicing v2 |
| `POST` | `/invoices/{id}/pay-link` | Generate PayPal Orders v2 checkout approval link |
| `POST` | `/payments/sync` | Poll and record captured PayPal payments |
| `GET` | `/ledger` | View consolidated payment and fee ledger |
| `GET` | `/payments/{id}/true-cost` | Compute gateway fee and FX spread against mid-market rates |
| `POST`, `GET` | `/fira/documents` | Upload FIRA PDF statements or list ingested documents |
| `GET` | `/fira/documents/{id}` | Inspect extracted remittance lines and confidence levels |
| `GET`, `POST` | `/matches`, `/matches/run` | Query match records or trigger deterministic matching |
| `POST` | `/matches/{id}/confirm` | Confirm a proposed match between FIRA line and invoice |
| `GET` | `/exceptions`, `/exceptions/summary` | Query active compliance exceptions and severity breakdowns |
| `POST` | `/exceptions/derive` | Re-run deterministic exception identification engine |
| `POST` | `/exceptions/{id}/acknowledge` | Acknowledge a flagged exception |
| `POST` | `/exceptions/{id}/resolve` | Resolve a flagged exception with an audit note |
| `POST` | `/purpose-adviser/run` | Execute purpose code recommendation engine |
| `GET` | `/purpose-recommendations` | List purpose code recommendations |
| `POST` | `/purpose-recommendations/{id}/accept` | Accept purpose code recommendation (writes to invoice) |
| `GET`, `POST` | `/edf-packs`, `/edf-packs/generate` | List existing EDF packs or generate a monthly worksheet |
| `GET` | `/edf-packs/{id}` | View complete EDF pack and line items |
| `POST` | `/edf-packs/{id}/approve` | Freeze worksheet and compute cryptographic approval hash |
| `GET` | `/edf-packs/{id}/export` | Export approved worksheet as JSON or CSV |
| `GET` | `/rules` | View active regulatory limits and purpose code registry |
| `POST` | `/webhooks/paypal` | Ingest and verify PayPal asynchronous event webhooks |

---

## Local Development Installation

### Prerequisites
- Node.js (v18+) and npm
- Python (v3.11+)
- Git

### 1. Repository Setup
```bash
git clone https://github.com/Kriti-here/EDFlow.git
cd EDFlow
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements-dev.txt

# Copy example environment configuration
cp .env.example ../.env
```

Edit the newly created `.env` at the project root with your credentials:
```env
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
DATABASE_URL=sqlite:///./edflow.sqlite
CORS_ORIGINS=http://localhost:5173
```

Start the FastAPI application:
```bash
uvicorn app.main:app --reload --port 8000
```
- API root: `http://localhost:8000`
- Interactive Docs: `http://localhost:8000/docs`

Run backend tests:
```bash
python -m pytest tests/ -v
```

### 3. Frontend Setup
From the repository root in a separate terminal:
```bash
npm install
npm run dev
```
- Frontend application: `http://localhost:5173`

Run frontend unit tests:
```bash
npm test
```

---

## Production Deployment

Complete deployment procedures are documented in [`DEPLOY.md`](DEPLOY.md).

### Frontend &rarr; Vercel
1. Link your GitHub repository to Vercel.
2. Framework Preset: **Vite**.
3. Build Command: `npm run build` (`tsc -b && vite build`).
4. Output Directory: `dist`.
5. Environment Variable:
   - `VITE_API_BASE_URL`: `https://edflow-backend.onrender.com`
6. SPA URL rewrite routing is managed by [`vercel.json`](vercel.json).

### Backend &rarr; Render
1. Deploy as a Web Service using [`render.yaml`](render.yaml) Blueprint or manual configuration.
2. Root Directory: `backend`.
3. Runtime: `Python 3`.
4. Build Command: `pip install -r requirements-prod.txt`.
5. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
6. Health Check Path: `/healthz`.
7. Configure Environment Variables:
   - `DATABASE_URL`: Render PostgreSQL internal connection string.
   - `CORS_ORIGINS`: `https://edflowfinal.vercel.app` (no trailing slash).
   - `PUBLIC_BASE_URL`: `https://edflow-backend.onrender.com`
   - `FRONTEND_URL`: `https://edflowfinal.vercel.app`
   - `PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET`: PayPal Developer Sandbox keys.
   - `ALLOW_UNVERIFIED_WEBHOOKS`: `false`

---

**YouTube Demo:** [Watch EDFlow Demo] https://youtu.be/UNKUiep1z2k

## Repository Documentation Links

- [Export Compliance Rules](rules/india_export.yaml) — Dynamic limits, purpose codes, and realization deadlines.
- [EDF Form Fields Specification](docs/edf-fields.md) — Mapping guide for RBI EDF Sections 1, 2B, and 4.
- [Full Deployment Guide](DEPLOY.md) — Step-by-step production configuration for Render and Vercel.

---

## License & Author

- **Author**: [Kriti-here](https://github.com/Kriti-here)
- **License**: Released under the [MIT License](LICENSE).
