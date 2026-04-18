from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.stocks.audit import StocksAuditService
from app.stocks.broker import StocksBrokerService
from app.stocks.decision_engine import StocksDecisionEngine
from app.stocks.execution_router import StocksExecutionRouter
from app.stocks.market_data import StocksMarketDataService
from app.stocks.models import (
    AutopilotState,
    DecisionCycleRecord,
    MarketSnapshot,
    ModeWorkspace,
    OrderLifecycleStatus,
    TaskRunRecord,
    TradeCandidate,
    TradingMode,
    TradingWorkspace,
    utc_now_iso,
)
from app.stocks.portfolio import StocksPortfolioService
from app.stocks.repository import SQLiteStocksRepository, InMemoryStocksRepository
from app.stocks.risk_engine import StocksRiskEngine


NY_TZ = ZoneInfo("America/New_York")


class StocksSchedulerService:
    def __init__(
        self,
        *,
        repository: SQLiteStocksRepository | InMemoryStocksRepository,
        market_data_service: StocksMarketDataService,
        decision_engine: StocksDecisionEngine,
        risk_engine: StocksRiskEngine,
        execution_router: StocksExecutionRouter,
        broker_service: StocksBrokerService,
        portfolio_service: StocksPortfolioService,
        audit_service: StocksAuditService,
    ) -> None:
        self.repository = repository
        self.market_data_service = market_data_service
        self.decision_engine = decision_engine
        self.risk_engine = risk_engine
        self.execution_router = execution_router
        self.broker_service = broker_service
        self.portfolio_service = portfolio_service
        self.audit_service = audit_service

    def run_market_poll(self, workspace: TradingWorkspace, mode: TradingMode) -> TaskRunRecord:
        snapshots, provider_status = self.market_data_service.poll_snapshots(workspace, mode)
        self._upsert_provider_status(workspace, provider_status)
        task = TaskRunRecord(mode=mode, task_name="run_market_poll", summary=f"Polled {len(snapshots)} stock snapshots.")
        workspace.state_for(mode).task_runs.insert(0, task)
        self.repository.save_workspace(workspace)
        return task

    def run_candidate_scan(self, workspace: TradingWorkspace, mode: TradingMode) -> DecisionCycleRecord:
        self.run_market_poll(workspace, mode)
        state = workspace.state_for(mode)
        account = self.broker_service.reconcile(state)
        current_positions = {item.ticker for item in state.positions if item.quantity > 0}
        candidates = [
            self.decision_engine.build_candidate(
                snapshot.ticker,
                snapshot.company_name,
                snapshot,
                state.snapshot_history.get(snapshot.ticker, [snapshot]),
            )
            for snapshot in state.latest_snapshots
        ]
        ai_decisions = self.decision_engine.decide(candidates, current_positions)
        cycle = DecisionCycleRecord(
            mode=mode,
            snapshots=state.latest_snapshots,
            candidates=candidates,
            ai_decisions=ai_decisions,
            account_equity=account.equity,
            market_phase="regular" if self._is_regular_session() else "closed",
            summary=f"Scanned {len(candidates)} symbols and generated {len(ai_decisions)} AI decisions.",
        )
        for decision in ai_decisions:
            snapshot = next((item for item in state.latest_snapshots if item.ticker == decision.ticker), None)
            if snapshot is None:
                continue
            gate = self.risk_engine.evaluate(
                decision=decision,
                snapshot=snapshot,
                account=account,
                positions=state.positions,
                risk_limits=workspace.settings.risk_limits,
                autopilot_state=state.autopilot_state,
                opened_today=state.opened_today,
            )
            cycle.risk_outcomes.append(gate)
            intent = self.execution_router.build_intent(
                cycle_id=cycle.cycle_id,
                mode=mode,
                decision=decision,
                gate=gate,
                snapshot=snapshot,
                positions=state.positions,
            )
            if intent is not None:
                cycle.order_intents.append(intent)
        state.last_candidate_scan_at = utc_now_iso()
        state.decision_cycles.insert(0, cycle)
        del state.decision_cycles[50:]
        self.repository.save_workspace(workspace)
        return cycle

    def run_decision_cycle(
        self,
        workspace: TradingWorkspace,
        mode: TradingMode,
        *,
        owner_client_id: str,
        ip_address: str,
    ) -> DecisionCycleRecord:
        cycle = self.run_candidate_scan(workspace, mode)
        state = workspace.state_for(mode)
        if state.autopilot_state == AutopilotState.RUNNING:
            for intent in cycle.order_intents:
                if intent.risk_gate.status.value == "blocked":
                    intent.status = OrderLifecycleStatus.REJECTED
                    continue
                if intent.risk_gate.status.value == "watch_only":
                    intent.status = OrderLifecycleStatus.READY_NOT_SENT
                    continue
                order = self.broker_service.submit_intent(state, intent)
                intent.status = order.status
                intent.submitted_order_id = order.order_id
                cycle.orders_submitted.append(order.order_id)
            account = self.broker_service.reconcile(state)
            if account.day_pnl <= -(account.equity * workspace.settings.risk_limits.daily_loss_stop_pct):
                state.autopilot_state = AutopilotState.HALTED
                state.kill_switch_reason = "Daily loss stop breached."
        self.audit_service.log(
            owner_client_id=owner_client_id,
            mode=mode,
            ip_address=ip_address,
            action="stocks.decision_cycle",
            summary=f"Decision cycle created with {len(cycle.order_intents)} intents and {len(cycle.orders_submitted)} submitted orders.",
        )
        self.repository.save_workspace(workspace)
        return cycle

    def run_order_reconcile(self, workspace: TradingWorkspace, mode: TradingMode) -> TaskRunRecord:
        account = self.broker_service.reconcile(workspace.state_for(mode))
        task = TaskRunRecord(mode=mode, task_name="run_order_reconcile", summary=f"Account equity now {account.equity:.2f}.")
        workspace.state_for(mode).task_runs.insert(0, task)
        self.repository.save_workspace(workspace)
        return task

    def run_end_of_day_report(self, workspace: TradingWorkspace, mode: TradingMode) -> TaskRunRecord:
        recorded_at = self.portfolio_service.record_end_of_day(workspace.state_for(mode))
        task = TaskRunRecord(mode=mode, task_name="run_end_of_day_report", summary=f"Recorded EOD reset at {recorded_at}.")
        workspace.state_for(mode).task_runs.insert(0, task)
        self.repository.save_workspace(workspace)
        return task

    def _is_regular_session(self) -> bool:
        now = datetime.now(NY_TZ)
        minutes = now.hour * 60 + now.minute
        return 9 * 60 + 30 <= minutes < 16 * 60

    def _upsert_provider_status(self, workspace: TradingWorkspace, next_status) -> None:
        workspace.provider_statuses = [
            status for status in workspace.provider_statuses if status.provider != next_status.provider
        ] + [next_status]

