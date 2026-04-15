# Test Summary

## Scope
- Backend unit, integration, contract, and resilience suites
- Frontend lint, build, unit, and end-to-end validation
- Deterministic mock/demo coverage for every visible product route
- Backend-backed smoke coverage for the `READY_FOR_EXECUTION` handoff

## Result Counts
- Backend: 148 passed, 0 failed, 0 errors, 0 skipped
- Frontend unit: 57 passed, 0 failed, 0 skipped
- Frontend E2E: 11 passed, 0 failed, 0 skipped

## Commands Verified On 2026-04-15
- `node scripts/run_python.mjs scripts/run_backend_tests.py all`
- `npm run test:backend`
- `npm run test:smoke`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `npm --prefix frontend run test:unit`
- `npm --prefix frontend run test:e2e`

## Coverage Highlights
- Backend: orchestrator lifecycle, adapter resilience, API contracts, persistence, KYC/oracle services, and RWA scoring
- Frontend unit: analysis pages, report rendering, adapter mapping, and local fallback behavior
- Frontend E2E: deterministic decision flows, full visible-route smoke coverage, redirect aliases, and the REST-backed execution path

## Demo Assurance
- Official judging mode is `mock/demo`, which now renders every visible route without empty shells or broken handoffs
- A separate REST-backed path verifies `seed-ready-session -> report -> execute -> receipt -> anchor -> portfolio`
- The backend smoke flow now correctly ends at `READY_FOR_EXECUTION`, matching the runtime contract

## Repository Hygiene
- Coverage reports, local SQLite files, screenshots, zip bundles, and Python cache artifacts are treated as generated output and are no longer committed
- Coverage can still be regenerated locally with `npm run test:all` or `npm run test:coverage` when needed

## Residual Manual Checks
- Wallet injection, network switching, and live onchain attestations still require operator-controlled manual validation against a real wallet and deployed contracts
- Those checks are outside the deterministic competition demo path and should stay in the release checklist
