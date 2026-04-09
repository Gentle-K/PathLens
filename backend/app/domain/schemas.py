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
from app.domain.rwa import AssetTemplate, HashKeyChainConfig, RwaIntakeContext


class SessionCreateRequest(BaseModel):
    mode: AnalysisMode
    locale: str = "zh"
    problem_statement: str = Field(min_length=5)
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)


class ContinueSessionRequest(BaseModel):
    answers: list[UserAnswer] = Field(default_factory=list)


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
