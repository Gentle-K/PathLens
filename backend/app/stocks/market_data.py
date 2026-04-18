from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.config import Settings
from app.stocks.models import MarketSnapshot, ModeWorkspace, ProviderConnectionStatus, ProviderStatus, TradingWorkspace, TradingMode, utc_now_iso


NY_TZ = ZoneInfo("America/New_York")

COMPANY_NAMES = {
    "AAPL": "Apple",
    "AMZN": "Amazon",
    "GOOGL": "Alphabet",
    "META": "Meta",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "QQQ": "Invesco QQQ Trust",
    "SPY": "SPDR S&P 500 ETF",
}


class StocksMarketDataService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def provider_status(self) -> ProviderStatus:
        if self.settings.polygon_api_key:
            return ProviderStatus(
                provider="polygon",
                status=ProviderConnectionStatus.CONNECTED,
                detail="Polygon REST snapshot feed is enabled.",
            )
        return ProviderStatus(
            provider="polygon",
            status=ProviderConnectionStatus.SIMULATED,
            detail="POLYGON_API_KEY is missing. Using deterministic simulated snapshots.",
        )

    def poll_snapshots(
        self,
        workspace: TradingWorkspace,
        mode: TradingMode,
    ) -> tuple[list[MarketSnapshot], ProviderStatus]:
        tickers = workspace.settings.whitelist
        status = self.provider_status()
        snapshots = (
            self._fetch_polygon_snapshots(tickers)
            if status.status == ProviderConnectionStatus.CONNECTED
            else self._build_simulated_snapshots(tickers)
        )
        if not snapshots:
            snapshots = self._build_simulated_snapshots(tickers)
            status = ProviderStatus(
                provider="polygon",
                status=ProviderConnectionStatus.SIMULATED,
                detail="Polygon request failed. Fell back to deterministic simulated snapshots.",
            )
        state = workspace.state_for(mode)
        state.latest_snapshots = snapshots
        state.last_market_poll_at = utc_now_iso()
        for snapshot in snapshots:
            history = state.snapshot_history.setdefault(snapshot.ticker, [])
            history.append(snapshot)
            del history[:-24]
        return snapshots, status

    def _fetch_polygon_snapshots(self, tickers: list[str]) -> list[MarketSnapshot]:
        snapshots: list[MarketSnapshot] = []
        headers = {"Authorization": f"Bearer {self.settings.polygon_api_key}"}
        with httpx.Client(timeout=10.0, headers=headers) as client:
            for ticker in tickers:
                response = client.get(
                    f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}"
                )
                response.raise_for_status()
                payload = response.json().get("ticker", {})
                minute = payload.get("min") or {}
                day = payload.get("day") or {}
                prev_day = payload.get("prevDay") or {}
                last_trade = payload.get("lastTrade") or {}
                price = float(last_trade.get("p") or minute.get("c") or day.get("c") or prev_day.get("c") or 0.0)
                previous_close = float(prev_day.get("c") or price or 0.0)
                snapshots.append(
                    MarketSnapshot(
                        ticker=ticker,
                        company_name=COMPANY_NAMES.get(ticker, ticker),
                        as_of=utc_now_iso(),
                        last_price=price,
                        open_price=float(day.get("o") or price),
                        high_price=float(day.get("h") or price),
                        low_price=float(day.get("l") or price),
                        previous_close=previous_close,
                        day_change_pct=((price - previous_close) / previous_close) if previous_close else 0.0,
                        volume=int(day.get("v") or minute.get("v") or 0),
                        average_volume=max(1, int(day.get("v") or minute.get("v") or 1)),
                        minute_close=float(minute.get("c") or price),
                        minute_open=float(minute.get("o") or price),
                        minute_high=float(minute.get("h") or price),
                        minute_low=float(minute.get("l") or price),
                        minute_volume=int(minute.get("v") or 0),
                        source="polygon",
                        source_status=ProviderConnectionStatus.CONNECTED,
                    )
                )
        return snapshots

    def _build_simulated_snapshots(self, tickers: list[str]) -> list[MarketSnapshot]:
        now = datetime.now(NY_TZ)
        minute_bucket = now.hour * 60 + now.minute
        snapshots: list[MarketSnapshot] = []
        for index, ticker in enumerate(tickers):
            anchor = 90.0 + ((sum(ord(char) for char in ticker) % 200) / 3)
            swing = ((minute_bucket + index * 7) % 37) / 100
            drift = (((minute_bucket // 5) % 9) - 4) / 250
            price = round(anchor * (1 + drift + swing / 10), 2)
            previous_close = round(anchor * (1 - 0.004 + index * 0.0008), 2)
            open_price = round(previous_close * (1 + (((minute_bucket % 13) - 6) / 400)), 2)
            high_price = round(max(price, open_price) * 1.004, 2)
            low_price = round(min(price, open_price) * 0.996, 2)
            volume = int(800000 + (minute_bucket * 240) + (index * 15000))
            average_volume = int(1000000 + index * 25000)
            snapshots.append(
                MarketSnapshot(
                    ticker=ticker,
                    company_name=COMPANY_NAMES.get(ticker, ticker),
                    last_price=price,
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    previous_close=previous_close,
                    day_change_pct=((price - previous_close) / previous_close) if previous_close else 0.0,
                    volume=volume,
                    average_volume=average_volume,
                    minute_close=price,
                    minute_open=open_price,
                    minute_high=high_price,
                    minute_low=low_price,
                    minute_volume=max(1000, int(volume * 0.015)),
                    source="simulated",
                    source_status=ProviderConnectionStatus.SIMULATED,
                )
            )
        return snapshots

