from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain.rwa import ExecutionLifecycleStatus, SettlementStatus
from app.services.execution_receipts import ExecutionReceiptsService


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionStatusSyncService:
    def __init__(self, *, receipts_service: ExecutionReceiptsService) -> None:
        self.receipts_service = receipts_service

    def sync_receipt(self, receipt_id: str):
        receipt = self.receipts_service.get_receipt(receipt_id)
        if receipt is None:
            return None
        now = _utcnow()
        if receipt.adapter_kind == "direct_contract" or getattr(receipt.adapter_kind, "value", "") == "direct_contract":
            if receipt.block_number is not None:
                receipt.status = ExecutionLifecycleStatus.COMPLETED
                receipt.settlement_status = SettlementStatus.COMPLETED
            elif receipt.tx_hash:
                receipt.status = ExecutionLifecycleStatus.SUBMITTED
                receipt.settlement_status = (
                    SettlementStatus.DELAYED
                    if receipt.submitted_at and now - receipt.submitted_at > timedelta(hours=4)
                    else SettlementStatus.PENDING
                )
            else:
                receipt.status = ExecutionLifecycleStatus.PREPARED
                receipt.settlement_status = SettlementStatus.NOT_STARTED
        elif receipt.redirect_url:
            if receipt.settlement_status == SettlementStatus.COMPLETED:
                receipt.status = ExecutionLifecycleStatus.COMPLETED
            elif receipt.submitted_at and now - receipt.submitted_at > timedelta(hours=24):
                receipt.status = ExecutionLifecycleStatus.PENDING_SETTLEMENT
                receipt.settlement_status = SettlementStatus.DELAYED
            elif receipt.submitted_at:
                receipt.status = ExecutionLifecycleStatus.REDIRECT_REQUIRED
                receipt.settlement_status = SettlementStatus.PENDING
            else:
                receipt.status = ExecutionLifecycleStatus.PREPARED
                receipt.settlement_status = SettlementStatus.NOT_STARTED
        return self.receipts_service.save_receipt(receipt)

    def sync_session_receipts(self, session_id: str):
        synced = []
        for receipt in self.receipts_service.list_receipts(session_id=session_id):
            updated = self.sync_receipt(receipt.receipt_id)
            if updated is not None:
                synced.append(updated)
        return synced
