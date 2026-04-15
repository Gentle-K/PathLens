import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.adapters.search import BraveSearchAdapter
from app.domain.models import (
    AnalysisMode,
    AnalysisReport,
    AnalysisSession,
    ClarificationQuestion,
    SessionStatus,
    MajorConclusionItem,
    EvidenceItem,
    SearchTask,
    UserAnswer,
)
from app.domain.rwa import AttestationDraft
from app.main import create_app
from app.orchestrator.engine import AnalysisOrchestrator
from app.persistence.memory import InMemorySessionRepository
from app.rwa.catalog import build_asset_library, build_chain_config
from app.services.audit import AuditLogService
from app.services.eligibility import EligibilityService
from app.services.execution import ExecutionService
from app.services.monitoring import MonitoringService
from app.services.proof import ProofService
from app.services.sessions import SessionService
from app.services.wallets import WalletService
from app.adapters.llm_analysis import OpenAICompatibleAnalysisAdapter
from app.adapters.llm_analysis import MockAnalysisAdapter
from app.config import Settings
from app.prompts.analysis import build_planning_prompts
from tests.support import build_test_services


class RepositoryWithAudit(InMemorySessionRepository):
    def __init__(self) -> None:
        super().__init__()
        self._audit_logs = {}

    def save_audit_log(self, entry):
        self._audit_logs[entry.log_id] = entry
        return entry

    def list_audit_logs(self, limit: int = 200):
        return list(self._audit_logs.values())[:limit]

    def get_audit_log(self, log_id: str):
        return self._audit_logs.get(log_id)


class ExplodingAnalysisAdapter:
    def generate_initial_questions(self, session: AnalysisSession) -> list[ClarificationQuestion]:
        return [
            ClarificationQuestion(
                question_text="What matters most?",
                purpose="Collect the key decision driver.",
                options=["Taste", "Price"],
                allow_skip=False,
                priority=1,
            )
        ]

    def plan_next_round(self, session: AnalysisSession):
        raise ValueError("priority parse exploded")

    def build_report(self, session: AnalysisSession) -> AnalysisReport:
        raise AssertionError("build_report should not be called in this test")


class NoopSearchAdapter:
    def run(self, tasks):
        return []


class NoopCalculationAdapter:
    def run(self, tasks):
        return tasks


class NoopChartAdapter:
    def build_preview(self, session):
        return []


def build_services():
    return build_test_services(
        analysis_adapter=ExplodingAnalysisAdapter(),
        search_adapter=NoopSearchAdapter(),
        calculation_adapter=NoopCalculationAdapter(),
        chart_adapter=NoopChartAdapter(),
        repository=RepositoryWithAudit(),
    )


