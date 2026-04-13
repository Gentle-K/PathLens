import type {
  AssetProofResponse,
  AssetReadinessResponse,
  PortfolioResponse,
} from './types'

export type HashKeyRwaFetch = typeof fetch

export interface HashKeyRwaClientOptions {
  baseUrl: string
  fetch?: HashKeyRwaFetch
}

export interface ReadinessParams {
  address?: string
  sessionId?: string
  network?: string
  amount?: number
  sourceAsset?: string
  sourceChain?: string
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return
    query.set(key, String(value))
  })
  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export function createHashKeyRwaClient(options: HashKeyRwaClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const request =
    options.fetch ??
    (typeof fetch === 'function'
      ? fetch.bind(globalThis)
      : undefined)

  if (!request) {
    throw new Error('A fetch implementation is required to create the HashKey RWA client.')
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await request(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HashKey RWA request failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as T
  }

  return {
    getAssetProof(assetId: string, options: { network?: string } = {}) {
      return getJson<AssetProofResponse>(
        `/api/rwa/assets/${encodeURIComponent(assetId)}/proof${toQuery({
          network: options.network,
        })}`,
      )
    },

    getAssetReadiness(assetId: string, params: ReadinessParams = {}) {
      return getJson<AssetReadinessResponse>(
        `/api/rwa/assets/${encodeURIComponent(assetId)}/readiness${toQuery({
          address: params.address,
          session_id: params.sessionId,
          network: params.network,
          amount: params.amount,
          source_asset: params.sourceAsset,
          source_chain: params.sourceChain,
        })}`,
      )
    },

    getPortfolio(address: string, options: { network?: string } = {}) {
      return getJson<PortfolioResponse>(
        `/api/rwa/portfolio/${encodeURIComponent(address)}${toQuery({
          network: options.network,
        })}`,
      )
    },
  }
}

export type {
  AssetProofHistoryItem,
  AssetProofResponse,
  AssetProofSnapshot,
  AssetReadinessResponse,
  OnchainAnchorStatus,
  PortfolioAlert,
  PortfolioResponse,
  PositionSnapshot,
  ProofFreshnessState,
  RedemptionWindow,
  SourceRef,
} from './types'
