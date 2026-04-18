from __future__ import annotations

from copy import deepcopy

from app.services.audit import AuditLogService
from app.stocks.audit import StocksAuditService
from app.stocks.broker import StocksBrokerService
from app.stocks.decision_engine import StocksDecisionEngine
from app.stocks.execution_router import StocksExecutionRouter
from app.stocks.market_data import StocksMarketDataService
from app.stocks.models import (
    AutopilotState,
    ProviderConnectionStatus,
    ProviderStatus,
    StocksSettingsUpdateRequest,
    TradingMode,
    TradingWorkspace,
    utc_now_iso,
)
from app.stocks.portfolio import StocksPortfolioService
from app.stocks.repository import InMemoryStocksRepository, SQLiteStocksRepository
from app.stocks.risk_engine import StocksRiskEngine
from app.stocks.scheduler import StocksSchedulerService


class StocksTradingService:
    def __init__(
        self,
        *,
        repository: SQLiteStocksRepository | InMemoryStocksRepository,
        market_data_service: StocksMarketDataService,
        broker_service: StocksBrokerService,
        decision_engine: StocksDecisionEngine,
        risk_engine: StocksRiskEngine,
        execution_router: StocksExecutionRouter,
        portfolio_service: StocksPortfolioService,
        audit_log_service: AuditLogService,
    ) -> None:
        self.repository = repository
        self.market_data_service = market_data_service
        self.broker_service = broker_service
        self.decision_engine = decision_engine
        self.risk_engine = risk_engine
        self.execution_router = execution_router
        self.portfolio_service = portfolio_service
        self.audit_service = StocksAuditService(audit_log_service)
        self.scheduler = StocksSchedulerService(
            repository=repository,
            market_data_service=market_data_service,
            decision_engine=decision_engine,
            risk_engine=risk_engine,
            execution_router=execution_router,
            broker_service=broker_service,
            portfolio_service=portfolio_service,
            audit_service=self.audit_service,
        )

    def get_workspace(self, owner_client_id: str) -> TradingWorkspace:
        existing = self.repository.get_workspace(owner_client_id)
        if existing is not None:
            return existing
        workspace = TradingWorkspace(owner_client_id=owner_client_id)
        workspace.provider_statuses = self._provider_statuses()
        return self.repository.save_workspace(workspace)

    def save_workspace(self, workspace: TradingWorkspace) -> TradingWorkspace:
        workspace.updated_at = utc_now_iso()
        workspace.provider_statuses = self._provider_statuses()
        return self.repository.save_workspace(workspace)

    def get_account(self, owner_client_id: str, mode: TradingMode):
        workspace = self.get_workspace(owner_client_id)
        account = self.broker_service.reconcile(workspace.state_for(mode))
        workspace.provider_statuses = self._provider_statuses()
        self.save_workspace(workspace)
        return account

    def get_positions(self, owner_client_id: str, mode: TradingMode):
        workspace = self.get_workspace(owner_client_id)
        account = self.broker_service.reconcile(workspace.state_for(mode))
        self.save_workspace(workspace)
        return account, workspace.state_for(mode).positions

    def get_orders(self, owner_client_id: str, mode: TradingMode):
        workspace = self.get_workspace(owner_client_id)
        self.scheduler.run_order_reconcile(workspace, mode)
        workspace = self.get_workspace(owner_client_id)
        state = workspace.state_for(mode)
        return state.account, state.positions, state.orders

    def get_candidates(
        self,
        owner_client_id: str,
        mode: TradingMode,
        *,
        ip_address: str,
    ):
        workspace = self.get_workspace(owner_client_id)
        state = workspace.state_for(mode)
        if state.autopilot_state == AutopilotState.RUNNING:
            cycle = self.scheduler.run_decision_cycle(
                workspace,
                mode,
                owner_client_id=owner_client_id,
                ip_address=ip_address,
            )
        else:
            cycle = self.scheduler.run_candidate_scan(workspace, mode)
        workspace = self.get_workspace(owner_client_id)
        latest = workspace.state_for(mode).decision_cycles[0] if workspace.state_for(mode).decision_cycles else cycle
        return latest

    def list_decision_cycles(self, owner_client_id: str, mode: TradingMode | None):
        workspace = self.get_workspace(owner_client_id)
        if mode is None:
            return [*workspace.paper.decision_cycles, *workspace.live.decision_cycles]
        return workspace.state_for(mode).decision_cycles

    def update_settings(self, owner_client_id: str, payload: StocksSettingsUpdateRequest):
        workspace = self.get_workspace(owner_client_id)
        update = payload.model_dump(exclude_unset=True)
        current = workspace.settings.model_dump()
        current.update(update)
        workspace.settings = workspace.settings.model_validate(current)
        return self.save_workspace(workspace)

    def set_autopilot_state(
        self,
        owner_client_id: str,
        mode: TradingMode,
        state: AutopilotState,
    ):
        workspace = self.get_workspace(owner_client_id)
        mode_state = workspace.state_for(mode)
        promotion_gate = self.portfolio_service.compute_promotion_gate(workspace)
        if state == AutopilotState.ARMED and mode == TradingMode.LIVE and not promotion_gate.eligible_for_live_arm:
            raise ValueError("Live mode cannot be armed until the promotion gate passes.")
        if state == AutopilotState.RUNNING and mode_state.autopilot_state != AutopilotState.ARMED:
            raise ValueError("Autopilot must be armed before it can run.")
        mode_state.autopilot_state = state
        mode_state.account.autopilot_state = state
        if state != AutopilotState.HALTED:
            mode_state.kill_switch_reason = ""
        self.save_workspace(workspace)
        return mode_state.account, promotion_gate

    def trigger_kill_switch(self, owner_client_id: str, mode: TradingMode, reason: str):
        workspace = self.get_workspace(owner_client_id)
        mode_state = workspace.state_for(mode)
        mode_state.autopilot_state = AutopilotState.HALTED
        mode_state.account.autopilot_state = AutopilotState.HALTED
        mode_state.kill_switch_reason = reason
        self.save_workspace(workspace)
        return mode_state.account

    def promotion_gate(self, owner_client_id: str):
        workspace = self.get_workspace(owner_client_id)
        return self.portfolio_service.compute_promotion_gate(workspace)

    def bootstrap_payload(self, owner_client_id: str):
        workspace = self.get_workspace(owner_client_id)
        return {
            "settings": workspace.settings,
            "modes": [TradingMode.PAPER, TradingMode.LIVE],
            "autopilot_states": list(AutopilotState),
            "strategies": ["trend_follow", "pullback_reclaim", "breakout_confirmation"],
            "provider_statuses": self._provider_statuses(),
            "promotion_gate": self.portfolio_service.compute_promotion_gate(workspace),
        }

    def _provider_statuses(self) -> list[ProviderStatus]:
        return [
            self.market_data_service.provider_status(),
            ProviderStatus(
                provider="alpaca",
                mode=TradingMode.PAPER,
                status=self.broker_service.provider_status_for(TradingMode.PAPER),
                detail="Paper broker route for stock order simulation and API parity.",
            ),
            ProviderStatus(
                provider="alpaca",
                mode=TradingMode.LIVE,
                status=self.broker_service.provider_status_for(TradingMode.LIVE),
                detail=(
                    "Live brokerage account connected."
                    if self.broker_service.provider_status_for(TradingMode.LIVE) == ProviderConnectionStatus.CONNECTED
                    else "Live credentials are missing; live mode stays shadow or simulated."
                ),
            ),
        ]
