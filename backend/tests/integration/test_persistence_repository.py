import tempfile
import unittest

from app.config import Settings
from app.domain.models import AnalysisMode
from app.persistence.sqlite import SQLiteSessionRepository
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.engine import build_rwa_report
from app.services.audit import AuditLogService
from app.services.sessions import SessionService


class SQLitePersistenceIntegrationTests(unittest.TestCase):
    def test_sqlite_repository_round_trip_and_owner_lookup(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repository = SQLiteSessionRepository(f"{tmpdir}/sessions.db")
            audit_service = AuditLogService(repository)
            session_service = SessionService(repository, audit_service)

            session = session_service.create_session(
                mode=AnalysisMode.MULTI_OPTION,
                problem_statement="Should I buy a car or continue using public transit?",
                owner_client_id="client-1",
                locale="en",
            )

            loaded = session_service.get_session(session.session_id)
            owner_sessions = session_service.list_sessions_by_owner("client-1")

            self.assertIsNotNone(loaded)
            self.assertEqual(session.session_id, loaded.session_id)
            self.assertEqual(1, len(owner_sessions))

    def test_request_more_follow_up_persists_comparable_report_snapshot(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repository = SQLiteSessionRepository(f"{tmpdir}/sessions.db")
            audit_service = AuditLogService(repository)
            session_service = SessionService(repository, audit_service)
            settings = Settings.from_env()
            chain_config = build_chain_config(settings)
            asset_library = build_asset_library(chain_config, locale="en")

            session = session_service.create_session(
                mode=AnalysisMode.MULTI_OPTION,
                problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                owner_client_id="client-1",
                locale="en",
            )
            report, _ = build_rwa_report(
                mode=AnalysisMode.MULTI_OPTION,
                problem_statement=session.problem_statement,
                context=session.intake_context,
                chain_config=chain_config,
                asset_library=asset_library,
                locale="en",
            )
            raw = repository.get(session.session_id)
            raw.status = raw.status.COMPLETED
            raw.report = report
            repository.save(raw)

            updated = session_service.request_more_follow_up(session.session_id)
            reloaded = session_service.get_session(session.session_id)

            self.assertEqual(1, len(updated.report_snapshots))
            self.assertEqual(1, len(reloaded.report_snapshots))
            self.assertEqual("ANALYZING", updated.status.value)
            self.assertEqual(1, updated.follow_up_extensions_used)
