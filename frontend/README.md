# Genius Actuary Frontend for HashKey Chain RWA

This `frontend/` directory contains the React + TypeScript + Vite front-end for Genius Actuary as a HashKey Chain RWA proof, execution, and monitoring hub. It keeps the black-gold Obsidian & Champagne Gold design system and connects to the local FastAPI backend under the repository-root `backend/` directory.

- React + TypeScript + Vite + Tailwind CSS v4
- TanStack Query for server state
- React Router for routing
- react-i18next for zh/en bilingual UI
- Formik + Yup for forms
- Apache ECharts via reusable chart factories
- TanStack Table-backed generic CRUD tables
- Zustand persist for auth, theme, locale, API mode, and shell state
- Mock + REST adapter switch
- WebSocket / SSE-ready realtime bridge
- CSV / PDF export, Dockerfile, and GitHub Actions CI

## What ships

- Dashboard with metrics, trends, recent analyses, and activity feed
- Asset hub with proof pages and wallet-aware readiness checks
- RWA intake flow: asset library, structured preferences, clarification, progress pipeline, final report
- RiskVector charts, holding-period simulation, evidence panel, tx draft, and attestation draft
- Portfolio page with proof freshness, issuer-workflow, and redemption alerts
- Settings, User Profile, Role Management, Notifications, Logs/Audit, File Manager, DataViz
- Resource Registry with generic list, detail, and form generators
- Black-gold design tokens shared across dark/light/system themes
- Golden Sand Convergence loader for high-value AI progress states

## Backend contract

The current backend is a FastAPI MVP with these live routes:

- `GET /health`
- `GET /api/frontend/bootstrap`
- `POST /api/sessions`
- `GET /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/step`

Important: I did **not** find a backend API key in the repository. The backend currently isolates web sessions with an HTTP-only cookie, so the frontend connects through base URL + browser credentials rather than Bearer auth.

Clarification UX rule:

- Every question in the clarification flow must expose a custom input path.
- Single-choice, multi-choice, slider, and numeric questions may offer fast presets, but they must still leave room for free-form user context.
- Frontend rendering should not hide custom input just because an upstream payload says otherwise; this is a product invariant.

## Quick start

```bash
cd backend
py -3.13 -m venv .venv313
.venv313\Scripts\python.exe -m pip install -r requirements.txt
.venv313\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Scripts

```bash
npm run dev
npm run lint
npm run test:run
npm run build
npm run preview
npm run deploy:plan-registry
npm run deploy:asset-proof-registry
```

## Environment variables

Use the repository-root `.env.local` as the preferred place for local environment variables. For another machine, start from `.env.local.example`.

- `VITE_API_MODE`: `mock` or `rest`
- `VITE_API_BASE_URL`: REST backend base URL. Leave empty in local dev to use the Vite proxy.
- `VITE_API_WITH_CREDENTIALS`: include browser credentials for the cookie-based backend
- `VITE_API_KEY`: optional future-proof API key header value if the backend adds one later
- `VITE_API_KEY_HEADER`: optional API key header name
- `VITE_PROXY_TARGET`: Vite dev proxy target for `/api` and `/health`
- `VITE_WS_PROXY_TARGET`: Vite dev proxy target for `/ws`
- `VITE_WS_URL`: direct websocket URL used in production mode
- `VITE_SSE_URL`: SSE fallback URL used in production mode

## Architecture

```text
src/
  app/                app shell, router, providers, error boundary
  components/         reusable UI, charts, layout, markdown, feedback
  features/           domain pages and modules
  lib/
    api/              typed client + mock/rest adapters
    export/           CSV/PDF helpers
    i18n/             translations and setup
    mock/             seeded mock database + realtime bus
    realtime/         websocket / SSE transport wrappers
    registry/         resource registry for generic CRUD pages
    store/            Zustand persisted workspace state
    theme/            theme resolver
    utils/            formatting, permissions, haptics, helpers
  styles/             Tailwind v4 tokens + global styles
  tests/              Vitest + Testing Library setup
  types/              shared domain and contract types
```

## Adapter strategy

The UI never owns orchestration logic. It talks to a typed adapter interface:

- `mock` mode uses an in-memory database and realtime event bus for demos/tests.
- `rest` mode now maps the real FastAPI backend session contract into the frontend domain model. Analysis flow is live against the backend; modules the backend does not expose yet still fall back to mock data so the product shell remains complete.
- Both adapters must preserve the product rule that all clarification questions support custom input.

This keeps the front-end stable while the real backend evolves.

Official competition demo mode:

- default to `VITE_API_MODE=mock` for full-route product demos
- keep `VITE_API_MODE=rest` for the backend-backed execution proof path only
- the route smoke suite covers login, creation, analysis, reports, execution, portfolio, evidence, calculations, settings, and debug surfaces

## Charts and design system

- All colors come from CSS variables and Tailwind v4 inline theme tokens.
- Numeric emphasis uses `JetBrains Mono`.
- ECharts options are generated through `src/components/charts/option-factories.ts`.
- Dark theme is the default; light/system remain available from the same token system.

## Docker

```bash
cd frontend
docker build -t genius-actuary-frontend .
docker run --rm -p 8080:80 genius-actuary-frontend
```

The image builds the app in Node and serves the static bundle through Nginx with SPA fallback.

## CI

GitHub Actions runs:

1. `cd frontend && npm ci`
2. `npm run lint`
3. `npm run test:run`
4. `node node_modules/vite/bin/vite.js build`

## Notes

- The repository root now contains both `backend/` and `frontend/`.
- The local backend smoke test is verified against the lifecycle `CLARIFYING -> ANALYZING -> READY_FOR_REPORT -> READY_FOR_EXECUTION`.
- `npm run build` passes in the current Windows validation path.
- `npm run lint`, `npm run test:unit`, and `npm run test:e2e` are part of the release gate for this repository.
