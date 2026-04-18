from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app.api.routes import ensure_client_cookie, get_request_ip
from app.bootstrap import get_app_services
from app.stocks.models import (
    StocksAccountResponse,
    StocksAutopilotStateRequest,
    StocksAutopilotStateResponse,
    StocksBootstrapResponse,
    StocksCandidatesResponse,
    StocksDecisionCyclesResponse,
    StocksKillSwitchRequest,
    StocksKillSwitchResponse,
    StocksOrdersResponse,
    StocksPositionsResponse,
    StocksSettingsUpdateRequest,
    TradingMode,
)


stocks_router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@stocks_router.get("/bootstrap", response_model=StocksBootstrapResponse)
def get_stocks_bootstrap(request: Request, response: Response) -> StocksBootstrapResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    payload = services.stocks_trading_service.bootstrap_payload(client_id)
    return StocksBootstrapResponse.model_validate(payload)


@stocks_router.get("/account", response_model=StocksAccountResponse)
def get_stocks_account(
    request: Request,
    response: Response,
    mode: TradingMode = TradingMode.PAPER,
) -> StocksAccountResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    account = services.stocks_trading_service.get_account(client_id, mode)
    return StocksAccountResponse(account=account)


@stocks_router.get("/candidates", response_model=StocksCandidatesResponse)
def get_stocks_candidates(
    request: Request,
    response: Response,
    mode: TradingMode = TradingMode.PAPER,
) -> StocksCandidatesResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    cycle = services.stocks_trading_service.get_candidates(
        client_id,
        mode,
        ip_address=get_request_ip(request),
    )
    return StocksCandidatesResponse(
        mode=mode,
        candidates=cycle.candidates,
        ai_decisions=cycle.ai_decisions,
        risk_outcomes=cycle.risk_outcomes,
        latest_cycle=cycle,
    )


@stocks_router.get("/positions", response_model=StocksPositionsResponse)
def get_stocks_positions(
    request: Request,
    response: Response,
    mode: TradingMode = TradingMode.PAPER,
) -> StocksPositionsResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    account, positions = services.stocks_trading_service.get_positions(client_id, mode)
    return StocksPositionsResponse(mode=mode, positions=positions, account=account)


@stocks_router.get("/orders", response_model=StocksOrdersResponse)
def get_stocks_orders(
    request: Request,
    response: Response,
    mode: TradingMode = TradingMode.PAPER,
) -> StocksOrdersResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    account, positions, orders = services.stocks_trading_service.get_orders(client_id, mode)
    return StocksOrdersResponse(mode=mode, orders=orders, positions=positions, account=account)


@stocks_router.post("/autopilot/state", response_model=StocksAutopilotStateResponse)
def set_stocks_autopilot_state(
    payload: StocksAutopilotStateRequest,
    request: Request,
    response: Response,
) -> StocksAutopilotStateResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    try:
        account, promotion_gate = services.stocks_trading_service.set_autopilot_state(
            client_id,
            payload.mode,
            payload.state,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return StocksAutopilotStateResponse(
        mode=payload.mode,
        state=payload.state,
        account=account,
        promotion_gate=promotion_gate,
    )


@stocks_router.post("/kill-switch", response_model=StocksKillSwitchResponse)
def trigger_stocks_kill_switch(
    payload: StocksKillSwitchRequest,
    request: Request,
    response: Response,
) -> StocksKillSwitchResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    account = services.stocks_trading_service.trigger_kill_switch(
        client_id,
        payload.mode,
        payload.reason,
    )
    return StocksKillSwitchResponse(
        mode=payload.mode,
        state=account.autopilot_state,
        account=account,
        reason=payload.reason,
    )


@stocks_router.post("/settings", response_model=StocksBootstrapResponse)
def update_stocks_settings(
    payload: StocksSettingsUpdateRequest,
    request: Request,
    response: Response,
) -> StocksBootstrapResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    services.stocks_trading_service.update_settings(client_id, payload)
    bootstrap = services.stocks_trading_service.bootstrap_payload(client_id)
    return StocksBootstrapResponse.model_validate(bootstrap)


@stocks_router.get("/promotion-gate")
def get_stocks_promotion_gate(request: Request, response: Response):
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    return services.stocks_trading_service.promotion_gate(client_id)


@stocks_router.get("/decision-cycles", response_model=StocksDecisionCyclesResponse)
def get_stocks_decision_cycles(
    request: Request,
    response: Response,
    mode: TradingMode | None = None,
) -> StocksDecisionCyclesResponse:
    client_id = ensure_client_cookie(request, response)
    services = get_app_services()
    if services.stocks_trading_service is None:
        raise HTTPException(status_code=503, detail="Stocks trading service is unavailable.")
    items = services.stocks_trading_service.list_decision_cycles(client_id, mode)
    return StocksDecisionCyclesResponse(mode=mode, items=items)
