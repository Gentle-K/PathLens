# Implementation Summary

## What was fixed

- Replaced the narrow heuristic RWA scoring path with an explainable two-layer model in `backend/app/rwa/risk_model.py` and `backend/app/rwa/engine.py`:
  - seven preserved risk dimensions
  - robust cross-asset normalization with winsorization
  - AHP prior weights by risk tolerance
  - CRITIC adjustment so assets do not collapse into near-identical scores
  - explicit `risk_breakdown` and `risk_data_quality` on each asset card
- Reworked allocation ranking to use risk-adjusted utility instead of the old `return - risk - fee` style heuristic.
- Fixed the history/result crash caused by formatting `USDT` as an ISO currency code.
- Added route-level error boundaries and recoverable result-page states so report/history failures no longer drop users into the default React Router crash screen.
- Cleaned the RWA calculation pipeline:
  - only validated deterministic calculations are user-visible
  - invalid free-text formulas are rejected before execution
  - duplicate tasks are merged by semantic signature instead of raw string equality
  - polluted historical sessions are sanitized on read instead of requiring destructive data rewrites
- Restored the non-RWA LLM retry path so existing planning/clarification regression tests still pass while RWA sessions remain deterministic.
- Tightened chart behavior to reduce label and legend overlap on long asset names.
- Compressed the shell UI:
  - sidebar defaults to a compact rail
  - topbar uses a lighter chrome with a three-dot expander
  - main content now uses the screen more aggressively instead of being boxed into the previous wide max width

## What was added

- Backend task hygiene module: `backend/app/services/calculation_tasks.py`
- Backend risk methodology module: `backend/app/rwa/risk_model.py`
- New typed report fields:
  - `AssetAnalysisCard.risk_breakdown`
  - `AssetAnalysisCard.risk_data_quality`
  - `CalculationTask.validation_state`
  - `CalculationTask.failure_reason`
  - `CalculationTask.user_visible`
  - `CalculationTask.semantic_signature`
  - `AnalysisReport.methodology_references`
- Frontend route error boundary: `frontend/src/app/route-error-boundary.tsx`
- Frontend token-format regression tests: `frontend/src/lib/utils/format.test.ts`
- New regression coverage for:
  - invalid calculation-task rejection
  - duplicate/polluted session cleanup
  - risk monotonicity under worse drawdown / lockup inputs
  - hidden calculations being excluded from report bundles

## What remains

- The frontend production build still emits large chunk-size warnings, especially for the report page. Runtime is fine, but further code-splitting would improve load performance.
- Live testnet writes still require a real deployed `PlanRegistry`, working RPC endpoints, and a funded wallet.
- Oracle and KYC availability still depend on real contract addresses and RPC health. The system now reports genuine unavailable/error states instead of simulating success.

## Limitations

- The explainable risk model is literature-backed and auditable, but it still operates on the current repository's available asset features rather than long institutional time series for every instrument.
- RWA sessions intentionally prefer deterministic planning/calculation templates; the optional LLM path is still used for narrative generation and for non-RWA sessions.
- Historical polluted sessions are sanitized at read time. Old raw task payloads are preserved for traceability rather than deleted in place.
