# Genius Actuary

Genius Actuary is a HashKey Chain RWA decision-and-execution layer built around a verifiable asset hub. The backend owns proof snapshots, readiness checks, oracle and KYC normalization, execution planning, and portfolio monitoring. The frontend exposes asset proof pages, wallet-aware readiness checks, execution flows, and portfolio alerts.

## Product loop

The product is now organized around four operator-facing surfaces:

- `proof`: latest proof snapshot, proof timeline, source refs, freshness, and onchain anchor status
- `readiness`: wallet-aware KYC and route checks that separate `direct_contract`, `issuer_portal`, and `view_only`
- `execution`: `prepare -> submit -> receipt -> status` with a persisted execution receipt store
- `monitoring`: event-driven portfolio alerts, allocation mix, PnL, accrued yield, and redemption forecasts

## What the product does

- structured RWA intake for capital, holding period, liquidity, risk tolerance, wallet, and KYC constraints
- backend-driven clarification and analysis sessions
- deterministic RWA scoring, comparison matrices, and holding-period simulations
- evidence-linked recommendation and report generation
- per-asset proof snapshots with `snapshot_hash`, disclosure sources, freshness, and redemption terms
- asset readiness views that separate `direct_contract`, `issuer_portal`, and `view_only` flows
- public read-only proof and portfolio APIs for embedding asset verification cards in other HashKey apps
- backend-owned HashKey oracle snapshots for `BTC/USD`, `USDT/USD`, and `USDC/USD`
- backend-owned HashKey KYC snapshot reads
- wallet connection and HashKey network switching in the frontend via `viem`
- plan attestation draft generation and real on-chain `PlanRegistry` writes on testnet
- separate `AssetProofRegistry` contract for future proof anchoring
- persisted proof timelines, execution receipts, issuer request tracking, and alert state in SQLite
- result pages with tx hash, explorer links, KYC/oracle/proof context, and execution path
- portfolio monitoring with proof freshness, issuer-workflow, and redemption-window alerts
- repo-local JS SDK and proof card embed example under `sdk/js/` and `docs/api/`

## Live assets vs demo assets

Live execution scope in the current repo:

- `hsk-usdt`
- `hsk-usdc`
- `cpic-estable-mmf`
- `hk-regulated-silver`

Strictly isolated from live submit:

- `tokenized-real-estate-demo` -> `demo_only`
- `hsk-wbtc-benchmark` -> `benchmark_only`

These two assets still render inside proof and comparison flows, but submit requests are blocked server-side and should never be presented as live-buyable assets.

## 3-minute demo path

Use this order during a review:

1. Open `/assets/{assetId}/proof` and show the latest proof, timeline, source refs, and anchor state.
2. Open `/sessions/{sessionId}/execute` and show the adapter split, checklist, submit payload, and receipt status.
3. Open `/portfolio/{address}` and show alert severity ordering, ack/read state, and redemption / yield monitoring.
4. Finish with the public proof-layer docs in [docs/api/rwa-proof-layer.md](docs/api/rwa-proof-layer.md) and the embed example in [proof-card-embed.html](docs/api/proof-card-embed.html).

## Competition demo runbook

Official demo mode for reviews and judging:

- frontend: `VITE_API_MODE=mock`
- backend: `ANALYSIS_ADAPTER=mock`
- goal: every visible route renders successfully with deterministic seeded data

Recommended startup order:

1. Start the backend from [backend/README.md](backend/README.md).
2. Start the frontend from [frontend/README.md](frontend/README.md).
3. Open `/login`, enter the demo workspace, and create a session from `/new-analysis`.
4. Walk the product shell in this order: `/assets` -> `/sessions` -> `/reports` -> `/portfolio` -> `/evidence` -> `/calculations` -> `/settings`.
5. Use the debug shell for operator views: `/debug/login`, `/debug/logs`, `/debug/sessions`, `/debug/admin/roles`, `/debug/rwa-ops`.

REST-backed proof path for the real backend loop:

