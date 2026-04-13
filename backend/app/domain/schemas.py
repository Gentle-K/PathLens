from pydantic import BaseModel, ConfigDict, Field

from app.domain.models import (
    AnalysisMode,
    AuditLogEntry,
    AnalysisReport,
    AnalysisSession,
    CalculationTask,
    ChartArtifact,
    ChartTask,
    ClarificationQuestion,
    EvidenceItem,
    MajorConclusionItem,
    NextAction,
    SearchTask,
    SessionStatus,
    UserAnswer,
)
from app.domain.rwa import (
    AttesterRegistryStatus,
    AssetProofHistoryItem,
    AssetProofSnapshot,
    AssetTemplate,
    ContractAnchorSummary,
    DebugOperationReceipt,
    ExecutionAdapterKind,
    ExecutionApproval,
    ExecutionReceipt,
    ExecutionReadiness,
    DemoScenarioDefinition,
    EligibilityDecision,
    ExecutionPlan,
    ExecutionQuote,
    HashKeyChainConfig,
    IndexedAssetProofEvent,
    IndexedPlanHistoryItem,
    IndexerStatusItem,
    KycOnchainResult,
    OnchainAnchorStatus,
    OpsJobRun,
    OracleSnapshot,
    PortfolioAlert,
    PortfolioAlertAck,
    PositionSnapshot,
    ReportAnchorRecord,
    RwaOpsSummary,
    RwaIntakeContext,
    SourceHealthStatus,
    SettlementStatus,
    TransactionReceiptRecord,
    WalletBalance,
)


class SessionCreateRequest(BaseModel):
    mode: AnalysisMode
    locale: str = "zh"
    problem_statement: str = Field(min_length=5)
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)


class ContinueSessionRequest(BaseModel):
    answers: list[UserAnswer] = Field(default_factory=list)


class RecordAttestationRequest(BaseModel):
    network: str = Field(min_length=1)
    transaction_hash: str = Field(min_length=10)
    submitted_by: str = ""
    block_number: int | None = None


class SessionResponse(AnalysisSession):
    model_config = ConfigDict(from_attributes=True)


class SessionSummaryResponse(BaseModel):
    session_id: str
    owner_client_id: str
    mode: AnalysisMode
    problem_statement: str
    status: SessionStatus
    event_count: int
    answer_count: int
    evidence_count: int
    search_task_count: int
    created_at: str
    updated_at: str

    @classmethod
    def from_session(cls, session: AnalysisSession) -> "SessionSummaryResponse":
        return cls(
            session_id=session.session_id,
            owner_client_id=session.owner_client_id,
            mode=session.mode,
            problem_statement=session.problem_statement,
            status=session.status,
            event_count=len(session.events),
            answer_count=len(session.answers),
            evidence_count=len(session.evidence_items),
            search_task_count=len(session.search_tasks),
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat(),
        )


class DebugSessionListResponse(BaseModel):
    sessions: list[SessionSummaryResponse]


class AuditLogResponse(AuditLogEntry):
    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]


class DebugAuthStatusResponse(BaseModel):
    username: str
    role: str = "debug_admin"


class PersonalDataDeletionResponse(BaseModel):
    deleted_session_count: int


class SessionStepResponse(BaseModel):
    session_id: str
    status: SessionStatus
    next_action: NextAction
    prompt_to_user: str
    analysis_rounds_completed: int = 0
    activity_status: str = "idle"
    current_focus: str = ""
    last_stop_reason: str = ""
    error_message: str | None = None
    pending_questions: list[ClarificationQuestion] = Field(default_factory=list)
    pending_search_tasks: list[SearchTask] = Field(default_factory=list)
    pending_calculation_tasks: list[CalculationTask] = Field(default_factory=list)
    pending_chart_tasks: list[ChartTask] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    chart_artifacts: list[ChartArtifact] = Field(default_factory=list)
    major_conclusions: list[MajorConclusionItem] = Field(default_factory=list)
    report_preview: AnalysisReport | None = None


class RequestMoreFollowUpResponse(BaseModel):
    session: SessionResponse
    step: SessionStepResponse


class OracleSnapshotResponse(BaseModel):
    snapshots: list[OracleSnapshot]
    network: str
    note: str = ""


class KycCheckResponse(BaseModel):
    result: KycOnchainResult


class WalletSummaryResponse(BaseModel):
    address: str
    network: str
    balances: list[WalletBalance] = Field(default_factory=list)
    kyc: KycOnchainResult
    safe_detected: bool = False
    last_sync_at: str


