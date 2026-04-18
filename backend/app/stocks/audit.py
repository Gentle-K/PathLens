from __future__ import annotations

from app.services.audit import AuditLogService
from app.stocks.models import TradingMode


class StocksAuditService:
    def __init__(self, audit_log_service: AuditLogService) -> None:
        self.audit_log_service = audit_log_service

    def log(
        self,
        *,
        owner_client_id: str,
        mode: TradingMode,
        ip_address: str,
        action: str,
        summary: str,
        status: str = "success",
    ) -> None:
        self.audit_log_service.write(
            action=action,
            actor=owner_client_id,
            target=f"stocks:{mode.value}",
            ip_address=ip_address,
            summary=summary,
            status=status,
            metadata={"product": "stocks"},
        )