1. Switch the frontend to `VITE_API_MODE=rest`.
2. Create a new session and let it reach `READY_FOR_EXECUTION`.
3. Open `/sessions/{sessionId}/execute` and confirm `prepare -> receipt -> anchor -> portfolio` is populated from live backend data.
4. Use `npm run test:smoke` as the release gate for this backend-backed flow.

## Repository layout

- `backend/` FastAPI API, session orchestration, proof/readiness services, RWA engine, persistence, KYC/oracle services
- `frontend/` React + TypeScript + Vite product UI
- `contracts/` `PlanRegistry` plus `AssetProofRegistry`
- `scripts/` deploy and verification entrypoints
- `AUDIT_REPORT.md` repository audit, broken-flow inventory, and priority order
- `IMPLEMENTATION_SUMMARY.md` delivered changes, remaining gaps, and limitations

## Requirements

- Python 3.13 recommended on Windows. The smoke/full runners will prefer Python 3.13 or 3.12 automatically when available.
- Node.js 20+ and npm
- An injected EVM wallet such as MetaMask for the live demo flow

## Environment setup

Copy the root example file and adjust values as needed:

```bash
cp .env.local.example .env.local
```

Important defaults in `.env.local.example`:

- `ANALYSIS_ADAPTER=mock` so the repo boots locally without an external model
- `HASHKEY_DEFAULT_EXECUTION_NETWORK=testnet`
- frontend points to the local backend through `VITE_PROXY_TARGET=http://127.0.0.1:8000`

Most important variables:

- `ANALYSIS_ADAPTER`
- `ANALYSIS_API_BASE_URL`
- `ANALYSIS_API_KEY`
- `ANALYSIS_MODEL`
- `ACTUARY_EXPERT_MODE`
- `ACTUARY_STUDENT_MODEL_PATH`
- `ACTUARY_TEACHER_PROVIDER`
- `ACTUARY_DATA_REFRESH_PROFILE`
- `ACTUARY_EVAL_SET_VERSION`
- `HASHKEY_DEFAULT_EXECUTION_NETWORK`
- `HASHKEY_INDEXER_FINALITY_BUFFER`
- `HASHKEY_TESTNET_RPC_URL`
- `HASHKEY_TESTNET_EXPLORER_URL`
- `HASHKEY_TESTNET_PLAN_REGISTRY_ADDRESS`
- `HASHKEY_TESTNET_KYC_SBT_ADDRESS`
- `HASHKEY_TESTNET_ASSET_PROOF_REGISTRY_ADDRESS`
- `HASHKEY_MAINNET_RPC_URL`
- `HASHKEY_MAINNET_EXPLORER_URL`
- `HASHKEY_MAINNET_PLAN_REGISTRY_ADDRESS`
- `HASHKEY_MAINNET_KYC_SBT_ADDRESS`
- `HASHKEY_MAINNET_ASSET_PROOF_REGISTRY_ADDRESS`
- `ASSET_PROOF_REGISTRY_ADDRESS`
- `VITE_API_MODE`
- `VITE_API_BASE_URL`
- `VITE_PROXY_TARGET`
- `PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY`
- `ASSET_PROOF_REGISTRY_DEPLOYER_PRIVATE_KEY`
- `ASSET_PROOF_REGISTRY_INITIAL_ATTESTER`

If the plan registry address is blank, the app still produces a deterministic attestation draft, keeps `ready=false`, and omits explorer links until a live contract is configured.
If the asset proof registry address is blank, proof pages still render deterministic snapshots, but they cannot point to a deployed registry address for later anchoring.

## Debug ops and indexer

- The protected ops console now lives at `/debug/rwa-ops`.
- Operator write actions are only exposed under `/api/debug/rwa/*` and use `DEBUG_USERNAME` / `DEBUG_PASSWORD`.
- The repo-local indexer writes `AssetProofRegistry` and `PlanRegistry` history into SQLite-backed read models.
- `HASHKEY_INDEXER_FINALITY_BUFFER` controls how many tip blocks the indexer leaves unconsumed before marking a head as safe. Default is `2`.
- Public proof and portfolio reads now prefer indexed chain state, then fall back to persisted proof / execution state if the indexer is not caught up.

