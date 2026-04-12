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
    AssetTemplate,
    DemoScenarioDefinition,
    HashKeyChainConfig,
    KycOnchainResult,
    OracleSnapshot,
    RwaIntakeContext,
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


class RwaClarifyRequest(BaseModel):
    problem_statement: str = Field(min_length=5)
    locale: str = "zh"


class RwaClarifyResponse(BaseModel):
    questions: list[ClarificationQuestion]
