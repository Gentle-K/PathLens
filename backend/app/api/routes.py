import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.bootstrap import get_app_services
from app.config import Settings
from app.domain.schemas import (
    AuditLogListResponse,
    AuditLogResponse,
    ContinueSessionRequest,
    DebugAuthStatusResponse,
    DebugSessionListResponse,
    FrontendBootstrapResponse,
    PersonalDataDeletionResponse,
    RecordAttestationRequest,
    RequestMoreFollowUpResponse,
    SessionCreateRequest,
    SessionResponse,
    SessionSummaryResponse,
    SessionStepResponse,
)
from app.i18n import normalize_locale
from app.rwa.catalog import build_asset_library, build_chain_config

router = APIRouter()
CLIENT_COOKIE_NAME = "genius_actuary_client_id"
debug_security = HTTPBasic()


def ensure_client_cookie(request: Request, response: Response) -> str:
    settings = Settings.from_env()
    client_id = request.cookies.get(CLIENT_COOKIE_NAME)
    if client_id:
        return client_id

    client_id = str(uuid4())
    response.set_cookie(
        key=CLIENT_COOKIE_NAME,
        value=client_id,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies(),
        max_age=60 * 60 * 24 * 30,
    )
    return client_id


def assert_session_owner(session: SessionResponse, client_id: str) -> None:
    if session.owner_client_id != client_id:
        raise HTTPException(status_code=404, detail="Session not found.")


def get_request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def resolve_request_locale(request: Request) -> str:
    return normalize_locale(
        request.headers.get("x-app-locale")
        or request.headers.get("accept-language")
        or "zh"
    )


def require_debug_auth(
    credentials: HTTPBasicCredentials = Depends(debug_security),
) -> str:
    settings = Settings.from_env()
    username_ok = secrets.compare_digest(credentials.username, settings.debug_username)
    password_ok = secrets.compare_digest(credentials.password, settings.debug_password)
    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid debug credentials.",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def clear_client_cookie(response: Response) -> None:
    settings = Settings.from_env()
    response.delete_cookie(
        key=CLIENT_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies(),
    )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/api/auth/logout", status_code=204)
def logout(response: Response) -> Response:
    clear_client_cookie(response)
    return response


@router.get("/api/frontend/bootstrap", response_model=FrontendBootstrapResponse)
def frontend_bootstrap(request: Request, response: Response) -> FrontendBootstrapResponse:
    ensure_client_cookie(request, response)
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    asset_library = build_asset_library(
        chain_config,
        locale=resolve_request_locale(request),
    )
    return FrontendBootstrapResponse(
        app_name="Genius Actuary",
        supported_modes=services.orchestrator.supported_modes(),
        session_statuses=services.orchestrator.supported_statuses(),
        next_actions=services.orchestrator.supported_actions(),
        notes=[
            (
                "Adapters: "
                f"analysis={settings.analysis_adapter}/{settings.analysis_provider}, "
                f"clarification_follow_up_round_limit={settings.clarification_follow_up_round_limit}, "
                f"search={settings.search_adapter}, chart={settings.chart_adapter}, "
                f"calculation_mcp_enabled={settings.calculation_mcp_enabled}"
            ),
            "Frontend should only call backend APIs and should not orchestrate MCP logic directly.",
            "RWA reports must stay evidence-linked, risk-decomposed, and reproducible on HashKey Chain.",
        ],
        chain_config=chain_config,
        asset_library=asset_library,
        supported_asset_types=sorted({asset.asset_type.value for asset in asset_library}),
        holding_period_presets=[7, 30, 90, 180],
    )


@router.post("/api/sessions", response_model=SessionStepResponse)
def create_session(
    payload: SessionCreateRequest,
    request: Request,
    response: Response,
) -> SessionStepResponse:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.create_session(
        mode=payload.mode,
        locale=payload.locale,
        problem_statement=payload.problem_statement,
        owner_client_id=client_id,
        intake_context=payload.intake_context,
        ip_address=get_request_ip(request),
    )
    return services.orchestrator.advance_session(session.session_id)


@router.get("/api/sessions/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    request: Request,
    response: Response,
) -> SessionResponse:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    session_response = SessionResponse.model_validate(session)
    assert_session_owner(session_response, client_id)
    return session_response


@router.get("/api/my/sessions", response_model=list[SessionResponse])
def list_my_sessions(request: Request, response: Response) -> list[SessionResponse]:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    sessions = services.session_service.list_sessions_by_owner(client_id)
    return [SessionResponse.model_validate(session) for session in sessions]


