# HashKey Verifiable RWA Hub API

This document captures the stable read-only proof layer exposed by the backend.

## Base URL

Local:

```text
http://localhost:8000
```

## 1. Asset Proof

`GET /api/rwa/assets/{asset_id}/proof`

Purpose:

- return the latest proof snapshot
- expose the current onchain anchor status
- provide a short proof timeline preview for UI surfaces

Example:

```bash
curl "http://localhost:8000/api/rwa/assets/hsk-usdt/proof?network=testnet"
```

Important response fields:

- `latest_proof.snapshot_hash`
- `latest_proof.proof_freshness`
- `latest_proof.execution_readiness`
- `latest_proof.visibility_role`
- `onchain_anchor_status.status`
- `proof_timeline_preview`

## 2. Asset Proof History

`GET /api/rwa/assets/{asset_id}/proof/history`

Purpose:

- return the persisted proof timeline for the asset
- show historical snapshot hashes, effective timestamps, publish state, and anchor state

Example:

```bash
curl "http://localhost:8000/api/rwa/assets/hsk-usdt/proof/history?network=testnet"
```

## 3. Asset Readiness

`GET /api/rwa/assets/{asset_id}/readiness`

Purpose:

- combine proof, eligibility, and route readiness into a single execution-facing answer

Useful query params:

- `address`
- `session_id`
- `network`
- `amount`
- `source_asset`
- `source_chain`

Example:

```bash
curl "http://localhost:8000/api/rwa/assets/cpic-estable-mmf/readiness?network=testnet&amount=10000&address=0x1234"
```

Important response fields:

- `execution_adapter_kind`
- `execution_readiness`
- `route_summary`
- `required_approvals`
- `possible_failure_reasons`
- `compliance_blockers`

## 4. Indexed Anchor History

`GET /api/rwa/assets/{asset_id}/proof/anchor-history`

Purpose:

- return the indexer-backed onchain proof anchor timeline for one asset
- separate chain-confirmed history from local proof repository history

Example:

```bash
curl "http://localhost:8000/api/rwa/assets/hsk-usdt/proof/anchor-history?network=testnet"
```

## 5. Indexed Plan History

`GET /api/rwa/assets/{asset_id}/plan-history`

Purpose:

- return indexer-backed `PlanRegistry` history for one asset

Example:

```bash
curl "http://localhost:8000/api/rwa/assets/hsk-usdt/plan-history?network=testnet"
```

## 6. Indexer Status

`GET /api/rwa/indexer/status`

Purpose:

- inspect per-network sync status for `AssetProofRegistry` and `PlanRegistry`
- expose `last_indexed_block`, `last_safe_head`, `lag`, `status`, and `last_error`

Example:

```bash
curl "http://localhost:8000/api/rwa/indexer/status"
```

## 7. Portfolio

`GET /api/rwa/portfolio/{address}`

Purpose:

- return live position snapshots, proof snapshots, and event-driven alerts

Example:

```bash
curl "http://localhost:8000/api/rwa/portfolio/0x1234?network=testnet"
```

Important response fields:

- `positions`
- `proof_snapshots`
- `alerts`
- `indexer_health`
- `latest_anchor_summary`
- `total_value_usd`
- `total_unrealized_pnl`
- `total_realized_income`
- `total_accrued_yield`
- `total_redemption_forecast`
- `allocation_mix`

## 8. Alert Ack / Read

`POST /api/rwa/portfolio/{address}/alerts/{alert_id}/ack`

`POST /api/rwa/portfolio/{address}/alerts/{alert_id}/read`

Purpose:

- persist operator acknowledgement state for event-driven alerts

## 9. Execution Receipts

`GET /api/rwa/execution/receipts/{receipt_id}`

`GET /api/rwa/execution/receipts?session_id={session_id}`

Purpose:

- inspect the execution receipt store for direct contract and issuer workflows

Important response fields:

- `receipt.status`
- `receipt.settlement_status`
- `receipt.prepared_payload`
- `receipt.submit_payload`
- `receipt.redirect_url`
- `receipt.external_request_id`

## SDK

Minimal SDK entrypoint:

```ts
import { createHashKeyRwaClient } from '../../sdk/js/src/index'

const client = createHashKeyRwaClient({
  baseUrl: 'http://localhost:8000',
})

const proof = await client.getAssetProof('hsk-usdt', { network: 'testnet' })
```

## Proof Card Embed

See [proof-card-embed.html](proof-card-embed.html).

## Debug Ops

Protected operator routes live under `/api/debug/rwa/*` and the UI shell is exposed at `/debug/rwa-ops`.
These endpoints are not part of the public proof-layer contract, but they are the operational entrypoints for:

- refreshing live proofs
- retrying failed publishes
- manually publishing one snapshot
- re-syncing execution receipts
- running the repo-local indexer
