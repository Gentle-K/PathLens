from __future__ import annotations


class MonitoringSchedulerService:
    def __init__(
        self,
        *,
        execution_status_sync_service,
        portfolio_alerts_service,
        ops_job_service=None,
    ) -> None:
        self.execution_status_sync_service = execution_status_sync_service
        self.portfolio_alerts_service = portfolio_alerts_service
        self.ops_job_service = ops_job_service

    def run_for_session(
        self,
        *,
        session_id: str,
        address: str,
        proof_snapshots,
        positions,
        receipts,
        kyc_change_flag: bool = False,
    ):
        job_run = (
            self.ops_job_service.start_job(job_name="monitoring_scheduler")
            if self.ops_job_service is not None
            else None
        )
        self.execution_status_sync_service.sync_session_receipts(session_id)
        alerts = self.portfolio_alerts_service.build_and_persist_alerts(
            address=address,
            proof_snapshots=proof_snapshots,
            positions=positions,
            receipts=receipts,
            kyc_change_flag=kyc_change_flag,
        )
        if job_run is not None:
            self.ops_job_service.finish_job(job_run, status="success", item_count=len(alerts))
        return alerts

    def run_for_portfolio(
        self,
        *,
        address: str,
        proof_snapshots,
        positions,
        receipts,
        kyc_change_flag: bool = False,
    ):
        job_run = (
            self.ops_job_service.start_job(job_name="monitoring_scheduler")
            if self.ops_job_service is not None
            else None
        )
        alerts = self.portfolio_alerts_service.build_and_persist_alerts(
            address=address,
            proof_snapshots=proof_snapshots,
            positions=positions,
            receipts=receipts,
            kyc_change_flag=kyc_change_flag,
        )
        if job_run is not None:
            self.ops_job_service.finish_job(job_run, status="success", item_count=len(alerts))
        return alerts