class WalletPositionsResponse(BaseModel):
    address: str
    network: str
    positions: list[PositionSnapshot] = Field(default_factory=list)
    last_sync_at: str


class FrontendBootstrapResponse(BaseModel):
    app_name: str
    supported_modes: list[str]
    session_statuses: list[str]
    next_actions: list[str]
    notes: list[str]
    chain_config: HashKeyChainConfig
    asset_library: list[AssetTemplate]
    supported_asset_types: list[str]
    holding_period_presets: list[int]
    oracle_snapshots: list[OracleSnapshot] = Field(default_factory=list)
    demo_scenarios: list[DemoScenarioDefinition] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Dedicated RWA schemas
# ---------------------------------------------------------------------------

class RwaCatalogResponse(BaseModel):
    assets: list[AssetTemplate]
    asset_types: list[str]
    chain_config: HashKeyChainConfig
    demo_scenarios: list[DemoScenarioDefinition] = Field(default_factory=list)


class RwaComparisonRequest(BaseModel):
    problem_statement: str = Field(min_length=5)
    preferred_asset_ids: list[str] = Field(default_factory=list)
    investment_amount: float = 10000.0
    base_currency: str = "USDT"
    holding_period_days: int = 30
    risk_tolerance: str = "balanced"
    liquidity_need: str = "t_plus_3"
    minimum_kyc_level: int = 0
    wallet_address: str = ""
    wallet_network: str = ""
    locale: str = "zh"
    include_multi_horizon: bool = True
    include_defi_llama_evidence: bool = True
    include_non_production_assets: bool = False
    demo_mode: bool = False
    demo_scenario_id: str = ""
    analysis_seed: int | None = None


class RwaAnalyzeResponse(BaseModel):
    report: AnalysisReport
    evidence: list[EvidenceItem] = Field(default_factory=list)
    multi_horizon_simulations: dict[str, list] = Field(default_factory=dict)


class EligibleCatalogBucketItem(BaseModel):
    asset: AssetTemplate
    decision: EligibilityDecision


class EligibleCatalogResponse(BaseModel):
    address: str
    session_id: str = ""
    eligible: list[EligibleCatalogBucketItem] = Field(default_factory=list)
    conditional: list[EligibleCatalogBucketItem] = Field(default_factory=list)
    blocked: list[EligibleCatalogBucketItem] = Field(default_factory=list)


class RwaQuoteRequest(BaseModel):
    source_asset: str = Field(min_length=1)
    target_asset: str = Field(min_length=1)
    amount: float = Field(gt=0)
    wallet_address: str = ""
    safe_address: str = ""
    source_chain: str = "hashkey"
    route_preferences: dict[str, str] = Field(default_factory=dict)
    session_id: str = ""


class RwaQuoteResponse(BaseModel):
    quote: ExecutionQuote


class RwaSimulateRequest(RwaQuoteRequest):
    include_attestation: bool = True


class RwaSimulateResponse(BaseModel):
    quote: ExecutionQuote
    required_approvals: list[dict] = Field(default_factory=list)
    possible_failure_reasons: list[str] = Field(default_factory=list)
    compliance_blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RwaExecuteRequest(RwaSimulateRequest):
    generate_only: bool = True


class RwaExecuteResponse(BaseModel):
    execution_plan: ExecutionPlan
    prepare_summary: str = ""
    checklist: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    execution_receipt: ExecutionReceipt | None = None
    tx_receipts: list[TransactionReceiptRecord] = Field(default_factory=list)
    report_anchor_records: list[ReportAnchorRecord] = Field(default_factory=list)


class RwaExecuteSubmitRequest(RwaExecuteRequest):
    network: str = ""
    transaction_hash: str = ""
    submitted_by: str = ""
    block_number: int | None = None
    note: str = ""


class RwaExecuteSubmitResponse(BaseModel):
    execution_plan: ExecutionPlan
    receipt: ExecutionReceipt
    allowance_steps: list[ExecutionApproval] = Field(default_factory=list)
    issuer_request_id: str = ""
    redirect_url: str = ""
    tx_receipts: list[TransactionReceiptRecord] = Field(default_factory=list)
    report_anchor_records: list[ReportAnchorRecord] = Field(default_factory=list)
    submission_status: str = "prepared"
    submission_message: str = ""
    external_action_url: str = ""


