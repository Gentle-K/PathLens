# Backend MVP for HashKey Chain RWA

This backend now acts as the proof, readiness, execution-planning, and monitoring layer for the HashKey RWA hub. In addition to analysis and report generation, it exposes asset proof snapshots, wallet-aware readiness checks, and portfolio alert endpoints.

## Run

```bash
cd backend
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Cross-platform verification from the repository root:

```bash
node scripts/run_python.mjs scripts/run_backend_tests.py all
node scripts/run_python.mjs scripts/test_smoke.py
```

Current lifecycle contract:

- analysis sessions stop at `READY_FOR_EXECUTION` once a report and execution context are ready
- they do not auto-transition to `COMPLETED` before an actual execution outcome is recorded
- when `PlanRegistry` is not configured, `attestation_draft.ready` stays `false` and no explorer URL is emitted

## Environment

1. Put local secrets and chain addresses in the repository-root `.env.local`
2. Keep `.env.local` local only. The repository now ignores it.
3. For another machine, copy `.env.local.example` to `.env.local` and fill the secret values.
4. Set `ANALYSIS_ADAPTER=mock` for local contract testing, or `ANALYSIS_ADAPTER=openai_compatible` for a real model API
5. When using a real model API, fill at least:
   - `ANALYSIS_PROVIDER`
   - `ANALYSIS_REGION`
   - `ANALYSIS_API_BASE_URL`
   - `ANALYSIS_API_KEY`
   - `ANALYSIS_MODEL`
6. HashKey Chain defaults are now configurable through:
   - `HASHKEY_INDEXER_FINALITY_BUFFER`
   - `HASHKEY_TESTNET_CHAIN_ID`
   - `HASHKEY_TESTNET_RPC_URL`
   - `HASHKEY_TESTNET_EXPLORER_URL`
   - `HASHKEY_TESTNET_ASSET_PROOF_REGISTRY_ADDRESS`
   - `HASHKEY_MAINNET_CHAIN_ID`
   - `HASHKEY_MAINNET_RPC_URL`
   - `HASHKEY_MAINNET_EXPLORER_URL`
   - `HASHKEY_MAINNET_ASSET_PROOF_REGISTRY_ADDRESS`
   - `PLAN_REGISTRY_ADDRESS`
   - `KYC_SBT_ADDRESS`
   - `ASSET_PROOF_REGISTRY_ADDRESS`
7. When using Brave Search, fill at least:
   - `SEARCH_ADAPTER=brave`
   - `SEARCH_API_KEY`
8. To enable the RWA actuary expert route, fill:
   - `ACTUARY_EXPERT_MODE`
   - `ACTUARY_STUDENT_MODEL_PATH`
   - `ACTUARY_TEACHER_PROVIDER`
   - `ACTUARY_DATA_REFRESH_PROFILE`
   - `ACTUARY_EVAL_SET_VERSION`

Example:

```bash
ANALYSIS_ADAPTER=openai_compatible
ANALYSIS_PROVIDER=openai-compatible
ANALYSIS_REGION=global
ANALYSIS_API_BASE_URL=https://api.openai.com/v1
ANALYSIS_API_KEY=your_api_key
ANALYSIS_MODEL=glm-5.1
SEARCH_ADAPTER=brave
SEARCH_API_BASE_URL=https://api.search.brave.com/res/v1/web/search
SEARCH_API_KEY=your_brave_key
CHART_ADAPTER=structured
CALCULATION_MCP_ENABLED=true
HASHKEY_TESTNET_CHAIN_ID=133
HASHKEY_TESTNET_RPC_URL=https://testnet.hsk.xyz
HASHKEY_MAINNET_CHAIN_ID=177
HASHKEY_MAINNET_RPC_URL=https://mainnet.hsk.xyz
ACTUARY_EXPERT_MODE=shadow
ACTUARY_STUDENT_MODEL_PATH=training/config/student_manifest.example.json
ACTUARY_TEACHER_PROVIDER=openai
```

MiniMax notes:

- Official OpenAI-compatible global endpoint: `https://api.minimax.io/v1`
- Official China endpoint used in domestic examples: `https://api.minimaxi.com/v1`
- The backend keeps provider, region, base URL, and model separate so you can switch models or gateways without touching code

