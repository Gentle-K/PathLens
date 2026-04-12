# Genius Actuary

Genius Actuary is an AI-powered HashKey Chain RWA decision-and-execution layer. The backend owns analysis, risk decomposition, oracle normalization, KYC reads, evidence records, report generation, and attestation metadata. The frontend handles intake, wallet connection, network switching, rendering, and transaction initiation.

## What the product does

- structured RWA intake for capital, holding period, liquidity, risk tolerance, wallet, and KYC constraints
- backend-driven clarification and analysis sessions
- deterministic RWA scoring, comparison matrices, and holding-period simulations
- evidence-linked recommendation and report generation
- backend-owned HashKey oracle snapshots for `BTC/USD`, `USDT/USD`, and `USDC/USD`
- backend-owned HashKey KYC snapshot reads
- wallet connection and HashKey network switching in the frontend via `viem`
- plan attestation draft generation and real on-chain Plan Registry writes on testnet
- result pages with tx hash, explorer links, KYC/oracle context, and execution path

## Repository layout

- `backend/` FastAPI API, session orchestration, RWA engine, persistence, KYC/oracle services
- `frontend/` React + TypeScript + Vite product UI
- `contracts/` minimal `PlanRegistry` contract
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
- `HASHKEY_TESTNET_RPC_URL`
- `HASHKEY_TESTNET_EXPLORER_URL`
- `HASHKEY_TESTNET_PLAN_REGISTRY_ADDRESS`
- `HASHKEY_TESTNET_KYC_SBT_ADDRESS`
- `HASHKEY_MAINNET_RPC_URL`
- `HASHKEY_MAINNET_EXPLORER_URL`
- `HASHKEY_MAINNET_PLAN_REGISTRY_ADDRESS`
- `HASHKEY_MAINNET_KYC_SBT_ADDRESS`
- `VITE_API_MODE`
- `VITE_API_BASE_URL`
- `VITE_PROXY_TARGET`
- `PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY`

If the plan registry address is blank, the app still produces a deterministic attestation draft but disables the live on-chain write.

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

### 2. Configure the KYC SBT and RPC endpoints

Set:

- `HASHKEY_TESTNET_RPC_URL`
- `HASHKEY_TESTNET_EXPLORER_URL`
- `HASHKEY_TESTNET_KYC_SBT_ADDRESS`

### 3. Run the product

Start backend and frontend, complete a session, then use the execution console to write the attestation transaction.

### 4. Verify the result

The result page should show:

- wallet/network context
- KYC snapshot
- live oracle snapshots
- attestation contract address
- tx hash
- explorer link

## Tests and verification

Cross-platform entrypoints:

- `python scripts/test_smoke.py`
- `python scripts/test_full.py`
- `powershell -ExecutionPolicy Bypass -File scripts/test_smoke.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/test_full.ps1`
- `./scripts/test_smoke.sh`
- `./scripts/test_full.sh`

Direct commands:

```bash
cd backend
python -m unittest discover -s tests

cd ../frontend
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Training helpers:

```bash
python training/scripts/refresh_public_corpus.py
python training/scripts/extract_supervised_samples.py --db-path backend/data/genius_actuary.db
python training/scripts/generate_synthetic_cases.py --locale zh
python training/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output
```

## Verified in this repository

The current codebase was verified with:

- `python -m unittest discover -s tests` in `backend/`
- `npm run lint` in `frontend/`
- `npm run test:unit` in `frontend/`
- `npm run build` in `frontend/`
- `npm run test:e2e` in `frontend/`
- `python scripts/test_smoke.py`
- `python scripts/test_full.py`

## Notes

- The backend is the source of truth for normalized oracle data, KYC status, evidence tagging, explorer targets, and report inputs.
- The frontend no longer fakes attestation or tx success states.
- Testnet is the default execution network unless overridden through env.
