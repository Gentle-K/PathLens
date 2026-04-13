from __future__ import annotations

from datetime import datetime, timezone

from app.domain.rwa import ExecutionReceipt, IssuerRequestRecord


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionReceiptsService:
    def __init__(self, *, repository) -> None:
        self.repository = repository

    def save_receipt(self, receipt: ExecutionReceipt) -> ExecutionReceipt:
        receipt.updated_at = _utcnow()
        return self.repository.save_execution_receipt(receipt)

    def get_receipt(self, receipt_id: str) -> ExecutionReceipt | None:
        return self.repository.get_execution_receipt(receipt_id)

    def list_receipts(
        self,
        *,
        session_id: str = "",
        asset_id: str = "",
    ) -> list[ExecutionReceipt]:
        return self.repository.list_execution_receipts(session_id=session_id, asset_id=asset_id)

    def save_issuer_request(self, request: IssuerRequestRecord) -> IssuerRequestRecord:
        request.last_synced_at = _utcnow()
        return self.repository.save_issuer_request(request)

    def get_issuer_request(self, request_id: str) -> IssuerRequestRecord | None:
        return self.repository.get_issuer_request(request_id)

    def list_issuer_requests(self, *, receipt_id: str = "") -> list[IssuerRequestRecord]:
        return self.repository.list_issuer_requests(receipt_id=receipt_id)
