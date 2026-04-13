from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AssetType(str, Enum):
    STABLECOIN = "stablecoin"
    MMF = "mmf"
    PRECIOUS_METAL = "precious_metal"
    REAL_ESTATE = "real_estate"
    STOCKS = "stocks"
    BENCHMARK = "benchmark"


class DataSourceTag(str, Enum):
    ONCHAIN_VERIFIED = "onchain_verified"
    ORACLE_FED = "oracle_fed"
    ISSUER_DISCLOSED = "issuer_disclosed"
    THIRD_PARTY_SOURCE = "third_party_source"
    MODEL_INFERENCE = "model_inference"
    USER_ASSUMPTION = "user_assumption"


class AssetStatus(str, Enum):
    PRODUCTION = "production"
    VERIFIED = "verified"
    ISSUER_DISCLOSED = "issuer_disclosed"
    BENCHMARK = "benchmark"
    DEMO = "demo"
    EXPERIMENTAL = "experimental"


class TruthLevel(str, Enum):
    ONCHAIN_VERIFIED = "onchain_verified"
    ISSUER_DISCLOSED = "issuer_disclosed"
    BENCHMARK_REFERENCE = "benchmark_reference"
    DEMO_ONLY = "demo_only"


class LiveReadiness(str, Enum):
    READY = "ready"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"
    DEMO_ONLY = "demo_only"
    BENCHMARK_ONLY = "benchmark_only"


class ExecutionAdapterKind(str, Enum):
    DIRECT_CONTRACT = "direct_contract"
    ISSUER_PORTAL = "issuer_portal"
    VIEW_ONLY = "view_only"


class ExecutionReadiness(str, Enum):
    READY = "ready"
    REQUIRES_ISSUER = "requires_issuer"
    VIEW_ONLY = "view_only"
    BLOCKED = "blocked"


class ActionType(str, Enum):
    SUBSCRIBE = "subscribe"
    MINT = "mint"
    REDEEM = "redeem"
    HOLD = "hold"
    LEARN_MORE = "learn_more"
    EXTERNAL_ONLY = "external_only"


class ActionReadiness(str, Enum):
    READY = "ready"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"


class EvidenceFactType(str, Enum):
    ONCHAIN_VERIFIED_FACT = "onchain_verified_fact"
    OFFCHAIN_DISCLOSED_FACT = "offchain_disclosed_fact"
    ORACLE_FACT = "oracle_fact"
    THIRD_PARTY_FACT = "third_party_fact"
    INFERRED_FACT = "inferred_fact"


class EvidenceFreshnessBucket(str, Enum):
    FRESH = "fresh"
    AGING = "aging"
    STALE = "stale"
    UNDATED = "undated"


