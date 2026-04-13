from __future__ import annotations

from datetime import datetime, timezone

from app.domain.models import AnalysisSession
from app.domain.rwa import AssetTemplate, ExecutionLifecycleStatus, PositionSnapshot
from app.rwa.kyc_service import read_kyc_from_chain
from app.services.execution_receipts import ExecutionReceiptsService
from app.services.sessions import SessionService
from app.services.wallets import WalletService


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MonitoringService:
    def __init__(
        self,
        *,
        session_service: SessionService,
        wallet_service: WalletService,
        receipts_service: ExecutionReceiptsService | None = None,
    ) -> None:
        self.session_service = session_service
        self.wallet_service = wallet_service
        self.receipts_service = receipts_service

    def build_monitoring_snapshot(
        self,
        *,
        session: AnalysisSession,
        chain_config,
        assets: list[AssetTemplate],
    ) -> tuple[list[PositionSnapshot], dict[str, float | str | bool | list[str] | dict[str, float]]]:
        address = session.safe_address or session.wallet_address
        network = (
            session.intake_context.wallet_network
            or session.source_chain
            or session.intake_context.source_chain
            or chain_config.default_execution_network
            or "testnet"
        )
        target_asset_id = (
            session.execution_plan.target_asset
            if session.execution_plan is not None
            else ""
        )
        historical_positions = session.position_snapshots
        if address:
            _, live_positions, _ = self.wallet_service.build_wallet_positions(
                address=address,
                chain_config=chain_config,
                assets=assets,
                network=network,
                historical_positions=historical_positions,
            )
        else:
            live_positions = list(historical_positions)

        asset_lookup = {asset.asset_id: asset for asset in assets}
        live_receipts = (
            self.receipts_service.list_receipts(session_id=session.session_id)
            if self.receipts_service is not None
            else []
        )
        latest_receipt_at = max(
            (
                receipt.executed_at
                for receipt in session.transaction_receipts
            ),
            default=None,
        )
        latest_execution_receipt_at = max(
            (receipt.updated_at for receipt in live_receipts),
            default=latest_receipt_at,
        )
        cost_basis = session.ticket_size or session.intake_context.ticket_size or session.intake_context.investment_amount
        accrued_yield = 0.0
        if latest_execution_receipt_at is not None and target_asset_id in asset_lookup:
            held_days = max((_utcnow() - latest_execution_receipt_at).days, 0)
            indicative_yield = asset_lookup[target_asset_id].indicative_yield or asset_lookup[target_asset_id].expected_return_base
            accrued_yield = round(cost_basis * indicative_yield * held_days / 365, 6)

        current_balance = 0.0
        latest_nav_or_price = 0.0
        current_value = 0.0
        realized_income = 0.0
        total_redemption_forecast = 0.0
        next_redemption_window = ""
        oracle_staleness_flag = False
        alert_flags: list[str] = []
        allocation_mix: dict[str, float] = {}

        for snapshot in live_positions:
            asset = asset_lookup.get(snapshot.asset_id)
            if asset is None:
                continue
            snapshot.cost_basis = snapshot.cost_basis or (cost_basis if snapshot.asset_id == target_asset_id else 0.0)
            snapshot.accrued_yield = snapshot.accrued_yield or (accrued_yield if snapshot.asset_id == target_asset_id else 0.0)
            snapshot.realized_income = snapshot.realized_income or round(snapshot.accrued_yield * 0.25, 6)
            snapshot.current_value = round(snapshot.current_balance * max(snapshot.latest_nav_or_price, 0.0), 6)
            snapshot.unrealized_pnl = round(
                snapshot.current_value - snapshot.cost_basis + snapshot.accrued_yield,
                6,
            )
            snapshot.redemption_forecast = round(
                snapshot.current_value * (0.98 if asset.redemption_days and asset.redemption_days > 0 else 1.0),
                6,
            )
            snapshot.liquidity_risk = (
                "high"
                if asset.lockup_days > 0 or asset.execution_style == "issuer_portal"
                else ("medium" if asset.redemption_days > 0 else "low")
            )
            if asset.last_oracle_timestamp is not None:
                age_seconds = (_utcnow() - asset.last_oracle_timestamp).total_seconds()
                snapshot.oracle_staleness_flag = age_seconds > 60 * 60 * 24
            else:
                snapshot.oracle_staleness_flag = not bool(asset.oracle_provider)
            snapshot.next_redemption_window = (
                asset.redemption_window
                or snapshot.next_redemption_window
                or (f"T+{asset.redemption_days}" if asset.redemption_days else "T+0")
            )
            if snapshot.oracle_staleness_flag:
                oracle_staleness_flag = True
            if snapshot.asset_id == target_asset_id or not target_asset_id:
                current_balance += snapshot.current_balance
                current_value += snapshot.current_value
                realized_income += snapshot.realized_income
                total_redemption_forecast += snapshot.redemption_forecast
                latest_nav_or_price = snapshot.latest_nav_or_price
                next_redemption_window = snapshot.next_redemption_window
            allocation_mix[snapshot.asset_id] = snapshot.current_value

        if current_value > 0:
            for snapshot in live_positions:
                snapshot.allocation_weight_pct = round(snapshot.current_value / current_value * 100, 4)
                allocation_mix[snapshot.asset_id] = round(snapshot.allocation_weight_pct, 4)

        kyc_change_flag = False
        if address:
            live_kyc = read_kyc_from_chain(chain_config, address, network)
            previous_level = session.kyc_level or session.intake_context.kyc_level or 0
            previous_status = (session.kyc_status or session.intake_context.kyc_status or "").lower()
            kyc_change_flag = bool(
                live_kyc.level != previous_level
                or (previous_status and live_kyc.status.value.lower() != previous_status)
            )

        if oracle_staleness_flag:
            alert_flags.append("oracle_staleness")
        if kyc_change_flag:
            alert_flags.append("kyc_change")
        if session.execution_status == ExecutionLifecycleStatus.FAILED:
            alert_flags.append("execution_retry_required")

        return live_positions, {
            "current_balance": round(current_balance, 6),
            "latest_nav_or_price": round(latest_nav_or_price, 6),
            "cost_basis": round(cost_basis, 6),
            "unrealized_pnl": round(current_value - cost_basis + accrued_yield, 6),
            "realized_income": round(realized_income, 6),
            "accrued_yield": round(accrued_yield, 6),
            "redemption_forecast": round(total_redemption_forecast, 6),
            "next_redemption_window": next_redemption_window,
            "oracle_staleness_flag": oracle_staleness_flag,
            "kyc_change_flag": kyc_change_flag,
            "alert_flags": alert_flags,
            "allocation_mix": allocation_mix,
        }
