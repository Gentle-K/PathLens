from __future__ import annotations

from datetime import datetime, timezone

from app.domain.rwa import DebugOperationReceipt, OpsJobRun


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OpsJobService:
    def __init__(self, *, repository) -> None:
        self.repository = repository

    def start_job(
        self,
        *,
        job_name: str,
        network: str = "",
        metadata: dict[str, object] | None = None,
    ) -> OpsJobRun:
        job_run = OpsJobRun(
            job_name=job_name,
            network=network,
            status="running",
            started_at=_utcnow(),
            metadata=metadata or {},
        )
        return self.repository.save_ops_job_run(job_run)

    def finish_job(
        self,
        job_run: OpsJobRun,
        *,
        status: str,
        item_count: int = 0,
        error_message: str = "",
        metadata: dict[str, object] | None = None,
    ) -> OpsJobRun:
        job_run.status = status
        job_run.finished_at = _utcnow()
        job_run.item_count = item_count
        job_run.error_message = error_message
        if metadata:
            job_run.metadata = {
                **job_run.metadata,
                **metadata,
            }
        return self.repository.save_ops_job_run(job_run)

    def list_jobs(self, *, limit: int = 20) -> list[OpsJobRun]:
        return self.repository.list_ops_job_runs(limit=limit)

    @staticmethod
    def to_receipt(job_run: OpsJobRun) -> DebugOperationReceipt:
        return DebugOperationReceipt(
            operation_id=job_run.job_run_id,
            status=job_run.status,
            started_at=job_run.started_at,
            finished_at=job_run.finished_at,
            error_message=job_run.error_message,
            item_count=job_run.item_count,
            metadata=dict(job_run.metadata),
        )