class RiskTolerance(str, Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class LiquidityNeed(str, Enum):
    INSTANT = "instant"
    T_PLUS_3 = "t_plus_3"
    LOCKED = "locked"


class KycStatus(str, Enum):
    NONE = "none"
    APPROVED = "approved"
    REVOKED = "revoked"
    UNAVAILABLE = "unavailable"


class EligibilityStatus(str, Enum):
    ELIGIBLE = "eligible"
    CONDITIONAL = "conditional"
    BLOCKED = "blocked"


class ExecutionLifecycleStatus(str, Enum):
    PREPARED = "prepared"
    SUBMITTED = "submitted"
    REDIRECT_REQUIRED = "redirect_required"
    PENDING_SETTLEMENT = "pending_settlement"
    COMPLETED = "completed"
    FAILED = "failed"

    @classmethod
    def _missing_(cls, value: object) -> "ExecutionLifecycleStatus" | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip().lower()
        aliases = {
            "not_ready": cls.PREPARED,
            "ready": cls.PREPARED,
            "simulated": cls.PREPARED,
            "bundle_ready": cls.PREPARED,
            "executing": cls.SUBMITTED,
            "monitoring": cls.COMPLETED,
        }
        return aliases.get(normalized)


class SettlementStatus(str, Enum):
    NOT_STARTED = "not_started"
    PENDING = "pending"
    DELAYED = "delayed"
    COMPLETED = "completed"
    FAILED = "failed"


class ProofPublishStatus(str, Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    RETRY = "retry"
    FAILED = "failed"
    SKIPPED = "skipped"


class AlertEventStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class HashKeyChainConfig(BaseModel):
    ecosystem_name: str = "HashKey Chain"
    native_token_symbol: str = "HSK"
    default_execution_network: str = "mainnet"
    testnet_chain_id: int = 133
    testnet_rpc_url: str = "https://testnet.hsk.xyz"
    testnet_explorer_url: str = "https://testnet-explorer.hsk.xyz"
    mainnet_chain_id: int = 177
    mainnet_rpc_url: str = "https://mainnet.hsk.xyz"
    mainnet_explorer_url: str = "https://hashkey.blockscout.com"
    plan_registry_address: str = ""
    kyc_sbt_address: str = ""
    asset_proof_registry_address: str = ""
    testnet_plan_registry_address: str = ""
    mainnet_plan_registry_address: str = ""
    testnet_kyc_sbt_address: str = ""
    mainnet_kyc_sbt_address: str = ""
    testnet_asset_proof_registry_address: str = ""
    mainnet_asset_proof_registry_address: str = ""
    docs_urls: list[str] = Field(default_factory=list)
    oracle_feeds: list["OracleFeedConfig"] = Field(default_factory=list)


class OracleFeedConfig(BaseModel):
    feed_id: str
    pair: str
    source_name: str = "APRO Oracle"
    docs_url: str = ""
    testnet_address: str = ""
    mainnet_address: str = ""
    decimals: int = 8


class MarketDataSnapshot(BaseModel):
    feed_id: str
    pair: str
    network: str
    source_name: str
    source_url: str
    feed_address: str
    explorer_url: str = ""
    price: float | None = None
    decimals: int = 8
    fetched_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime | None = None
    round_id: int | None = None
    note: str = ""
    status: str = "unavailable"


class RwaIntakeContext(BaseModel):
    investment_amount: float = 10000.0
    base_currency: str = "USDT"
    preferred_asset_ids: list[str] = Field(default_factory=list)
    holding_period_days: int = 30
    risk_tolerance: RiskTolerance = RiskTolerance.BALANCED
    liquidity_need: LiquidityNeed = LiquidityNeed.T_PLUS_3
    minimum_kyc_level: int = 0
    wallet_address: str = ""
    safe_address: str = ""
    wallet_network: str = ""
    wallet_kyc_level_onchain: int | None = None
    wallet_kyc_verified: bool | None = None
    kyc_level: int | None = None
    kyc_status: str = ""
    investor_type: str = ""
    jurisdiction: str = ""
    source_chain: str = ""
    source_asset: str = ""
    ticket_size: float | None = None
    liquidity_urgency: str = ""
    lockup_tolerance: str = ""
    target_yield: float | None = None
    max_drawdown_tolerance: float | None = None
    custody_preference: str = ""
    wants_onchain_attestation: bool = True
    additional_constraints: str = ""
    include_non_production_assets: bool = False
    demo_mode: bool = False
    demo_scenario_id: str = ""
    analysis_seed: int | None = None


class ActionLink(BaseModel):
    kind: str
    label: str
    url: str


class ActionBlocker(BaseModel):
    code: str
    label: str
    detail: str
    severity: str = "warning"


class ActionIntent(BaseModel):
    asset_id: str
    asset_name: str
    action_type: ActionType = ActionType.LEARN_MORE
    action_readiness: ActionReadiness = ActionReadiness.UNAVAILABLE
    summary: str = ""
    action_blockers: list[ActionBlocker] = Field(default_factory=list)
    action_links: list[ActionLink] = Field(default_factory=list)
    execution_notes: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)


class AssetTemplate(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_type: AssetType
    description: str
    issuer: str = ""
    custody: str = ""
    chain_id: int
    contract_address: str = ""
    protocol_name: str = ""
    permissioning_standard: str = ""
    required_kyc_level: int | None = None
    eligible_investor_types: list[str] = Field(default_factory=list)
    restricted_jurisdictions: list[str] = Field(default_factory=list)
    min_subscription_amount: float = 0.0
    redemption_window: str = ""
    settlement_asset: str = "USDT"
    oracle_provider: str = ""
    oracle_contract: str = ""
    last_oracle_timestamp: datetime | None = None
    nav_or_price: float | None = None
    indicative_yield: float | None = None
    reserve_summary: str = ""
    custody_summary: str = ""
    bridge_support: list[str] = Field(default_factory=list)
    proof_refs: list[str] = Field(default_factory=list)
    secondary_market_available: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    execution_style: str = "erc20"
    benchmark_apy: float = 0.0
    expected_return_low: float = 0.0
    expected_return_base: float = 0.0
    expected_return_high: float = 0.0
    price_volatility: float = 0.0
    max_drawdown_180d: float = 0.0
    avg_daily_volume_usd: float = 0.0
    redemption_days: int = 0
    lockup_days: int = 0
    management_fee_bps: int = 0
    entry_fee_bps: int = 0
    exit_fee_bps: int = 0
    slippage_bps: int = 0
    depeg_events_90d: int | None = None
    worst_depeg_bps_90d: int | None = None
    issuer_disclosure_score: float = 0.5
    custody_disclosure_score: float = 0.5
    audit_disclosure_score: float = 0.5
    contract_is_upgradeable: bool = False
    has_admin_key: bool = False
    oracle_count: int = 1
    oracle_sources: list[str] = Field(default_factory=list)
    requires_kyc_level: int | None = None
    minimum_ticket_usd: float = 0.0
    tags: list[str] = Field(default_factory=list)
    thesis: str = ""
    fit_summary: str = ""
    evidence_urls: list[str] = Field(default_factory=list)
    primary_source_url: str = ""
    onchain_verified: bool = False
    issuer_disclosed: bool = False
    featured: bool = False
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    status_explanation: str = ""
    truth_level_explanation: str = ""
    action_type: ActionType = ActionType.LEARN_MORE
    action_readiness: ActionReadiness = ActionReadiness.UNAVAILABLE
    action_links: list[ActionLink] = Field(default_factory=list)
    action_blocker_reasons: list[str] = Field(default_factory=list)
    execution_notes: list[str] = Field(default_factory=list)
    # ERC-3643 compliance reference fields (informational only)
    issuer_model: str = ""
    holder_eligibility_note: str = ""
    transfer_compliance_note: str = ""
    redemption_custody_note: str = ""

    def total_cost_bps(self, holding_period_days: int) -> int:
        annualized_management_bps = int(
            round(self.management_fee_bps * max(1, holding_period_days) / 365)
        )
        return (
            self.entry_fee_bps
            + self.exit_fee_bps
            + self.slippage_bps
            + annualized_management_bps
        )


class ProofSourceRef(BaseModel):
    ref_id: str
    title: str
    source_name: str
    source_url: str
    source_kind: str = "official"
    source_tier: str = "official"
    freshness_date: str = ""
    summary: str = ""
    status: str = "available"
    unavailable_reason: str = ""
    is_primary: bool = False
    confidence: float = 0.5


class ProofFreshnessState(BaseModel):
    bucket: str = "undated"
    label: str = "Undated"
    checked_at: datetime = Field(default_factory=utcnow)
    stale_after_hours: int = 168
    age_hours: float | None = None
    reason: str = ""


class RedemptionWindow(BaseModel):
    label: str
    window_type: str = "instant"
    settlement_days: int = 0
    detail: str = ""
    next_window: str = ""
    status: str = "open"


class ProofStatusCard(BaseModel):
    key: str
    label: str
    status: str
    detail: str


class OnchainAnchorStatus(BaseModel):
    status: str = "unpublished"
    proof_key: str = ""
    registry_address: str = ""
    transaction_hash: str = ""
    block_number: int | None = None
    explorer_url: str = ""
    recorded_at: datetime | None = None
    attester: str = ""
    note: str = ""


class IndexerStatusItem(BaseModel):
    network: str
    contract_name: str
    contract_address: str = ""
    last_indexed_block: int = 0
    last_safe_head: int = 0
    chain_head: int = 0
    lag: int = 0
    status: str = "idle"
    last_error: str = ""
    updated_at: datetime = Field(default_factory=utcnow)


class IndexedAssetProofEvent(BaseModel):
    event_id: str
    asset_id: str
    asset_name: str = ""
    network: str
    contract_address: str
    proof_key: str
    snapshot_hash: str
    snapshot_uri: str = ""
    proof_type: str = ""
    attester: str = ""
    transaction_hash: str = ""
    block_number: int = 0
    log_index: int = 0
    effective_at: datetime | None = None
    recorded_at: datetime | None = None
    indexed_at: datetime = Field(default_factory=utcnow)


class IndexedPlanHistoryItem(BaseModel):
    event_id: str
    asset_id: str = ""
    asset_name: str = ""
    network: str
    contract_address: str
    attestation_hash: str
    report_hash: str = ""
    portfolio_hash: str = ""
    submitter: str = ""
    session_id: str = ""
    summary_uri: str = ""
    transaction_hash: str = ""
    block_number: int = 0
    log_index: int = 0
    recorded_at: datetime | None = None
    indexed_at: datetime = Field(default_factory=utcnow)


class AssetProofHistoryItem(BaseModel):
    snapshot_id: str
    asset_id: str
    network: str
    snapshot_hash: str
    snapshot_uri: str
    proof_type: str
    effective_at: datetime
    published_at: datetime | None = None
    timeline_version: int = 1
    attester: str = ""
    publish_status: ProofPublishStatus = ProofPublishStatus.PENDING
    onchain_anchor_status: OnchainAnchorStatus = Field(default_factory=OnchainAnchorStatus)
    oracle_freshness: str = ""
    kyc_policy_summary: str = ""
    source_confidence: float = 0.5
    unavailable_reasons: list[str] = Field(default_factory=list)
    onchain_indexed: bool = False
    indexed_at: datetime | None = None


class ProofPublishAttempt(BaseModel):
    attempt_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    snapshot_id: str
    status: ProofPublishStatus = ProofPublishStatus.PENDING
    tx_hash: str = ""
    block_number: int | None = None
    error_message: str = ""
    published_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class AssetProofSnapshot(BaseModel):
    snapshot_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str
    asset_name: str
    asset_symbol: str
    network: str
    live_asset: bool = False
    included_in_registry: bool = False
    snapshot_hash: str
    snapshot_uri: str
    proof_type: str
    effective_at: datetime = Field(default_factory=utcnow)
    published_at: datetime | None = None
    attester: str = "genius-actuary-proof-service"
    registry_address: str = ""
    registry_explorer_url: str = ""
    anchor_status: OnchainAnchorStatus = Field(default_factory=OnchainAnchorStatus)
    indexed_anchor_status: OnchainAnchorStatus | None = None
    indexed_at: datetime | None = None
    history_source: str = "repository"
    timeline_version: int = 1
    publish_status: ProofPublishStatus = ProofPublishStatus.PENDING
    onchain_proof_key: str = ""
    execution_adapter_kind: ExecutionAdapterKind = ExecutionAdapterKind.VIEW_ONLY
    execution_readiness: ExecutionReadiness = ExecutionReadiness.VIEW_ONLY
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    required_kyc_level: int | None = None
    proof_freshness: ProofFreshnessState = Field(default_factory=ProofFreshnessState)
    oracle_freshness: str = ""
    kyc_policy_summary: str = ""
    source_confidence: float = 0.5
    redemption_window: RedemptionWindow = Field(
        default_factory=lambda: RedemptionWindow(label="T+0")
    )
    status_cards: list[ProofStatusCard] = Field(default_factory=list)
    proof_source_refs: list[ProofSourceRef] = Field(default_factory=list)
    unavailable_reasons: list[str] = Field(default_factory=list)
    monitoring_notes: list[str] = Field(default_factory=list)
    primary_action_url: str = ""
    visibility_role: str = "live"
    is_executable: bool = False

    def to_history_item(self) -> AssetProofHistoryItem:
        return AssetProofHistoryItem(
            snapshot_id=self.snapshot_id,
            asset_id=self.asset_id,
            network=self.network,
            snapshot_hash=self.snapshot_hash,
            snapshot_uri=self.snapshot_uri,
            proof_type=self.proof_type,
            effective_at=self.effective_at,
            published_at=self.published_at,
            timeline_version=self.timeline_version,
            attester=self.attester,
            publish_status=self.publish_status,
            onchain_anchor_status=self.anchor_status,
            oracle_freshness=self.oracle_freshness,
            kyc_policy_summary=self.kyc_policy_summary,
            source_confidence=self.source_confidence,
            unavailable_reasons=list(self.unavailable_reasons),
            onchain_indexed=bool(self.indexed_anchor_status and self.indexed_anchor_status.proof_key),
            indexed_at=self.indexed_at,
        )


class PortfolioAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    address: str = ""
    alert_type: str
    severity: str = "warning"
    title: str
    detail: str
    asset_id: str = ""
    asset_name: str = ""
    source_url: str = ""
    source_ref: str = ""
    dedupe_key: str = ""
    status: AlertEventStatus = AlertEventStatus.OPEN
    acked: bool = False
    acknowledged_at: datetime | None = None
    read: bool = False
    read_at: datetime | None = None
    detected_at: datetime = Field(default_factory=utcnow)
    resolved_at: datetime | None = None


class PortfolioAlertAck(BaseModel):
    alert_id: str
    address: str
    acked: bool = False
    acknowledged_at: datetime | None = None
    read: bool = False
    read_at: datetime | None = None


class AlertTimelineItem(BaseModel):
    alert: PortfolioAlert
    snapshot_hash: str = ""
    source_version: str = ""


class OpsJobRun(BaseModel):
    job_run_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    job_name: str
    network: str = ""
    status: str = "running"
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: datetime | None = None
    item_count: int = 0
    error_message: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class DebugOperationReceipt(BaseModel):
    operation_id: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str = ""
    item_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class AttesterRegistryStatus(BaseModel):
    network: str
    registry_address: str = ""
    owner: str = ""
    pending_owner: str = ""
    publisher_address: str = ""
    publisher_authorized: bool = False
    publish_enabled: bool = False
    attesters: list[str] = Field(default_factory=list)
    latest_publish_status: str = ""
    latest_publish_tx_hash: str = ""
    latest_publish_at: datetime | None = None


class SourceHealthStatus(BaseModel):
    asset_id: str
    asset_name: str
    network: str
    visibility_role: str = "live"
    live_asset: bool = False
    proof_freshness_bucket: str = ""
    proof_freshness_label: str = ""
    oracle_freshness: str = ""
    kyc_policy_summary: str = ""
    source_confidence: float = 0.0
    publish_status: ProofPublishStatus = ProofPublishStatus.PENDING
    unavailable_reasons: list[str] = Field(default_factory=list)


class ContractAnchorSummary(BaseModel):
    asset_id: str
    asset_name: str
    network: str
    visibility_role: str = "live"
    is_live: bool = False
    latest_proof_key: str = ""
    latest_snapshot_hash: str = ""
    latest_publish_status: str = ""
    latest_tx_hash: str = ""
    latest_block_number: int | None = None
    latest_indexed_at: datetime | None = None
    proof_history_count: int = 0
    latest_plan_key: str = ""
    latest_plan_session_id: str = ""
    latest_plan_tx_hash: str = ""
    latest_plan_block_number: int | None = None
    latest_plan_indexed_at: datetime | None = None


class RwaOpsSummary(BaseModel):
    pending_publish_count: int = 0
    failed_publish_count: int = 0
    stale_proof_count: int = 0
    max_indexer_lag: int = 0
    failed_job_count: int = 0
    proof_queue: list[AssetProofSnapshot] = Field(default_factory=list)
    attester_status: list[AttesterRegistryStatus] = Field(default_factory=list)
    source_health: list[SourceHealthStatus] = Field(default_factory=list)
    job_health: list[OpsJobRun] = Field(default_factory=list)
    indexer_health: list[IndexerStatusItem] = Field(default_factory=list)
    contract_anchors: list[ContractAnchorSummary] = Field(default_factory=list)


class RiskVector(BaseModel):
    asset_id: str
    asset_name: str
    market: float
    liquidity: float
    peg_redemption: float
    issuer_custody: float
    smart_contract: float
    oracle_dependency: float
    compliance_access: float
    overall: float


class RiskBreakdownItem(BaseModel):
    dimension: str
    raw_value: float | None = None
    normalized_score: float
    weight: float
    evidence_refs: list[str] = Field(default_factory=list)
    data_status: str = "live"
    note: str = ""


class MethodologyReference(BaseModel):
    key: str
    title: str
    url: str
    summary: str = ""


class SourceProvenanceRef(BaseModel):
    ref_id: str
    title: str
    source_name: str
    source_url: str
    source_kind: str = "report"
    source_tier: str = "official"
    freshness_date: str = ""
    verified_summary: str = ""


class ConfidenceBand(BaseModel):
    label: str
    low: float
    base: float
    high: float
    unit: str = "%"
    confidence_level: float = 0.8
    note: str = ""


class StressScenario(BaseModel):
    scenario_key: str
    title: str
    severity: str = "adverse"
    narrative: str
    portfolio_impact_pct: float
    liquidity_impact_days: float = 0.0
    affected_asset_ids: list[str] = Field(default_factory=list)
    source_provenance_refs: list[str] = Field(default_factory=list)


class ReserveBackingSummary(BaseModel):
    title: str
    summary: str
    reserve_quality_score: float
    attestation_status: str
    liquidity_notice: str = ""
    asset_symbols: list[str] = Field(default_factory=list)
    source_provenance_refs: list[str] = Field(default_factory=list)


class SimulationPathPoint(BaseModel):
    day: int
    p10_value: float
    p50_value: float
    p90_value: float


class HoldingPeriodSimulation(BaseModel):
    asset_id: str
    asset_name: str
    holding_period_days: int
    ending_value_low: float
    ending_value_base: float
    ending_value_high: float
    return_pct_low: float
    return_pct_base: float
    return_pct_high: float
    var_95_pct: float
    cvar_95_pct: float
    max_drawdown_low_pct: float
    max_drawdown_base_pct: float
    max_drawdown_high_pct: float
    scenario_note: str = ""
    path: list[SimulationPathPoint] = Field(default_factory=list)


class PortfolioAllocation(BaseModel):
    asset_id: str
    asset_name: str
    target_weight_pct: float
    suggested_amount: float
    rationale: str
    blocked_reason: str = ""


class ComparisonMatrixMetric(BaseModel):
    key: str
    label: str
    description: str = ""
    unit: str = ""


class ComparisonMatrixCell(BaseModel):
    metric_key: str
    label: str
    display_value: str
    raw_value: float | str | bool | None = None
    tone: str = "neutral"
    badges: list[str] = Field(default_factory=list)
    rationale: str = ""
    tooltip: str = ""
    is_blocked: bool = False


class ComparisonMatrixRow(BaseModel):
    asset_id: str
    asset_name: str
    asset_symbol: str
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    cells: list[ComparisonMatrixCell] = Field(default_factory=list)


class ComparisonMatrix(BaseModel):
    title: str
    metrics: list[ComparisonMatrixMetric] = Field(default_factory=list)
    rows: list[ComparisonMatrixRow] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RecommendationDriver(BaseModel):
    title: str
    detail: str
    impact: str = "medium"
    asset_id: str = ""


class ExcludedAssetReason(BaseModel):
    asset_id: str
    asset_name: str
    category: str = ""
    reason: str


class ConstraintImpact(BaseModel):
    constraint_key: str
    label: str
    impact_level: str = "medium"
    detail: str


class SensitivitySummary(BaseModel):
    scenario_key: str
    label: str
    impact_summary: str
    changed_assets: list[str] = Field(default_factory=list)
    recommended_shift: str = ""


class RecommendationReason(BaseModel):
    summary: str = ""
    top_drivers: list[RecommendationDriver] = Field(default_factory=list)
    excluded_reasons: list[ExcludedAssetReason] = Field(default_factory=list)
    constraint_impacts: list[ConstraintImpact] = Field(default_factory=list)
    sensitivity_summary: list[SensitivitySummary] = Field(default_factory=list)


class ExecutionApproval(BaseModel):
    approval_type: str
    token_symbol: str = ""
    spender: str = ""
    approval_target: str = ""
    amount: float | None = None
    note: str = ""
    allowance_required: bool = False


class ExecutionQuote(BaseModel):
    source_asset: str
    target_asset: str
    amount_in: float
    expected_amount_out: float
    fee_amount: float
    fee_bps: float
    gas_estimate: int
    gas_estimate_usd: float
    eta_seconds: int
    route_type: str = "erc20"
    warnings: list[str] = Field(default_factory=list)


class EligibilityDecision(BaseModel):
    decision_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str
    asset_name: str
    chain_id: int
    contract_address: str = ""
    status: EligibilityStatus = EligibilityStatus.BLOCKED
    reasons: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=utcnow)


class PositionSnapshot(BaseModel):
    snapshot_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str
    asset_name: str
    chain_id: int
    contract_address: str = ""
    wallet_address: str = ""
    safe_address: str = ""
    current_balance: float = 0.0
    latest_nav_or_price: float = 0.0
    current_value: float = 0.0
    cost_basis: float = 0.0
    unrealized_pnl: float = 0.0
    realized_income: float = 0.0
    accrued_yield: float = 0.0
    redemption_forecast: float = 0.0
    allocation_weight_pct: float = 0.0
    liquidity_risk: str = ""
    next_redemption_window: str = ""
    oracle_staleness_flag: bool = False
    kyc_change_flag: bool = False
    as_of: datetime = Field(default_factory=utcnow)


class ExecutionStep(BaseModel):
    execution_step_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    step_index: int = 1
    title: str
    description: str
    step_type: str
    route_kind: str = "erc20"
    asset_id: str = ""
    target_contract: str = ""
    explorer_url: str = ""
    chain_id: int | None = None
    estimated_fee_usd: float = 0.0
    expected_amount: float | None = None
    requires_signature: bool = True
    requires_wallet: bool = True
    requires_safe: bool = False
    compliance_blockers: list[str] = Field(default_factory=list)
    required_approvals: list[ExecutionApproval] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    tx_request: dict[str, Any] = Field(default_factory=dict)
    offchain_actions: list[str] = Field(default_factory=list)
    redirect_url: str = ""
    external_request_id: str = ""
    status: str = "pending"


class ExecutionPlan(BaseModel):
    execution_plan_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    session_id: str = ""
    generated_at: datetime = Field(default_factory=utcnow)
    wallet_address: str = ""
    safe_address: str = ""
    source_chain: str = ""
    source_asset: str = ""
    target_asset: str = ""
    execution_adapter_kind: ExecutionAdapterKind = ExecutionAdapterKind.VIEW_ONLY
    execution_readiness: ExecutionReadiness = ExecutionReadiness.VIEW_ONLY
    readiness_reason: str = ""
    external_action_url: str = ""
    external_action_label: str = ""
    ticket_size: float = 0.0
    receipt_id: str = ""
    status: ExecutionLifecycleStatus = ExecutionLifecycleStatus.PREPARED
    quote: ExecutionQuote | None = None
    warnings: list[str] = Field(default_factory=list)
    simulation_warnings: list[str] = Field(default_factory=list)
    possible_failure_reasons: list[str] = Field(default_factory=list)
    compliance_blockers: list[str] = Field(default_factory=list)
    required_approvals: list[ExecutionApproval] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    external_steps: list[str] = Field(default_factory=list)
    steps: list[ExecutionStep] = Field(default_factory=list)
    tx_bundle: list[dict[str, Any]] = Field(default_factory=list)
    eligibility: list[EligibilityDecision] = Field(default_factory=list)
    can_execute_onchain: bool = False
    plan_hash: str = ""


class ExecutionReceipt(BaseModel):
    receipt_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    session_id: str = ""
    asset_id: str
    adapter_kind: ExecutionAdapterKind = ExecutionAdapterKind.VIEW_ONLY
    status: ExecutionLifecycleStatus = ExecutionLifecycleStatus.PREPARED
    settlement_status: SettlementStatus = SettlementStatus.NOT_STARTED
    prepared_payload: dict[str, Any] = Field(default_factory=dict)
    submit_payload: dict[str, Any] = Field(default_factory=dict)
    external_request_id: str = ""
    redirect_url: str = ""
    tx_hash: str = ""
    block_number: int | None = None
    wallet_address: str = ""
    safe_address: str = ""
    failure_reason: str = ""
    note: str = ""
    submitted_at: datetime | None = None
    updated_at: datetime = Field(default_factory=utcnow)


class ExecutionSubmitResult(BaseModel):
    execution_plan: ExecutionPlan
    receipt: ExecutionReceipt
    allowance_steps: list[ExecutionApproval] = Field(default_factory=list)
    redirect_url: str = ""
    issuer_request_id: str = ""
    submission_message: str = ""


class IssuerRequestRecord(BaseModel):
    request_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    receipt_id: str
    asset_id: str
    issuer_case_id: str = ""
    redirect_url: str = ""
    issuer_status: str = "created"
    last_synced_at: datetime = Field(default_factory=utcnow)


class TxDraftStep(BaseModel):
    step: int
    title: str
    description: str
    action_type: str
    target_contract: str = ""
    explorer_url: str = ""
    estimated_fee_usd: float = 0.0
    caution: str = ""


class TxDraft(BaseModel):
    title: str
    chain_id: int
    chain_name: str
    funding_asset: str
    total_estimated_fee_usd: float
    steps: list[TxDraftStep] = Field(default_factory=list)
    risk_warnings: list[str] = Field(default_factory=list)
    can_execute_onchain: bool = False


class AttestationDraft(BaseModel):
    chain_id: int
    report_hash: str
    portfolio_hash: str
    attestation_hash: str
    evidence_hash: str = ""
    execution_plan_hash: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    network: str = ""
    contract_address: str = ""
    explorer_url: str = ""
    event_name: str = "PlanRegistered"
    ready: bool = False
    transaction_hash: str = ""
    transaction_url: str = ""
    submitted_by: str = ""
    submitted_at: datetime | None = None
    block_number: int | None = None


class TransactionReceiptRecord(BaseModel):
    receipt_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    tx_hash: str
    tx_status: TransactionStatus = TransactionStatus.SUBMITTED
    block_number: int | None = None
    chain_id: int | None = None
    executed_at: datetime = Field(default_factory=utcnow)
    wallet_address: str = ""
    safe_address: str = ""
    related_execution_step_id: str = ""
    explorer_url: str = ""
    receipt_payload: dict[str, Any] = Field(default_factory=dict)
    failure_reason: str = ""
    retry_hint: str = ""


class ReportAnchorRecord(BaseModel):
    anchor_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    report_hash: str
    evidence_hash: str
    execution_plan_hash: str
    attestation_hash: str
    status: str = "draft"
    chain_id: int | None = None
    contract_address: str = ""
    transaction_hash: str = ""
    block_number: int | None = None
    explorer_url: str = ""
    anchored_at: datetime | None = None
    note: str = ""


class AssetAnalysisCard(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_type: AssetType
    issuer: str = ""
    custody: str = ""
    chain_id: int
    contract_address: str = ""
    protocol_name: str = ""
    permissioning_standard: str = ""
    required_kyc_level: int | None = None
    eligible_investor_types: list[str] = Field(default_factory=list)
    restricted_jurisdictions: list[str] = Field(default_factory=list)
    min_subscription_amount: float = 0.0
    redemption_window: str = ""
    settlement_asset: str = "USDT"
    oracle_provider: str = ""
    oracle_contract: str = ""
    last_oracle_timestamp: datetime | None = None
    nav_or_price: float | None = None
    indicative_yield: float | None = None
    reserve_summary: str = ""
    custody_summary: str = ""
    bridge_support: list[str] = Field(default_factory=list)
    proof_refs: list[str] = Field(default_factory=list)
    secondary_market_available: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    expected_return_low: float
    expected_return_base: float
    expected_return_high: float
    exit_days: int
    total_cost_bps: int
    kyc_required_level: int | None = None
    thesis: str = ""
    fit_summary: str = ""
    tags: list[str] = Field(default_factory=list)
    primary_source_url: str = ""
    onchain_verified: bool = False
    issuer_disclosed: bool = False
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    status_explanation: str = ""
    truth_level_explanation: str = ""
    risk_vector: RiskVector
    risk_breakdown: list[RiskBreakdownItem] = Field(default_factory=list)
    risk_data_quality: float = 1.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)


class EvidenceFreshness(BaseModel):
    bucket: EvidenceFreshnessBucket = EvidenceFreshnessBucket.UNDATED
    label: str = ""
    age_hours: float | None = None
    stale_warning: str = ""


class EvidenceConflict(BaseModel):
    asset_id: str = ""
    field_key: str
    severity: str = "warning"
    summary: str
    evidence_ids: list[str] = Field(default_factory=list)


class EvidenceCoverage(BaseModel):
    asset_id: str
    asset_name: str = ""
    coverage_score: float = 0.0
    completeness_score: float = 0.0
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class EvidenceGovernance(BaseModel):
    overall_score: float = 0.0
    weak_evidence_warning: str = ""
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    coverage: list[EvidenceCoverage] = Field(default_factory=list)


class DemoScenarioDefinition(BaseModel):
    scenario_id: str
    title: str
    description: str
    problem_statement: str
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)
    featured_asset_ids: list[str] = Field(default_factory=list)
    analysis_seed: int
    demo_label: str = "Official Demo"
    notes: list[str] = Field(default_factory=list)