Brave Search notes:

- Web search endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth header: `X-Subscription-Token`
- Search adapter output is mapped into backend `EvidenceItem` records so the frontend contract stays unchanged

Debug console notes:

- Protected debug APIs live under `/api/debug/*`
- Debug credentials come from `DEBUG_USERNAME` and `DEBUG_PASSWORD` in the repository-root `.env.local`
- The regular user UI and the debug UI are intentionally split so audit logs are no longer embedded in the main frontend experience
- RWA operator actions and health views now live under `/api/debug/rwa/*` and the frontend route `/debug/rwa-ops`
- The repo-local indexer writes `AssetProofRegistry` / `PlanRegistry` event history into SQLite-backed read models

## Current scope

- FastAPI backend for the Genius Actuary RWA decision engine
- Python orchestrator main loop
- Switchable analysis adapter: `mock` or OpenAI-compatible chat completions API
- Optional `RwaActuarialExpertAdapter` wrapper that routes RWA sessions through the student-manifest path while keeping deterministic rules authoritative
- Switchable search adapter: `mock` or Brave Search API
- Local calculation MCP can evaluate deterministic formulas from AI-planned tasks
- Structured chart MCP can turn completed calculation tasks into frontend-ready chart specs
- Built-in HashKey Chain asset library, RiskVector scoring, holding-period simulation, tx draft, and attestation draft
- Report enrichment for `confidence_band`, `stress_scenarios`, `reserve_backing_summary`, `oracle_stress_score`, and `source_provenance_refs`
- Frontend-facing session APIs with stable response contracts
- Cookie-based anonymous client isolation for web sessions
- SQLite-based session persistence

## Training assets

- Shared source registry: `training/sources/public_sources.json`
- ETL target directory: `training/artifacts/public/`
- Supervised sample extraction: `python training/scripts/extract_supervised_samples.py`
- Synthetic case generation: `python training/scripts/generate_synthetic_cases.py`
- Offline evaluation summary: `python training/scripts/evaluate_predictions.py`

## Clarification contract

- Every clarification question must support custom user input.
- `allow_custom_input` should be treated as a required product invariant, not an optional model preference.
- Preset options are there to speed up answering, but they must never prevent the user from supplying free-form context.
- If a model response or mock payload marks a question as not allowing custom input, backend code should normalize it back to allowed behavior before it reaches the UI.

## Storage

- Default database path: `backend/data/genius_actuary.db`
- Current implementation stores the full session as JSON and keeps key columns indexed in SQLite.
- This keeps the orchestrator stable now and leaves room to normalize tables later.
- The repository ignores local SQLite files; treat the database as runtime state, not as committed source.

## Key routes

- `GET /health`
- `GET /api/frontend/bootstrap`
- `POST /api/sessions`
- `GET /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/step`
- `GET /api/rwa/assets/{asset_id}/proof`
- `GET /api/rwa/assets/{asset_id}/proof/anchor-history`
- `GET /api/rwa/assets/{asset_id}/readiness`
- `GET /api/rwa/assets/{asset_id}/plan-history`
- `GET /api/rwa/indexer/status`
- `POST /api/rwa/execute/prepare`
- `POST /api/rwa/execute/submit`
- `GET /api/rwa/portfolio/{address}`
- `GET /api/rwa/portfolio/{address}/alerts`
- `GET /api/debug/rwa/ops/summary`
- `GET /api/debug/rwa/jobs`
- `POST /api/debug/rwa/proofs/refresh`
- `POST /api/debug/rwa/proofs/publish/retry`
- `POST /api/debug/rwa/proofs/{snapshot_id}/publish`
- `POST /api/debug/rwa/execution/status-sync`
- `POST /api/debug/rwa/indexer/run`
