# HashKey RWA JS SDK

Minimal read-only SDK for the proof layer.

Current surface:

- `getAssetProof(assetId, { network })`
- `getAssetReadiness(assetId, params)`
- `getPortfolio(address, { network })`

Example:

```ts
import { createHashKeyRwaClient } from './src/index'

const client = createHashKeyRwaClient({
  baseUrl: 'http://localhost:8000',
})

const proof = await client.getAssetProof('hsk-usdt', { network: 'testnet' })
console.log(proof.latest_proof.snapshot_hash)
```
