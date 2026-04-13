export interface SourceRef {
  ref_id: string
  title: string
  source_name: string
  source_url: string
  source_kind?: string
  source_tier?: string
  freshness_date?: string
  summary?: string
  status?: string
  unavailable_reason?: string
  is_primary?: boolean
  confidence?: number
}

export interface ProofFreshnessState {
  bucket: string
  label: string
  checked_at: string
  stale_after_hours: number
  age_hours?: number
  reason?: string
}

export interface RedemptionWindow {
  label: string
  window_type: string
  settlement_days: number
  detail?: string
  next_window?: string
  status: string
}

export interface OnchainAnchorStatus {
  status: string
  proof_key?: string
  registry_address?: string
  transaction_hash?: string
  block_number?: number
  explorer_url?: string
  recorded_at?: string
  attester?: string
  note?: string
}

export interface AssetProofHistoryItem {
  snapshot_id: string
  asset_id: string
  network: string
  snapshot_hash: string
  snapshot_uri: string
  proof_type: string
  effective_at: string
  published_at?: string
  timeline_version: number
  attester: string
  publish_status: string
  onchain_anchor_status: OnchainAnchorStatus
  oracle_freshness?: string
  kyc_policy_summary?: string
  source_confidence?: number
  unavailable_reasons: string[]
}

export interface AssetProofSnapshot {
  snapshot_id?: string
  asset_id: string
  asset_name: string
  asset_symbol: string
  network: string
  live_asset: boolean
  included_in_registry: boolean
  snapshot_hash: string
  snapshot_uri: string
  proof_type: string
  effective_at: string
  published_at?: string
  attester: string
  registry_address?: string
  registry_explorer_url?: string
  anchor_status: OnchainAnchorStatus
  timeline_version: number
  publish_status: string
  onchain_proof_key?: string
  execution_adapter_kind: string
  execution_readiness: string
  truth_level: string
  live_readiness: string
  required_kyc_level?: number
  proof_freshness: ProofFreshnessState
  oracle_freshness?: string
  kyc_policy_summary?: string
  source_confidence?: number
  redemption_window: RedemptionWindow
  status_cards: Array<{ key: string; label: string; status: string; detail: string }>
  proof_source_refs: SourceRef[]
  unavailable_reasons: string[]
  monitoring_notes: string[]
  primary_action_url?: string
  visibility_role?: string
  is_executable: boolean
}

export interface AssetProofResponse {
  asset: Record<string, unknown>
  proof: AssetProofSnapshot
  latest_proof: AssetProofSnapshot
  onchain_anchor_status: OnchainAnchorStatus
  proof_timeline_preview: AssetProofHistoryItem[]
}

export interface AssetReadinessResponse {
  asset: Record<string, unknown>
  proof: AssetProofSnapshot
  decision: {
    decision_id: string
    asset_id: string
    status: string
    reasons: string[]
    missing_requirements: string[]
    next_actions: string[]
    checked_at: string
  }
  execution_adapter_kind: string
  execution_readiness: string
  route_summary: string
  quote?: Record<string, unknown>
  required_approvals: Array<Record<string, unknown>>
  possible_failure_reasons: string[]
  compliance_blockers: string[]
  warnings: string[]
}

export interface PortfolioAlert {
  alert_id: string
  address?: string
  alert_type: string
  severity: string
  title: string
  detail: string
  asset_id?: string
  asset_name?: string
  source_url?: string
  source_ref?: string
  dedupe_key?: string
  status?: string
  acked?: boolean
  acknowledged_at?: string
  read?: boolean
  read_at?: string
  detected_at: string
  resolved_at?: string
}

export interface PositionSnapshot {
  snapshot_id: string
  asset_id: string
  asset_name: string
  current_balance: number
  latest_nav_or_price: number
  current_value: number
  cost_basis: number
  unrealized_pnl: number
  realized_income: number
  accrued_yield: number
  redemption_forecast: number
  allocation_weight_pct: number
  liquidity_risk?: string
  next_redemption_window?: string
  oracle_staleness_flag: boolean
  kyc_change_flag: boolean
  as_of: string
}

export interface PortfolioResponse {
  address: string
  network: string
  positions: PositionSnapshot[]
  proof_snapshots: AssetProofSnapshot[]
  alerts: PortfolioAlert[]
  total_value_usd: number
  total_cost_basis: number
  total_unrealized_pnl: number
  total_realized_income: number
  total_accrued_yield: number
  total_redemption_forecast: number
  allocation_mix: Record<string, number>
  last_sync_at: string
}