## RWA actuary expert mode

The repo now ships a repo-local RWA actuary skill and a distilled-student scaffolding path.

- `training/sources/public_sources.json` is the shared provenance registry used by both backend report enrichment and the repo-local skill
- `training/features/rwa_feature_dictionary.json` defines the current feature groups exposed to the student pipeline
- `training/eval/gold_eval_cases.jsonl` is the seed eval set for clarify, plan, stress, score-explain, and report tasks
- `.codex/skills/actuary-rwa/` contains the repo-local skill that points back to the same registry and eval assets

Enable expert routing with:

- `ACTUARY_EXPERT_MODE=shadow`
- `ACTUARY_STUDENT_MODEL_PATH=training/config/student_manifest.example.json`

The current v1 adapter keeps KYC gating, minimum ticket checks, liquidity windows, fees, and risk monotonicity deterministic while enriching reports with confidence bands, stress scenarios, reserve-backing summaries, oracle stress scores, and source provenance references.

## Run the backend

```bash
cd backend
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

PowerShell alternative if `py -3.13` is unavailable:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

For operator review, open `http://localhost:5173/debug/rwa-ops` and authenticate with the debug credentials from `.env.local`.

## User guide

### Quick start for local users

1. Start the backend and frontend with the commands above.
2. Open `http://localhost:5173`.
3. Choose a demo scenario for a fixed walkthrough, or create a custom RWA session.
4. Fill in capital, holding period, liquidity need, risk tolerance, wallet, and KYC constraints.
5. Answer the clarification questions until the report page appears.
6. Review the report, then open the execution console if you want to record an attestation on HashKey testnet or mainnet.

### How to use the report page

- `Highlights`: the main recommendation, top metrics, and the current execution posture.
- `Actuarial Signals`: confidence band, oracle stress score, and reserve-backing summary layered on top of the deterministic RWA engine.
- `Source Provenance`: evidence anchors with source tier, freshness date, and direct links for manual verification.
- `Stress Scenarios`: baseline and adverse cases such as depeg, oracle deviation, reserve deterioration, or liquidity squeeze.
- `Comparison Matrix` and `Asset Cards`: side-by-side ranking, access blockers, risk decomposition, and fit summaries for each asset.
- `Wallet and Execution`: current wallet connection, network, live KYC snapshot, and attestation entrypoint.

### Recommended operating modes

- `Mock mode`: set `ANALYSIS_ADAPTER=mock` for local product testing without an external LLM.
- `Expert shadow mode`: set `ACTUARY_EXPERT_MODE=shadow` and point `ACTUARY_STUDENT_MODEL_PATH` to a student manifest to enrich RWA reports while keeping deterministic rules authoritative.
- `Demo mode`: use built-in scenarios when you want deterministic screenshots, testing, or onboarding.

### Training and refresh workflow

Use these when you want to refresh the actuarial corpus or train the student path:

```bash
python training/scripts/refresh_public_corpus.py
python training/scripts/extract_supervised_samples.py --db-path backend/data/genius_actuary.db
python training/scripts/generate_synthetic_cases.py --locale zh
python training/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output
```

The shared source registry lives in `training/sources/public_sources.json`, and the repo-local skill under `.codex/skills/actuary-rwa/` reads from the same assets.

### Troubleshooting

- If the report stops at clarification, answer every pending question before expecting the backend to continue.
- If live KYC or oracle data is unavailable, the report falls back to the latest deterministic snapshot instead of pretending the data exists.
- If `Plan Registry` is not configured, the app still generates an attestation draft but disables the live on-chain write.
- If expert mode is enabled but the student manifest path is missing or invalid, switch back to `ACTUARY_EXPERT_MODE=off` or fix `ACTUARY_STUDENT_MODEL_PATH`.
- If you are preparing training data, refresh the public corpus before extracting repo samples so provenance dates stay current.

## Main local flow