class ComparableAllocationSnapshot(BaseModel):
    asset_id: str
    asset_name: str
    target_weight_pct: float


class ComparableAssetSnapshot(BaseModel):
    asset_id: str
    asset_name: str
    overall_risk: float
    data_quality: float


class ComparableReportSnapshot(BaseModel):
    snapshot_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    created_at: datetime = Field(default_factory=utcnow)
    summary: str = ""
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)
    recommended_allocations: list[ComparableAllocationSnapshot] = Field(default_factory=list)
    asset_snapshots: list[ComparableAssetSnapshot] = Field(default_factory=list)
    evidence_count: int = 0
    evidence_conflict_count: int = 0
    coverage_score: float = 0.0
    warnings: list[str] = Field(default_factory=list)


class DiffFieldChange(BaseModel):
    label: str
    before: str
    after: str
    detail: str = ""


class AllocationDiffItem(BaseModel):
    asset_id: str
    asset_name: str
    before_weight_pct: float
    after_weight_pct: float
    delta_weight_pct: float
    reason: str = ""


class RiskDiffItem(BaseModel):
    asset_id: str
    asset_name: str
    before_overall: float
    after_overall: float
    delta_overall: float


class EvidenceDiffItem(BaseModel):
    asset_id: str = ""
    asset_name: str = ""
    before_coverage_score: float = 0.0
    after_coverage_score: float = 0.0
    before_conflict_count: int = 0
    after_conflict_count: int = 0
    summary: str = ""


