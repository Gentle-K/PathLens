from dataclasses import dataclass

from app.adapters.calculation import DisabledCalculationAdapter, LocalCalculationAdapter
from app.adapters.actuary_expert import RwaActuarialExpertAdapter
from app.adapters.chart import DisabledChartAdapter, MockChartAdapter, StructuredChartAdapter
from app.adapters.llm_analysis import MockAnalysisAdapter, OpenAICompatibleAnalysisAdapter
from app.adapters.search import BraveSearchAdapter, MockSearchAdapter
from app.config import Settings
from app.orchestrator.engine import AnalysisOrchestrator
from app.persistence.sqlite import SQLiteSessionRepository
from app.repositories.rwa import SQLiteRwaRepository
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
from app.stocks.broker import StocksBrokerService
from app.stocks.decision_engine import StocksDecisionEngine
from app.stocks.execution_router import StocksExecutionRouter
from app.stocks.market_data import StocksMarketDataService
from app.stocks.portfolio import StocksPortfolioService
from app.stocks.repository import SQLiteStocksRepository
from app.stocks.risk_engine import StocksRiskEngine
from app.stocks.service import StocksTradingService


@dataclass
class AppServices:
    session_service: SessionService
    audit_log_service: AuditLogService
    orchestrator: AnalysisOrchestrator
    wallet_service: WalletService
    eligibility_service: EligibilityService
    execution_service: ExecutionService
    execution_receipts_service: ExecutionReceiptsService
    execution_status_sync_service: ExecutionStatusSyncService
    monitoring_service: MonitoringService
    monitoring_scheduler_service: MonitoringSchedulerService
    portfolio_alerts_service: PortfolioAlertsService
    chain_indexer_service: ChainIndexerService
    ops_job_service: OpsJobService
    rwa_ops_service: RwaOpsService
    proof_service: ProofService
    proof_repository_service: ProofRepositoryService
    proof_publisher_service: ProofPublisherService
    stocks_trading_service: StocksTradingService | None = None


_services: AppServices | None = None


def _create_analysis_adapter(
    settings: Settings,
) -> MockAnalysisAdapter | OpenAICompatibleAnalysisAdapter | RwaActuarialExpertAdapter:
    adapter: MockAnalysisAdapter | OpenAICompatibleAnalysisAdapter
    if settings.analysis_adapter == "mock":
        adapter = MockAnalysisAdapter()
    elif settings.analysis_adapter in {"openai", "openai_compatible"}:
        if not settings.analysis_api_key:
            raise RuntimeError(
                "ANALYSIS_API_KEY is required when ANALYSIS_ADAPTER=openai_compatible."
            )
        adapter = OpenAICompatibleAnalysisAdapter(
            provider=settings.analysis_provider,
            base_url=settings.analysis_api_base_url,
            api_key=settings.analysis_api_key,
            model=settings.analysis_model,
            timeout_seconds=settings.analysis_timeout_seconds,
            retry_attempts=settings.analysis_retry_attempts,
        )
    else:
        raise RuntimeError(
            f"Unsupported ANALYSIS_ADAPTER value: {settings.analysis_adapter}."
        )

    if settings.actuary_expert_mode not in {"", "off", "disabled"}:
        return RwaActuarialExpertAdapter(
            delegate=adapter,
            settings=settings,
        )
    return adapter


def _create_search_adapter(settings: Settings) -> MockSearchAdapter | BraveSearchAdapter:
    if settings.search_adapter == "mock":
        return MockSearchAdapter()

    if settings.search_adapter == "brave":
        if not settings.search_api_key:
            raise RuntimeError(
                "SEARCH_API_KEY is required when SEARCH_ADAPTER=brave."
            )
        return BraveSearchAdapter(
            base_url=settings.search_api_base_url,
            api_key=settings.search_api_key,
            country=settings.search_country,
            search_language=settings.search_language,
            ui_language=settings.search_ui_language,
            result_count=settings.search_result_count,
            extra_snippets=settings.search_extra_snippets,
            retry_attempts=settings.analysis_retry_attempts,
        )

    raise RuntimeError(
        f"Unsupported SEARCH_ADAPTER value: {settings.search_adapter}."
    )


def _create_chart_adapter(
    settings: Settings,
) -> MockChartAdapter | DisabledChartAdapter | StructuredChartAdapter:
    if settings.chart_adapter == "disabled":
        return DisabledChartAdapter()
    if settings.chart_adapter == "mock":
        return MockChartAdapter()
    if settings.chart_adapter in {"structured", "local"}:
        return StructuredChartAdapter()
    raise RuntimeError(
        f"Unsupported CHART_ADAPTER value: {settings.chart_adapter}."
    )


def _create_calculation_adapter(
    settings: Settings,
) -> LocalCalculationAdapter | DisabledCalculationAdapter:
    if settings.calculation_mcp_enabled:
        return LocalCalculationAdapter()
    return DisabledCalculationAdapter()


def get_app_services() -> AppServices:
    global _services
    if _services is None:
        settings = Settings.from_env()
        repository = SQLiteSessionRepository(str(settings.session_db_path))
        rwa_repository = SQLiteRwaRepository(str(settings.session_db_path))
        stocks_repository = SQLiteStocksRepository(str(settings.session_db_path))
        audit_log_service = AuditLogService(repository)
        session_service = SessionService(
            repository,
            audit_log_service,
            follow_up_round_limit=settings.clarification_follow_up_round_limit,
        )
        wallet_service = WalletService()
        eligibility_service = EligibilityService()
        proof_repository_service = ProofRepositoryService(repository=rwa_repository)
        ops_job_service = OpsJobService(repository=rwa_repository)
        proof_publisher_service = ProofPublisherService(
            repository_service=proof_repository_service,
            settings=settings,
        )
        execution_receipts_service = ExecutionReceiptsService(repository=rwa_repository)
        execution_status_sync_service = ExecutionStatusSyncService(
            receipts_service=execution_receipts_service,
        )
        portfolio_alerts_service = PortfolioAlertsService(repository=rwa_repository)
        chain_indexer_service = ChainIndexerService(
            repository=rwa_repository,
            session_service=session_service,
            settings=settings,
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
        stocks_trading_service = StocksTradingService(
            repository=stocks_repository,
            market_data_service=StocksMarketDataService(settings),
            broker_service=StocksBrokerService(settings),
            decision_engine=StocksDecisionEngine(),
            risk_engine=StocksRiskEngine(),
            execution_router=StocksExecutionRouter(),
            portfolio_service=StocksPortfolioService(),
            audit_log_service=audit_log_service,
        )
        orchestrator = AnalysisOrchestrator(
            repository=repository,
            audit_log_service=audit_log_service,
            analysis_adapter=_create_analysis_adapter(settings),
            search_adapter=_create_search_adapter(settings),
            calculation_adapter=_create_calculation_adapter(settings),
            chart_adapter=_create_chart_adapter(settings),
        )
        _services = AppServices(
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
            stocks_trading_service=stocks_trading_service,
        )
    return _services
