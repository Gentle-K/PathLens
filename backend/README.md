# Backend MVP for HashKey Chain RWA

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

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
   - `HASHKEY_TESTNET_CHAIN_ID`
   - `HASHKEY_TESTNET_RPC_URL`
   - `HASHKEY_TESTNET_EXPLORER_URL`
   - `HASHKEY_MAINNET_CHAIN_ID`
   - `HASHKEY_MAINNET_RPC_URL`
   - `HASHKEY_MAINNET_EXPLORER_URL`
   - `PLAN_REGISTRY_ADDRESS`
   - `KYC_SBT_ADDRESS`
7. When using Brave Search, fill at least:
   - `SEARCH_ADAPTER=brave`
   - `SEARCH_API_KEY`

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

## Current scope

- FastAPI backend for the Genius Actuary RWA decision engine
- Python orchestrator main loop
- Switchable analysis adapter: `mock` or OpenAI-compatible chat completions API
- Switchable search adapter: `mock` or Brave Search API
- Local calculation MCP can evaluate deterministic formulas from AI-planned tasks
- Structured chart MCP can turn completed calculation tasks into frontend-ready chart specs
- Built-in HashKey Chain asset library, RiskVector scoring, holding-period simulation, tx draft, and attestation draft
- Frontend-facing session APIs with stable response contracts
- Cookie-based anonymous client isolation for web sessions
- SQLite-based session persistence

## Clarification contract

- Every clarification question must support custom user input.
- `allow_custom_input` should be treated as a required product invariant, not an optional model preference.
- Preset options are there to speed up answering, but they must never prevent the user from supplying free-form context.
- If a model response or mock payload marks a question as not allowing custom input, backend code should normalize it back to allowed behavior before it reaches the UI.

## Storage

- Default database path: `backend/data/genius_actuary.db`
- Current implementation stores the full session as JSON and keeps key columns indexed in SQLite.
- This keeps the orchestrator stable now and leaves room to normalize tables later.

## Key routes

- `GET /health`
- `GET /api/frontend/bootstrap`
- `POST /api/sessions`
- `GET /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/step`