class PriorityParsingTests(unittest.TestCase):
    def test_parse_questions_accepts_string_priority_and_boolean_like_values(self):
        adapter = OpenAICompatibleAnalysisAdapter(
            provider="test",
            base_url="http://example.com",
            api_key="test-key",
            model="test-model",
        )

        questions = adapter._parse_questions(
            [
                {
                    "question_text": "What still matters?",
                    "purpose": "Check fallback logic.",
                    "options": ["A", "B"],
                    "allow_skip": "false",
                    "priority": "critical",
                }
            ]
        )

        self.assertEqual(1, len(questions))
        self.assertFalse(questions[0].allow_skip)
        self.assertEqual(1, questions[0].priority)

    def test_generate_initial_questions_retries_when_first_payload_is_invalid(self):
        adapter = OpenAICompatibleAnalysisAdapter(
            provider="test",
            base_url="http://example.com",
            api_key="test-key",
            model="test-model",
            retry_attempts=2,
        )
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Estimate the budget for a student competition.",
        )

        with patch.object(
            adapter,
            "_request_json",
            side_effect=[
                {"questions": []},
                {
                    "questions": [
                        {
                            "question_text": "What is the target audience size?",
                            "purpose": "Estimate venue and staffing needs.",
                            "options": ["100", "300", "500"],
                            "priority": 1,
                        }
                    ]
                },
            ],
        ) as request_mock:
            questions = adapter.generate_initial_questions(session)

        self.assertEqual(2, request_mock.call_count)
        self.assertEqual(1, len(questions))
        self.assertTrue(
            any(
                event.kind == "llm_retrying_after_invalid_output"
                for event in session.events
            )
        )

    def test_rwa_locale_switches_mock_questions_and_report_to_english(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="I have 10,000 USDT and want a 30-day balanced RWA allocation on HashKey Chain.",
        )
        adapter = MockAnalysisAdapter()

        questions = adapter.generate_initial_questions(session)
        report = adapter.build_report(session)
        settings = Settings.from_env()
        asset_library = build_asset_library(
            build_chain_config(settings),
            locale="en",
        )

        self.assertTrue(questions)
        self.assertIn("main objective", questions[0].question_text.lower())
        self.assertIn("current setup is best anchored", report.summary.lower())
        self.assertIn("baseline", asset_library[0].description.lower())

    def test_plan_next_round_retries_with_compact_prompt_after_timeout(self):
        adapter = OpenAICompatibleAnalysisAdapter(
            provider="test",
            base_url="http://example.com",
            api_key="test-key",
            model="test-model",
            retry_attempts=2,
            timeout_seconds=5,
        )
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="四个人聚餐, 需要多少预算",
        )
        session.clarification_questions = [
            ClarificationQuestion(
                question_text=f"问题{i}",
                purpose="用于构造较长的 planning prompt",
                options=["A", "B", "C", "D", "E"],
                allow_skip=False,
                priority=1,
                question_group="scope",
                answered=True,
            )
            for i in range(10)
        ]
        for question in session.clarification_questions:
            session.answers.append(UserAnswer(question_id=question.question_id, value="这是一个比较长的回答" * 5))
        session.evidence_items = [
            EvidenceItem(
                title=f"evidence-{i}",
                source_url="https://example.com",
                source_name="example",
                summary="很长的证据摘要" * 40,
                extracted_facts=["事实A" * 30, "事实B" * 30, "事实C" * 30],
                confidence=0.8,
            )
            for i in range(6)
        ]
        session.major_conclusions = [
            MajorConclusionItem(
                content="很长的结论内容" * 30,
                conclusion_type="summary",
                basis_refs=["a", "b", "c"],
                confidence=0.9,
            )
            for _ in range(6)
        ]

        captured_calls = []

        def fake_request_json(**kwargs):
            captured_calls.append(kwargs)
            if len(captured_calls) == 1:
                raise httpx.ReadTimeout("The read operation timed out")
            return {"ready_for_report": True, "major_conclusions": []}

        with patch.object(adapter, "_request_json", side_effect=fake_request_json):
            plan = adapter.plan_next_round(session)

        self.assertTrue(plan.ready_for_report)
        self.assertEqual(2, len(captured_calls))
        self.assertGreater(
            len(captured_calls[0]["user_prompt"]),
            len(captured_calls[1]["user_prompt"]),
        )
        self.assertEqual(5, captured_calls[0]["timeout_seconds"])
        self.assertEqual(10, captured_calls[1]["timeout_seconds"])
        self.assertTrue(
            any(
                event.kind == "llm_retrying_after_timeout"
                and event.payload.get("next_prompt_mode") == "compact"
                for event in session.events
            )
        )


class PlanningPromptTests(unittest.TestCase):
    def test_compact_planning_prompt_is_shorter_than_full_prompt(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="四个人聚餐, 需要多少预算",
        )
        session.clarification_questions = [
            ClarificationQuestion(
                question_text=f"问题{i}" * 10,
                purpose="用途" * 20,
                options=["A", "B", "C", "D", "E"],
                allow_skip=False,
                priority=1,
                question_group="scope",
                answered=True,
            )
            for i in range(10)
        ]
        for question in session.clarification_questions:
            session.answers.append(UserAnswer(question_id=question.question_id, value="回答" * 50))
        session.evidence_items = [
            EvidenceItem(
                title=f"evidence-{i}",
                source_url="https://example.com",
                source_name="example",
                summary="摘要" * 200,
                extracted_facts=["事实1" * 80, "事实2" * 80, "事实3" * 80],
                confidence=0.7,
            )
            for i in range(8)
        ]
        session.major_conclusions = [
            MajorConclusionItem(
                content="结论" * 100,
                conclusion_type="summary",
                basis_refs=["x", "y"],
                confidence=0.8,
            )
            for _ in range(8)
        ]

        _, full_prompt = build_planning_prompts(session, compact=False)
        _, compact_prompt = build_planning_prompts(session, compact=True)

        self.assertLess(len(compact_prompt), len(full_prompt))
        self.assertIn("context_profile=compact", compact_prompt)


