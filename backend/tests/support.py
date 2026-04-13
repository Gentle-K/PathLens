from __future__ import annotations

from contextlib import ExitStack, contextmanager
from typing import Iterator
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.adapters.calculation import LocalCalculationAdapter
from app.adapters.chart import StructuredChartAdapter
from app.adapters.llm_analysis import MockAnalysisAdapter
from app.adapters.search import MockSearchAdapter
from app.bootstrap import AppServices
from app.main import create_app
from app.orchestrator.engine import AnalysisOrchestrator
from app.persistence.memory import InMemorySessionRepository
from app.repositories.rwa import InMemoryRwaRepository
from app.services.audit import AuditLogService
from app.services.eligibility import EligibilityService
from app.services.execution import ExecutionService
from app.services.execution_receipts import ExecutionReceiptsService
from app.services.execution_status_sync import ExecutionStatusSyncService
from app.services.chain_indexer import ChainIndexerService
from app.services.monitoring import MonitoringService
from app.services.monitoring_scheduler import MonitoringSchedulerService
from app.services.ops_jobs import OpsJobService
from app.services.portfolio_alerts import PortfolioAlertsService
from app.services.proof import ProofService
from app.services.proof_publisher import ProofPublisherService
from app.services.proof_repository import ProofRepositoryService
from app.services.rwa_ops import RwaOpsService
from app.services.sessions import SessionService
from app.services.wallets import WalletService


def build_test_services(
    *,
    analysis_adapter=None,
    search_adapter=None,
    calculation_adapter=None,
    chart_adapter=None,
    repository: InMemorySessionRepository | None = None,
    follow_up_round_limit: int = 3,
) -> AppServices:
    repo = repository or InMemorySessionRepository()
    rwa_repo = InMemoryRwaRepository()
    audit_log_service = AuditLogService(repo)
    session_service = SessionService(
        repo,
        audit_log_service,
        follow_up_round_limit=follow_up_round_limit,
    )
    wallet_service = WalletService()
    eligibility_service = EligibilityService()
    proof_repository_service = ProofRepositoryService(repository=rwa_repo)
    ops_job_service = OpsJobService(repository=rwa_repo)
    proof_publisher_service = ProofPublisherService(repository_service=proof_repository_service)
    execution_receipts_service = ExecutionReceiptsService(repository=rwa_repo)
    execution_status_sync_service = ExecutionStatusSyncService(
        receipts_service=execution_receipts_service,
    )
    portfolio_alerts_service = PortfolioAlertsService(repository=rwa_repo)
    chain_indexer_service = ChainIndexerService(
        repository=rwa_repo,
        session_service=session_service,
        ops_job_service=ops_job_service,
    )
    execution_service = ExecutionService(
        session_service=session_service,
        eligibility_service=eligibility_service,
        receipts_service=execution_receipts_service,
    )
    monitoring_service = MonitoringService(
        session_service=session_service,
        wallet_service=wallet_service,
        receipts_service=execution_receipts_service,
    )
    proof_service = ProofService(
        repository_service=proof_repository_service,
        publisher_service=proof_publisher_service,
    )
    monitoring_scheduler_service = MonitoringSchedulerService(
        execution_status_sync_service=execution_status_sync_service,
        portfolio_alerts_service=portfolio_alerts_service,
        ops_job_service=ops_job_service,
    )
    rwa_ops_service = RwaOpsService(
        proof_service=proof_service,
        proof_repository_service=proof_repository_service,
        proof_publisher_service=proof_publisher_service,
        execution_status_sync_service=execution_status_sync_service,
        execution_receipts_service=execution_receipts_service,
        chain_indexer_service=chain_indexer_service,
        ops_job_service=ops_job_service,
    )
    orchestrator = AnalysisOrchestrator(
        repository=repo,
        audit_log_service=audit_log_service,
        analysis_adapter=analysis_adapter or MockAnalysisAdapter(),
        search_adapter=search_adapter or MockSearchAdapter(),
        calculation_adapter=calculation_adapter or LocalCalculationAdapter(),
        chart_adapter=chart_adapter or StructuredChartAdapter(),
    )
    return AppServices(
        session_service=session_service,
        audit_log_service=audit_log_service,
        orchestrator=orchestrator,
        wallet_service=wallet_service,
        eligibility_service=eligibility_service,
        execution_service=execution_service,
        execution_receipts_service=execution_receipts_service,
        execution_status_sync_service=execution_status_sync_service,
        monitoring_service=monitoring_service,
        monitoring_scheduler_service=monitoring_scheduler_service,
        portfolio_alerts_service=portfolio_alerts_service,
        chain_indexer_service=chain_indexer_service,
        ops_job_service=ops_job_service,
        rwa_ops_service=rwa_ops_service,
        proof_service=proof_service,
        proof_repository_service=proof_repository_service,
        proof_publisher_service=proof_publisher_service,
    )


@contextmanager
def patched_test_client(
    services: AppServices,
    *,
    oracle_snapshots: list[dict] | None = None,
) -> Iterator[TestClient]:
    app = create_app()
    with ExitStack() as stack:
        stack.enter_context(
            patch("app.api.routes.get_app_services", return_value=services)
        )
        stack.enter_context(
            patch("app.api.rwa_routes.get_app_services", return_value=services)
        )
        stack.enter_context(
            patch(
                "app.api.routes.fetch_oracle_snapshots",
                return_value=oracle_snapshots or [],
            )
        )
        stack.enter_context(
            patch(
                "app.api.routes.read_kyc_from_chain",
                side_effect=AssertionError("KYC chain reads should not happen in this test."),
            )
        )
        yield TestClient(app)


def complete_session_via_api(
    client: TestClient,
    session_id: str,
    *,
    answer_value: str,
    max_rounds: int = 10,
) -> dict:
    terminal_report_statuses = {
        "READY_FOR_EXECUTION",
        "EXECUTING",
        "MONITORING",
        "COMPLETED",
    }
    for _ in range(max_rounds):
        session_response = client.get(f"/api/sessions/{session_id}")
        if session_response.status_code != 200:
            raise AssertionError(session_response.text)
        session = session_response.json()
        status = session["status"]
        if status in terminal_report_statuses:
            return session
        if status == "FAILED":
            raise AssertionError(session.get("error_message", "session failed"))

        answers = [
            {
                "question_id": question["question_id"],
                "value": answer_value,
            }
            for question in session.get("clarification_questions", [])
            if not question.get("answered")
        ]

        step_response = client.post(
            f"/api/sessions/{session_id}/step",
            json={"answers": answers},
        )
        if step_response.status_code != 200:
            raise AssertionError(step_response.text)

    raise AssertionError(f"Session {session_id} did not complete within {max_rounds} rounds.")