1. Start the backend.
2. Start the frontend.
3. Open the intake page and create an RWA session.
4. Answer clarifications until the report page is ready.
5. Review the report, evidence, allocations, live oracle snapshots, and KYC snapshot.
6. Open the execution console.
7. Connect an EVM wallet and switch to the target HashKey network.
8. Submit the on-chain attestation when a Plan Registry address is configured.
9. Return to the result page and verify the tx hash and explorer link.

## Testnet demo flow

### 1. Deploy the demo Plan Registry

```bash
cd frontend
npm run deploy:plan-registry
```

Expected env:

- `PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY`
- `HASHKEY_DEPLOY_NETWORK=testnet`

Copy the deployed contract address into:

- `HASHKEY_TESTNET_PLAN_REGISTRY_ADDRESS`

### 2. Deploy the demo Asset Proof Registry

```bash
cd frontend
npm run deploy:asset-proof-registry
```

Expected env:

- `ASSET_PROOF_REGISTRY_DEPLOYER_PRIVATE_KEY`
- `ASSET_PROOF_REGISTRY_INITIAL_ATTESTER` optional, grants a publisher wallet during deploy
- `HASHKEY_DEPLOY_NETWORK=testnet`

Copy the deployed contract address into:

- `HASHKEY_TESTNET_ASSET_PROOF_REGISTRY_ADDRESS`

Owner / attester initialization order:

1. Deploy `AssetProofRegistry`.
2. Keep the deployer as `owner`.
3. Optionally set `ASSET_PROOF_REGISTRY_INITIAL_ATTESTER` before deploy so the script grants a non-deployer publisher immediately.
4. Point the backend to `HASHKEY_TESTNET_ASSET_PROOF_REGISTRY_ADDRESS`.
5. Use `/debug/rwa-ops` to refresh proofs, retry publishes, and confirm indexed anchors match the registry.

### 3. Configure the KYC SBT and RPC endpoints

Set:

- `HASHKEY_TESTNET_RPC_URL`
- `HASHKEY_TESTNET_EXPLORER_URL`
- `HASHKEY_TESTNET_KYC_SBT_ADDRESS`

### 4. Run the product

Start backend and frontend, complete a session, then use the execution console to write the attestation transaction.

### 5. Verify the result

The result page should show:

- wallet/network context
- KYC snapshot
- live oracle snapshots
- proof registry address and proof freshness on asset proof pages
- attestation contract address
- tx hash
- explorer link

## Tests and verification

Release gate commands:

```bash
node scripts/run_python.mjs scripts/run_backend_tests.py all
npm run test:smoke
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:unit
npm --prefix frontend run test:e2e
```

Root convenience commands:

- `npm run test:backend`
- `npm run test:integration`
- `npm run test:smoke`
- `npm run test:e2e`

`frontend/package.json` also keeps `npm run test:contracts` for the repo-local EVM harness built on `@ethereumjs/vm`, but it is not part of the minimum competition release gate.

Training helpers:

```bash
python training/scripts/refresh_public_corpus.py
python training/scripts/extract_supervised_samples.py --db-path backend/data/genius_actuary.db
python training/scripts/generate_synthetic_cases.py --locale zh
python training/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output
```

## Verified in this repository

Validated in this repository on `2026-04-15`:

- `node scripts/run_python.mjs scripts/run_backend_tests.py all`
- `npm run test:backend`
- `npm run test:smoke`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `npm --prefix frontend run test:unit`
- `npm --prefix frontend run test:e2e`

Observed results:

- backend: `148 passed, 0 failed, 0 errors`
- frontend unit: `57 passed, 0 failed`
- frontend e2e: `11 passed, 0 failed`
- smoke flow: session completed the lifecycle `CLARIFYING -> ANALYZING -> READY_FOR_REPORT -> READY_FOR_EXECUTION`

## Notes

- The backend is the source of truth for normalized oracle data, KYC status, evidence tagging, explorer targets, and report inputs.
- The frontend no longer fakes attestation or tx success states.
- Testnet is the default execution network unless overridden through env.