class BraveSearchAdapterTests(unittest.TestCase):
    def test_brave_search_adapter_marks_task_failed_after_connect_errors(self):
        adapter = BraveSearchAdapter(
            base_url="https://api.search.brave.com/res/v1/web/search",
            api_key="test-key",
            country="CN",
            search_language="zh-hans",
            ui_language="zh-CN",
            result_count=3,
            extra_snippets=True,
            retry_attempts=2,
        )
        task = SearchTask(
            search_topic="高校场地租赁价格",
            search_goal="获取一线城市高校场地报价",
            search_scope="2024-2025 公开网页",
        )

        with patch(
            "app.adapters.search.httpx.get",
            side_effect=httpx.ConnectError("EOF occurred in violation of protocol"),
        ) as get_mock:
            evidence = adapter.run([task])

        self.assertEqual([], evidence)
        self.assertEqual("failed", task.status)
        self.assertEqual(2, get_mock.call_count)
        self.assertIn("Search failed after 2 attempts", task.notes)


class SessionStepHttpTests(unittest.TestCase):
    def test_step_route_returns_failed_session_instead_of_http_500(self):
        services = build_services()
        app = create_app()

        with patch("app.api.routes.get_app_services", return_value=services):
            client = TestClient(app)
            create_response = client.post(
                "/api/sessions",
                json={
                    "mode": AnalysisMode.MULTI_OPTION.value,
                    "problem_statement": "Should I eat McDonald's tomorrow night?",
                },
            )
            self.assertEqual(200, create_response.status_code)
            session_id = create_response.json()["session_id"]

            session_response = client.get(f"/api/sessions/{session_id}")
            self.assertEqual(200, session_response.status_code)
            question_id = session_response.json()["clarification_questions"][0]["question_id"]

            step_response = client.post(
                f"/api/sessions/{session_id}/step",
                json={
                    "answers": [
                        {
                            "question_id": question_id,
                            "value": "Taste",
                            "source": "frontend",
                        }
                    ]
                },
            )
            self.assertEqual(200, step_response.status_code)
            self.assertEqual("FAILED", step_response.json()["status"])

            saved_session = services.session_service.get_session(session_id)
            self.assertIsNotNone(saved_session)
            self.assertEqual("FAILED", saved_session.status.value)
            self.assertEqual("unexpected_error", saved_session.activity_status)
            self.assertTrue(
                any(
                    event.kind == "orchestrator_unexpected_exception"
                    for event in saved_session.events
                )
            )

    def test_attestation_route_records_transaction_metadata(self):
        services = build_services()
        app = create_app()

        with patch("app.api.routes.get_app_services", return_value=services):
            client = TestClient(app)
            create_response = client.post(
                "/api/sessions",
                json={
                    "mode": AnalysisMode.MULTI_OPTION.value,
                    "problem_statement": "Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                },
            )
            self.assertEqual(200, create_response.status_code)
            session_id = create_response.json()["session_id"]

            saved_session = services.session_service.get_session(session_id)
            self.assertIsNotNone(saved_session)
            saved_session.status = SessionStatus.READY_FOR_EXECUTION
            saved_session.report = AnalysisReport(
                summary="Ready for attestation.",
                assumptions=[],
                recommendations=[],
                open_questions=[],
                chart_refs=[],
                markdown="# HashKey Report",
                chain_config=build_chain_config(Settings.from_env()),
                attestation_draft=AttestationDraft(
                    chain_id=133,
                    network="testnet",
                    report_hash="0x" + ("1" * 64),
                    portfolio_hash="0x" + ("2" * 64),
                    attestation_hash="0x" + ("3" * 64),
                    contract_address="0x0000000000000000000000000000000000000133",
                    explorer_url="https://testnet-explorer.hsk.xyz",
                    ready=True,
                ),
            )
            services.session_service.repository.save(saved_session)

            attestation_response = client.post(
                f"/api/sessions/{session_id}/attestation",
                json={
                    "network": "testnet",
                    "transaction_hash": "0x" + ("a" * 64),
                    "submitted_by": "0x0000000000000000000000000000000000000abc",
                    "block_number": 456789,
                },
            )

            self.assertEqual(200, attestation_response.status_code)
            payload = attestation_response.json()
            self.assertEqual("0x" + ("a" * 64), payload["report"]["attestation_draft"]["transaction_hash"])
            self.assertEqual(456789, payload["report"]["attestation_draft"]["block_number"])
            self.assertTrue(
                payload["report"]["attestation_draft"]["transaction_url"].endswith(
                    "/tx/" + ("0x" + ("a" * 64))
                )
            )

            refreshed_session = services.session_service.get_session(session_id)
            self.assertIsNotNone(refreshed_session)
            self.assertTrue(
                any(event.kind == "attestation_recorded" for event in refreshed_session.events)
            )
            self.assertTrue(
                any(
                    entry.action == "ATTESTATION_RECORDED"
                    for entry in services.audit_log_service.list_logs()
                )
            )


if __name__ == "__main__":
    unittest.main()