class RwaMonitorResponse(BaseModel):
    session_id: str
    position_snapshots: list[PositionSnapshot] = Field(default_factory=list)
    current_balance: float = 0.0
    latest_nav_or_price: float = 0.0
    cost_basis: float = 0.0
    unrealized_pnl: float = 0.0
    realized_income: float = 0.0
    accrued_yield: float = 0.0
    redemption_forecast: float = 0.0
    allocation_mix: dict[str, float] = Field(default_factory=dict)
    next_redemption_window: str = ""
    oracle_staleness_flag: bool = False
    kyc_change_flag: bool = False
    proof_staleness_flag: bool = False
    issuer_disclosure_update_flag: bool = False
    alert_flags: list[str] = Field(default_factory=list)
    portfolio_alerts: list[PortfolioAlert] = Field(default_factory=list)


class ReportAnchorRequest(BaseModel):
    network: str = Field(min_length=1)
    transaction_hash: str = ""
    submitted_by: str = ""
    block_number: int | None = None
    note: str = ""


class ReportAnchorResponse(BaseModel):
    record: ReportAnchorRecord


class RwaClarifyRequest(BaseModel):
    problem_statement: str = Field(min_length=5)
    locale: str = "zh"


class RwaClarifyResponse(BaseModel):
    questions: list[ClarificationQuestion]


class RwaAssetProofResponse(BaseModel):
    asset: AssetTemplate
    proof: AssetProofSnapshot
    latest_proof: AssetProofSnapshot
    onchain_anchor_status: OnchainAnchorStatus
    proof_timeline_preview: list[AssetProofHistoryItem] = Field(default_factory=list)


class RwaAssetProofHistoryResponse(BaseModel):
    asset_id: str
    network: str
    history: list[AssetProofHistoryItem] = Field(default_factory=list)
    history_source: str = "repository"


class RwaAssetProofAnchorHistoryResponse(BaseModel):
    asset_id: str
    network: str
    history: list[IndexedAssetProofEvent] = Field(default_factory=list)


class RwaAssetPlanHistoryResponse(BaseModel):
    asset_id: str
    network: str
    history: list[IndexedPlanHistoryItem] = Field(default_factory=list)


class RwaAssetReadinessResponse(BaseModel):
    asset: AssetTemplate
    proof: AssetProofSnapshot
    decision: EligibilityDecision
    execution_adapter_kind: ExecutionAdapterKind
    execution_readiness: ExecutionReadiness
    route_summary: str = ""
    quote: ExecutionQuote | None = None
    required_approvals: list[ExecutionApproval] = Field(default_factory=list)
    possible_failure_reasons: list[str] = Field(default_factory=list)
    compliance_blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RwaPortfolioResponse(BaseModel):
    address: str
    network: str
    positions: list[PositionSnapshot] = Field(default_factory=list)
    proof_snapshots: list[AssetProofSnapshot] = Field(default_factory=list)
    alerts: list[PortfolioAlert] = Field(default_factory=list)
    indexer_health: list[IndexerStatusItem] = Field(default_factory=list)
    latest_anchor_summary: list[ContractAnchorSummary] = Field(default_factory=list)
    total_value_usd: float = 0.0
    total_cost_basis: float = 0.0
    total_unrealized_pnl: float = 0.0
    total_realized_income: float = 0.0
    total_accrued_yield: float = 0.0
    total_redemption_forecast: float = 0.0
    allocation_mix: dict[str, float] = Field(default_factory=dict)
    last_sync_at: str


class RwaPortfolioAlertsResponse(BaseModel):
    address: str
    network: str
    alerts: list[PortfolioAlert] = Field(default_factory=list)


class RwaPortfolioAlertStateResponse(BaseModel):
    state: PortfolioAlertAck


class RwaExecutionReceiptResponse(BaseModel):
    receipt: ExecutionReceipt


class RwaExecutionReceiptListResponse(BaseModel):
    receipts: list[ExecutionReceipt] = Field(default_factory=list)


class SettlementStatusResponse(BaseModel):
    settlement_status: SettlementStatus


class RwaIndexerStatusResponse(BaseModel):
    status: list[IndexerStatusItem] = Field(default_factory=list)


class RwaOpsSummaryResponse(BaseModel):
    summary: RwaOpsSummary


class RwaOpsJobsResponse(BaseModel):
    jobs: list[OpsJobRun] = Field(default_factory=list)


class DebugOperationReceiptResponse(BaseModel):
    receipt: DebugOperationReceipt