class ReanalysisDiff(BaseModel):
    previous_snapshot_at: datetime | None = None
    current_generated_at: datetime = Field(default_factory=utcnow)
    summary: str = ""
    changed_constraints: list[DiffFieldChange] = Field(default_factory=list)
    changed_weights: list[AllocationDiffItem] = Field(default_factory=list)
    changed_risk: list[RiskDiffItem] = Field(default_factory=list)
    changed_evidence: list[EvidenceDiffItem] = Field(default_factory=list)
    previous_recommendation: list[str] = Field(default_factory=list)
    current_recommendation: list[str] = Field(default_factory=list)
    why_changed: list[str] = Field(default_factory=list)


class OracleSnapshot(BaseModel):
    feed_id: str
    pair: str
    network: str
    source_name: str
    source_url: str
    feed_address: str
    explorer_url: str = ""
    price: float | None = None
    decimals: int = 8
    fetched_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime | None = None
    round_id: int | None = None
    note: str = ""
    status: str = "unavailable"


class KycOnchainResult(BaseModel):
    wallet_address: str
    network: str
    contract_address: str = ""
    status: KycStatus = KycStatus.NONE
    is_human: bool = False
    level: int = 0
    source_url: str = ""
    explorer_url: str = ""
    fetched_at: datetime = Field(default_factory=utcnow)
    note: str = ""


class WalletBalance(BaseModel):
    symbol: str
    amount: float
    chain_id: int
    contract_address: str = ""
    usd_value: float = 0.0
    price: float = 0.0


class EvidencePanelItem(BaseModel):
    evidence_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str = ""
    title: str
    source_url: str
    source_name: str
    source_tag: DataSourceTag = DataSourceTag.ISSUER_DISCLOSED
    fetched_at: datetime = Field(default_factory=utcnow)
    summary: str
    extracted_facts: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    fact_type: EvidenceFactType = EvidenceFactType.OFFCHAIN_DISCLOSED_FACT
    freshness: EvidenceFreshness = Field(default_factory=EvidenceFreshness)
    conflict_keys: list[str] = Field(default_factory=list)
