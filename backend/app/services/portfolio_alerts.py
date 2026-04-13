from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from app.domain.rwa import (
    AlertEventStatus,
    AssetProofSnapshot,
    ExecutionReceipt,
    ExecutionLifecycleStatus,
    PortfolioAlert,
    PortfolioAlertAck,
    PositionSnapshot,
    SettlementStatus,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dedupe_key(*parts: str) -> str:
    joined = "::".join(part.strip() for part in parts if part)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:24]


class PortfolioAlertsService:
    def __init__(self, *, repository) -> None:
        self.repository = repository

    def build_and_persist_alerts(
        self,
        *,
        address: str,
        proof_snapshots: list[AssetProofSnapshot],
        positions: list[PositionSnapshot],
        receipts: list[ExecutionReceipt] | None = None,
        kyc_change_flag: bool = False,
    ) -> list[PortfolioAlert]:
        receipts = receipts or []
        proof_by_asset = {item.asset_id: item for item in proof_snapshots}
        alerts: list[PortfolioAlert] = []
        now = _utcnow()

        for position in positions:
            proof = proof_by_asset.get(position.asset_id)
            if proof and proof.proof_freshness.bucket in {"stale", "unavailable"}:
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="proof_expired",
                            severity="critical" if proof.proof_freshness.bucket == "unavailable" else "warning",
                            title=f"{position.asset_name}: proof freshness degraded",
                            detail=proof.proof_freshness.reason,
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            source_url=proof.registry_explorer_url or proof.primary_action_url,
                            source_ref=proof.snapshot_hash,
                            dedupe_key=_dedupe_key(position.asset_id, "proof_expired", proof.snapshot_hash),
                        )
                    )
                )
            if position.oracle_staleness_flag:
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="oracle_stale",
                            severity="warning",
                            title=f"{position.asset_name}: oracle may be stale",
                            detail="Latest monitored price data should be refreshed before relying on this position.",
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            dedupe_key=_dedupe_key(position.asset_id, "oracle_stale", position.next_redemption_window),
                        )
                    )
                )
            if position.kyc_change_flag or kyc_change_flag:
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="kyc_changed",
                            severity="warning",
                            title=f"{position.asset_name}: KYC or whitelist status changed",
                            detail="Re-check investor eligibility before transfer or redemption.",
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            dedupe_key=_dedupe_key(position.asset_id, "kyc_changed"),
                        )
                    )
                )
            if proof and proof.redemption_window.status in {"open", "scheduled"} and proof.redemption_window.next_window:
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="redemption_window_opened",
                            severity="info",
                            title=f"{position.asset_name}: redemption window tracked",
                            detail=f"Next redemption window: {proof.redemption_window.next_window}",
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            dedupe_key=_dedupe_key(position.asset_id, "redemption_window_opened", proof.redemption_window.next_window),
                        )
                    )
                )
            if proof and proof.redemption_window.status == "scheduled":
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="redemption_window_closing_soon",
                            severity="warning",
                            title=f"{position.asset_name}: redemption window requires attention",
                            detail=proof.redemption_window.detail,
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            dedupe_key=_dedupe_key(position.asset_id, "redemption_window_closing_soon", proof.redemption_window.next_window),
                        )
                    )
                )
            if proof and proof.execution_adapter_kind.value == "issuer_portal":
                alerts.append(
                    self._upsert_alert(
                        PortfolioAlert(
                            address=address,
                            alert_type="issuer_disclosure_updated",
                            severity="info",
                            title=f"{position.asset_name}: issuer workflow governs settlement",
                            detail=proof.redemption_window.detail,
                            asset_id=position.asset_id,
                            asset_name=position.asset_name,
                            source_url=proof.primary_action_url,
                            dedupe_key=_dedupe_key(position.asset_id, "issuer_disclosure_updated", proof.snapshot_hash),
                        )
                    )
                )

        for receipt in receipts:
            if receipt.status in {ExecutionLifecycleStatus.PENDING_SETTLEMENT, ExecutionLifecycleStatus.REDIRECT_REQUIRED}:
                age = now - (receipt.submitted_at or now)
                if age > timedelta(hours=4):
                    alerts.append(
                        self._upsert_alert(
                            PortfolioAlert(
                                address=address,
                                alert_type="execution_settlement_delayed",
                                severity="critical"
                                if receipt.settlement_status == SettlementStatus.DELAYED
                                else "warning",
                                title=f"{receipt.asset_id}: execution settlement delayed",
                                detail=receipt.failure_reason
                                or "Execution remains incomplete and should be followed up.",
                                asset_id=receipt.asset_id,
                                asset_name=receipt.asset_id,
                                source_ref=receipt.receipt_id,
                                dedupe_key=_dedupe_key(receipt.asset_id, "execution_settlement_delayed", receipt.receipt_id),
                            )
                        )
                    )

        unique: dict[str, PortfolioAlert] = {}
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        for alert in alerts:
            current = unique.get(alert.dedupe_key)
            if current is None or severity_order.get(alert.severity, 9) < severity_order.get(current.severity, 9):
                unique[alert.dedupe_key] = alert
        return sorted(
            unique.values(),
            key=lambda item: (severity_order.get(item.severity, 9), -item.detected_at.timestamp()),
        )

    def ack_alert(self, *, address: str, alert_id: str) -> PortfolioAlertAck | None:
        alert = self.repository.get_alert(alert_id)
        if alert is None:
            return None
        state = self.repository.get_alert_state(address=address, alert_id=alert_id) or PortfolioAlertAck(
            alert_id=alert_id,
            address=address,
        )
        state.acked = True
        state.acknowledged_at = _utcnow()
        return self.repository.save_alert_state(state)

    def read_alert(self, *, address: str, alert_id: str) -> PortfolioAlertAck | None:
        alert = self.repository.get_alert(alert_id)
        if alert is None:
            return None
        state = self.repository.get_alert_state(address=address, alert_id=alert_id) or PortfolioAlertAck(
            alert_id=alert_id,
            address=address,
        )
        state.read = True
        state.read_at = _utcnow()
        return self.repository.save_alert_state(state)

    def list_alerts(self, *, address: str, include_resolved: bool = True) -> list[PortfolioAlert]:
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        return sorted(
            self.repository.list_alerts(address=address, include_resolved=include_resolved),
            key=lambda item: (severity_order.get(item.severity, 9), -item.detected_at.timestamp()),
        )

    def _upsert_alert(self, alert: PortfolioAlert) -> PortfolioAlert:
        existing = self.repository.find_alert_by_dedupe_key(address=alert.address, dedupe_key=alert.dedupe_key)
        if existing is not None:
            alert.alert_id = existing.alert_id
            alert.detected_at = existing.detected_at
            alert.acked = existing.acked
            alert.acknowledged_at = existing.acknowledged_at
            alert.read = existing.read
            alert.read_at = existing.read_at
            if existing.status == AlertEventStatus.RESOLVED:
                alert.status = AlertEventStatus.OPEN
                alert.resolved_at = None
        return self.repository.save_alert_event(alert)