@router.post("/api/sessions/{session_id}/step", response_model=SessionStepResponse)
def continue_session(
    session_id: str,
    payload: ContinueSessionRequest,
    request: Request,
    response: Response,
) -> SessionStepResponse:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    assert_session_owner(SessionResponse.model_validate(session), client_id)

    if payload.answers:
        services.session_service.record_answers(session_id, payload.answers)

    return services.orchestrator.advance_session(session_id)


@router.post("/api/sessions/{session_id}/attestation", response_model=SessionResponse)
def record_attestation(
    session_id: str,
    payload: RecordAttestationRequest,
    request: Request,
    response: Response,
) -> SessionResponse:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    assert_session_owner(SessionResponse.model_validate(session), client_id)

    updated = services.session_service.record_attestation(
        session_id,
        network=payload.network,
        transaction_hash=payload.transaction_hash,
        submitted_by=payload.submitted_by,
        block_number=payload.block_number,
    )
    if updated is None:
        raise HTTPException(status_code=400, detail="Attestation draft is unavailable for this session.")
    return SessionResponse.model_validate(updated)


@router.post(
    "/api/sessions/{session_id}/request-more-follow-up",
    response_model=RequestMoreFollowUpResponse,
)
def request_more_follow_up(
    session_id: str,
    request: Request,
    response: Response,
) -> RequestMoreFollowUpResponse:
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    assert_session_owner(SessionResponse.model_validate(session), client_id)

    updated = services.session_service.request_more_follow_up(session_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    step = services.orchestrator.advance_session(session_id)
    refreshed = services.session_service.get_session(session_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    return RequestMoreFollowUpResponse(
        session=SessionResponse.model_validate(refreshed),
        step=step,
    )


@router.get("/api/debug/auth/me", response_model=DebugAuthStatusResponse)
def debug_auth_me(username: str = Depends(require_debug_auth)) -> DebugAuthStatusResponse:
    return DebugAuthStatusResponse(username=username)


@router.get("/api/debug/logs", response_model=AuditLogListResponse)
def list_debug_logs(
    request: Request,
    username: str = Depends(require_debug_auth),
) -> AuditLogListResponse:
    services = get_app_services()
    services.audit_log_service.write(
        action="DEBUG_LOGS_VIEWED",
        actor=username,
        target="audit_logs",
        ip_address=get_request_ip(request),
        summary="Viewed the protected audit log list.",
    )
    logs = services.audit_log_service.list_logs()
    return AuditLogListResponse(logs=[AuditLogResponse.model_validate(log) for log in logs])


@router.get("/api/debug/logs/{log_id}", response_model=AuditLogResponse)
def get_debug_log(
    log_id: str,
    request: Request,
    username: str = Depends(require_debug_auth),
) -> AuditLogResponse:
    services = get_app_services()
    log = services.audit_log_service.get_log(log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Audit log not found.")
    services.audit_log_service.write(
        action="DEBUG_LOG_VIEWED",
        actor=username,
        target=log_id,
        ip_address=get_request_ip(request),
        summary="Viewed a protected audit log entry.",
    )
    return AuditLogResponse.model_validate(log)


@router.get("/api/debug/sessions", response_model=DebugSessionListResponse)
def list_debug_sessions(
    request: Request,
    username: str = Depends(require_debug_auth),
) -> DebugSessionListResponse:
    services = get_app_services()
    services.audit_log_service.write(
        action="DEBUG_SESSIONS_VIEWED",
        actor=username,
        target="sessions",
        ip_address=get_request_ip(request),
        summary="Viewed the protected backend session index.",
    )
    sessions = services.session_service.list_sessions()
    return DebugSessionListResponse(
        sessions=[SessionSummaryResponse.from_session(session) for session in sessions]
    )


@router.get("/api/debug/sessions/{session_id}", response_model=SessionResponse)
def get_debug_session(
    session_id: str,
    request: Request,
    username: str = Depends(require_debug_auth),
) -> SessionResponse:
    services = get_app_services()
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    services.audit_log_service.write(
        action="DEBUG_SESSION_VIEWED",
        actor=username,
        target=session_id,
        ip_address=get_request_ip(request),
        summary="Viewed a protected backend session payload.",
    )
    return SessionResponse.model_validate(session)


@router.delete("/api/me/data", response_model=PersonalDataDeletionResponse)
def delete_my_personal_data(
    request: Request,
    response: Response,
) -> PersonalDataDeletionResponse:
    services = get_app_services()
    client_id = request.cookies.get(CLIENT_COOKIE_NAME)
    if not client_id:
        clear_client_cookie(response)
        return PersonalDataDeletionResponse(deleted_session_count=0)

    deleted_count = services.session_service.delete_sessions_by_owner(client_id)
    clear_client_cookie(response)
    return PersonalDataDeletionResponse(deleted_session_count=deleted_count)
