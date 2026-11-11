# EDFlow — Deployment Guide

## Stack

| Layer | Platform | Runtime |
|---|---|---|
| Frontend | Vercel | Vite + React SPA |
| Backend | Render Web Service | FastAPI + Uvicorn |
| Database | Render PostgreSQL | SQLAlchemy (auto-migrates on startup) |

---

## 1. Backend → Render

### Option A — render.yaml (recommended)

Push `render.yaml` to your repo, then in the Render dashboard:

**Dashboard → New → Blueprint** → connect your repo.

Render will create both the web service and the PostgreSQL database automatically.
After the first deploy, set the `DATABASE_URL` to the internal Postgres connection string Render provides.

### Option B — Manual

1. **New → Web Service** → connect repo
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements-prod.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/healthz`

2. **New → PostgreSQL** → create `edflow-db`
   - Copy the **Internal Database URL** into the web service's `DATABASE_URL` env var.

3. Set all env vars from `backend/.env.production.example`.

### Environment Variables (Render)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Render internal Postgres URL |
| `CORS_ORIGINS` | ✅ | Vercel frontend URL |
| `PUBLIC_BASE_URL` | ✅ | This Render service URL |
| `FRONTEND_URL` | ✅ | Vercel URL for redirects |
| `PAYPAL_CLIENT_ID` | ✅ | Sandbox credentials |
| `PAYPAL_CLIENT_SECRET` | ✅ | Sandbox credentials |
| `PAYPAL_WEBHOOK_ID` | ✅ | For webhook verification |
| `DEMO_ADMIN_KEY` | ✅ | Any strong random secret |
| `ALLOW_UNVERIFIED_WEBHOOKS` | — | Must stay `false` |
| `AI_ENABLED` | — | Default `false` |

> **Database migrations:** `init_db()` runs at startup and auto-creates all tables via SQLAlchemy `Base.metadata.create_all`. No separate migration step is needed for the initial deploy.

---

## 2. Frontend → Vercel

### Option A — Vercel CLI

```bash
npm install -g vercel
vercel --prod
```

### Option B — Vercel Dashboard

1. **New Project** → import your GitHub repo
2. **Framework Preset:** Other (or Vite)
3. **Build Command:** `npm run build`
4. **Output Directory:** `dist`
5. **Install Command:** `npm install`

### Environment Variables (Vercel)

Set in **Vercel Dashboard → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://edflow-api.onrender.com` (your Render URL) |

> `VITE_*` variables are inlined at build time. Set them before triggering a production build.

### SPA Routing

`vercel.json` at the repo root rewrites all routes to `index.html`, enabling client-side routing for `/invoices`, `/matching`, `/fira`, etc.

---

## 3. Local Development

```bash
# Frontend
npm install
npm run dev                        # http://localhost:5173

# Backend
cd backend
pip install -r requirements-dev.txt
cp .env.example ../.env            # edit with your sandbox credentials
uvicorn app.main:app --reload      # http://localhost:8000

# API docs available at: http://localhost:8000/docs
```

---

## 4. Deployment Checklist

- [ ] Render PostgreSQL created and `DATABASE_URL` set
- [ ] `CORS_ORIGINS` set to exact Vercel deployment URL
- [ ] `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` set
- [ ] `DEMO_ADMIN_KEY` set to a strong random value
- [ ] `VITE_API_BASE_URL` set in Vercel to Render backend URL
- [ ] First backend deploy succeeds → check `/healthz` returns `{"status":"ok"}`
- [ ] Frontend build succeeds with correct `VITE_API_BASE_URL`
- [ ] SPA routes (`/invoices`, `/fira`, etc.) return 200 on direct load

---

## 5. Post-Deploy Verification

```bash
# Health check
curl https://edflow-api.onrender.com/healthz

# FIRA documents (should return empty list, not 500)
curl https://edflow-api.onrender.com/fira/documents

# EDF packs
curl https://edflow-api.onrender.com/edf-packs/summary
```
