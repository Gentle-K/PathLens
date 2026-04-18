from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.config import Settings
from app.stocks.models import (
    BrokerAccount,
    MarketSnapshot,
    ModeWorkspace,
    OrderIntent,
    OrderLifecycleStatus,
    PositionState,
    ProviderConnectionStatus,
    StockOrder,
    StrategyTemplate,
    TradingMode,
    utc_now_iso,
)


NY_TZ = ZoneInfo("America/New_York")
PAPER_BASE_URL = "https://paper-api.alpaca.markets"
LIVE_BASE_URL = "https://api.alpaca.markets"


class StocksBrokerService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def provider_status_for(self, mode: TradingMode) -> ProviderConnectionStatus:
        key_id = self.settings.alpaca_paper_key_id if mode == TradingMode.PAPER else self.settings.alpaca_live_key_id
        secret = self.settings.alpaca_paper_secret_key if mode == TradingMode.PAPER else self.settings.alpaca_live_secret_key
        if key_id and secret:
            return ProviderConnectionStatus.CONNECTED
        return ProviderConnectionStatus.SIMULATED if mode == TradingMode.PAPER else ProviderConnectionStatus.UNAVAILABLE

    def reconcile(self, state: ModeWorkspace) -> BrokerAccount:
        provider_status = self.provider_status_for(state.mode)
        if provider_status == ProviderConnectionStatus.CONNECTED:
            try:
                account = self._fetch_alpaca_account(state.mode)
                positions = self._fetch_alpaca_positions(state.mode)
                orders = self._fetch_alpaca_orders(state.mode)
                state.positions = positions
                state.orders = orders
                state.account = account
                state.account.autopilot_state = state.autopilot_state
                state.account.kill_switch_active = state.autopilot_state.value == "halted"
                state.last_reconcile_at = utc_now_iso()
                self._append_equity(state)
                return deepcopy(state.account)
            except httpx.HTTPError:
                provider_status = ProviderConnectionStatus.UNAVAILABLE

        snapshots = {item.ticker: item for item in state.latest_snapshots}
        self._revalue_local_positions(state, snapshots)
        state.account.provider_status = provider_status
        state.account.provider_name = (
            "alpaca-paper" if state.mode == TradingMode.PAPER else "alpaca-live"
        ) if provider_status == ProviderConnectionStatus.CONNECTED else (
            "simulated" if provider_status == ProviderConnectionStatus.SIMULATED else "alpaca-unavailable"
        )
        state.account.autopilot_state = state.autopilot_state
        state.account.kill_switch_active = state.autopilot_state.value == "halted"
        state.last_reconcile_at = utc_now_iso()
        self._append_equity(state)
        return deepcopy(state.account)

    def submit_intent(self, state: ModeWorkspace, intent: OrderIntent) -> StockOrder:
        provider_status = self.provider_status_for(state.mode)
        if provider_status == ProviderConnectionStatus.CONNECTED:
            return self._submit_alpaca_order(state, intent)
        return self._submit_local_order(state, intent)

    def _headers_for(self, mode: TradingMode) -> dict[str, str]:
        if mode == TradingMode.PAPER:
            return {
                "APCA-API-KEY-ID": self.settings.alpaca_paper_key_id or "",
                "APCA-API-SECRET-KEY": self.settings.alpaca_paper_secret_key or "",
            }
        return {
            "APCA-API-KEY-ID": self.settings.alpaca_live_key_id or "",
            "APCA-API-SECRET-KEY": self.settings.alpaca_live_secret_key or "",
        }

    def _base_url_for(self, mode: TradingMode) -> str:
        return PAPER_BASE_URL if mode == TradingMode.PAPER else LIVE_BASE_URL

    def _fetch_alpaca_account(self, mode: TradingMode) -> BrokerAccount:
        with httpx.Client(timeout=10.0, headers=self._headers_for(mode)) as client:
            response = client.get(f"{self._base_url_for(mode)}/v2/account")
            response.raise_for_status()
            payload = response.json()
        equity = float(payload.get("equity") or 0.0)
        cash = float(payload.get("cash") or 0.0)
        buying_power = float(payload.get("buying_power") or cash)
        day_pnl = float(payload.get("equity") or 0.0) - float(payload.get("last_equity") or payload.get("equity") or 0.0)
        return BrokerAccount(
            mode=mode,
            equity=equity,
            cash=cash,
            buying_power=buying_power,
            day_pnl=day_pnl,
            gross_exposure_pct=0.0,
            open_positions=0,
            provider_status=ProviderConnectionStatus.CONNECTED,
            provider_name="alpaca-paper" if mode == TradingMode.PAPER else "alpaca-live",
        )

    def _fetch_alpaca_positions(self, mode: TradingMode) -> list[PositionState]:
        with httpx.Client(timeout=10.0, headers=self._headers_for(mode)) as client:
            response = client.get(f"{self._base_url_for(mode)}/v2/positions")
            response.raise_for_status()
            payload = response.json()
        positions: list[PositionState] = []
        for item in payload:
            positions.append(
                PositionState(
                    ticker=str(item.get("symbol", "")),
                    company_name=str(item.get("symbol", "")),
                    mode=mode,
                    quantity=int(float(item.get("qty") or 0)),
                    average_entry_price=float(item.get("avg_entry_price") or 0.0),
                    market_price=float(item.get("current_price") or 0.0),
                    market_value=float(item.get("market_value") or 0.0),
                    unrealized_pnl=float(item.get("unrealized_pl") or 0.0),
                    realized_pnl_today=float(item.get("unrealized_intraday_pl") or 0.0),
                    entry_strategy=StrategyTemplate.TREND_FOLLOW,
                )
            )
        return positions

    def _fetch_alpaca_orders(self, mode: TradingMode) -> list[StockOrder]:
        with httpx.Client(timeout=10.0, headers=self._headers_for(mode)) as client:
            response = client.get(f"{self._base_url_for(mode)}/v2/orders", params={"status": "all", "limit": 100})
            response.raise_for_status()
            payload = response.json()
        orders: list[StockOrder] = []
        status_map = {
            "accepted": OrderLifecycleStatus.SUBMITTED,
            "new": OrderLifecycleStatus.SUBMITTED,
            "partially_filled": OrderLifecycleStatus.SUBMITTED,
            "filled": OrderLifecycleStatus.FILLED,
            "canceled": OrderLifecycleStatus.CANCELED,
            "rejected": OrderLifecycleStatus.REJECTED,
        }
        for item in payload:
            orders.append(
                StockOrder(
                    order_id=str(item.get("id", "")),
                    client_order_id=str(item.get("client_order_id", "")),
                    mode=mode,
                    ticker=str(item.get("symbol", "")),
                    side=str(item.get("side", "")),
                    quantity=int(float(item.get("qty") or 0)),
                    filled_quantity=int(float(item.get("filled_qty") or 0)),
                    limit_price=float(item.get("limit_price") or 0.0),
                    average_fill_price=float(item.get("filled_avg_price") or 0.0),
                    status=status_map.get(str(item.get("status", "")), OrderLifecycleStatus.SUBMITTED),
                    broker="alpaca",
                    submitted_at=str(item.get("submitted_at") or utc_now_iso()),
                    updated_at=str(item.get("updated_at") or utc_now_iso()),
                )
            )
        return orders

    def _submit_alpaca_order(self, state: ModeWorkspace, intent: OrderIntent) -> StockOrder:
        body = {
            "symbol": intent.ticker,
            "qty": str(intent.quantity),
            "side": intent.side,
            "type": "limit",
            "time_in_force": intent.time_in_force,
            "limit_price": str(intent.limit_price),
            "client_order_id": f"ga-{intent.mode.value}-{intent.cycle_id[:8]}-{intent.ticker.lower()}",
            "extended_hours": False,
        }
        with httpx.Client(timeout=10.0, headers=self._headers_for(state.mode)) as client:
            response = client.post(f"{self._base_url_for(state.mode)}/v2/orders", json=body)
            response.raise_for_status()
            payload = response.json()
        order = StockOrder(
            order_id=str(payload.get("id", "")),
            client_order_id=str(payload.get("client_order_id", "")),
            mode=state.mode,
            ticker=intent.ticker,
            side=intent.side,
            quantity=intent.quantity,
            filled_quantity=int(float(payload.get("filled_qty") or 0)),
            limit_price=float(payload.get("limit_price") or intent.limit_price),
            average_fill_price=float(payload.get("filled_avg_price") or 0.0),
            status=OrderLifecycleStatus.SUBMITTED,
            source_intent_id=intent.intent_id,
            broker="alpaca",
        )
        state.orders.insert(0, order)
        return order

    def _submit_local_order(self, state: ModeWorkspace, intent: OrderIntent) -> StockOrder:
        fill_price = intent.limit_price
        order = StockOrder(
            client_order_id=f"ga-{intent.mode.value}-{intent.cycle_id[:8]}-{intent.ticker.lower()}",
            mode=state.mode,
            ticker=intent.ticker,
            side=intent.side,
            quantity=intent.quantity,
            filled_quantity=intent.quantity,
            limit_price=intent.limit_price,
            average_fill_price=fill_price,
            status=OrderLifecycleStatus.FILLED,
            source_intent_id=intent.intent_id,
            broker="simulated",
        )
        self._apply_fill_to_state(state, order)
        state.orders.insert(0, order)
        return order

    def _apply_fill_to_state(self, state: ModeWorkspace, order: StockOrder) -> None:
        if order.side == "buy":
            cost = order.filled_quantity * order.average_fill_price
            state.account.cash -= cost
            position = next((item for item in state.positions if item.ticker == order.ticker), None)
            if position is None:
                stop_price = round(order.average_fill_price * 0.97, 2)
                take_profit_price = round(order.average_fill_price * 1.05, 2)
                state.positions.append(
                    PositionState(
                        ticker=order.ticker,
                        company_name=order.ticker,
                        mode=state.mode,
                        quantity=order.filled_quantity,
                        average_entry_price=order.average_fill_price,
                        market_price=order.average_fill_price,
                        market_value=order.filled_quantity * order.average_fill_price,
                        entry_strategy=StrategyTemplate.TREND_FOLLOW,
                        stop_price=stop_price,
                        take_profit_price=take_profit_price,
                    )
                )
            state.opened_today[order.ticker] = state.opened_today.get(order.ticker, 0) + 1
        else:
            position = next((item for item in state.positions if item.ticker == order.ticker), None)
            if position is not None:
                proceeds = order.filled_quantity * order.average_fill_price
                state.account.cash += proceeds
                realized = (order.average_fill_price - position.average_entry_price) * order.filled_quantity
                state.account.day_pnl += realized
                position.quantity -= order.filled_quantity
                if position.quantity <= 0:
                    state.positions = [item for item in state.positions if item.ticker != order.ticker]
        self._revalue_local_positions(state, {item.ticker: item for item in state.latest_snapshots})

    def _revalue_local_positions(self, state: ModeWorkspace, snapshots: dict[str, MarketSnapshot]) -> None:
        market_value = 0.0
        for position in state.positions:
            snapshot = snapshots.get(position.ticker)
            if snapshot is not None:
                position.market_price = snapshot.last_price
            position.market_value = round(position.quantity * position.market_price, 2)
            position.unrealized_pnl = round(
                (position.market_price - position.average_entry_price) * position.quantity,
                2,
            )
            position.updated_at = utc_now_iso()
            market_value += position.market_value
        state.account.open_positions = len([item for item in state.positions if item.quantity > 0])
        state.account.equity = round(state.account.cash + market_value, 2)
        state.account.buying_power = round(state.account.cash, 2)
        state.account.gross_exposure_pct = round((market_value / state.account.equity), 4) if state.account.equity else 0.0
        state.account.updated_at = utc_now_iso()

    def _append_equity(self, state: ModeWorkspace) -> None:
        state.equity_curve.append({"timestamp": utc_now_iso(), "equity": state.account.equity})  # type: ignore[arg-type]
        del state.equity_curve[:-100]

