import unittest
from unittest.mock import patch

from app.adapters.llm_analysis import (
    LLMOutputValidationError,
    MockAnalysisAdapter,
    OpenAICompatibleAnalysisAdapter,
)
from app.domain.models import (
    AnalysisLoopPlan,
    AnalysisMode,
    AnalysisReport,
    AnalysisSession,
    CalculationTask,
    ChartTask,
    ClarificationQuestion,
    SearchTask,
    UserAnswer,
)
from tests.support import build_test_services


class ExplodingSearchAdapter:
    def run(self, tasks):
        raise RuntimeError("search provider timed out")


class ExplodingCalculationAdapter:
    def run(self, tasks):
        raise RuntimeError("calculation worker offline")


class ExplodingChartAdapter:
    def build_preview(self, session):
        raise RuntimeError("chart renderer crashed")


class SearchPlanningAdapter:
    def generate_initial_questions(self, session):
        return [
            ClarificationQuestion(
                question_text="What matters most?",
                purpose="Need one main objective.",
                options=["Cost", "Risk"],
                allow_skip=False,
            )
        ]

    def plan_next_round(self, session):
        if not session.answers:
            return AnalysisLoopPlan(reasoning_focus="Wait for the answer.", stop_reason="Need first answer.")
        if not session.search_tasks:
            return AnalysisLoopPlan(
                search_tasks=[
                    SearchTask(
                        search_topic="commute costs",
                        search_goal="Find one external comparison fact",
                        search_scope="public web",
                    )
                ],
                reasoning_focus="Gather evidence.",
                stop_reason="Run search first.",
            )
        return AnalysisLoopPlan(
            ready_for_report=True,
            reasoning_focus="Enough context exists.",
            stop_reason="Move to reporting.",
        )

    def build_report(self, session):
        return AnalysisReport(
            summary="A conservative recommendation is still available.",
            recommendations=["Preserve the lower-risk default."],
            markdown="## Summary\n\nA conservative recommendation is still available.",
        )


class CalculationPlanningAdapter(SearchPlanningAdapter):
    def plan_next_round(self, session):
        if not session.answers:
            return AnalysisLoopPlan(reasoning_focus="Wait for the answer.", stop_reason="Need first answer.")
        if not session.calculation_tasks:
            return AnalysisLoopPlan(
                calculation_tasks=[
                    CalculationTask(
                        objective="Driving monthly cost",
                        formula_hint="fuel + parking",
                        input_params={"fuel": 200, "parking": 180},
                        unit="USD",
                    )
                ],
                reasoning_focus="Run deterministic math.",
                stop_reason="Need cost math before reporting.",
            )
        return AnalysisLoopPlan(
            ready_for_report=True,
            reasoning_focus="Enough context exists.",
            stop_reason="Move to reporting.",
        )


class ChartPlanningAdapter(SearchPlanningAdapter):
    def plan_next_round(self, session):
        if not session.answers:
            return AnalysisLoopPlan(reasoning_focus="Wait for the answer.", stop_reason="Need first answer.")
        if not session.chart_tasks:
            return AnalysisLoopPlan(
                chart_tasks=[
                    ChartTask(
                        objective="Compare options",
                        chart_type="bar",
                        title="Option comparison",
                    )
                ],
                reasoning_focus="Render one chart.",
                stop_reason="Need the visualization first.",
            )
        return AnalysisLoopPlan(
            ready_for_report=True,
            reasoning_focus="Enough context exists.",
            stop_reason="Move to reporting.",
        )


class AdapterResilienceTests(unittest.TestCase):
    def _prepare_answered_session(self, services, problem_statement="Should I buy a car?"):
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement=problem_statement,
            owner_client_id="client-1",
        )
        step = services.orchestrator.advance_session(session.session_id)
        services.session_service.record_answers(
            session.session_id,
            [
                UserAnswer(
                    question_id=step.pending_questions[0].question_id,
                    value="I want the lower-risk option.",
                )
            ],
        )
        return session

    def test_search_failure_does_not_crash_the_analysis(self):
        services = build_test_services(
            analysis_adapter=SearchPlanningAdapter(),
            search_adapter=ExplodingSearchAdapter(),
        )
        session = self._prepare_answered_session(services)

        step1 = services.orchestrator.advance_session(session.session_id)
        step2 = services.orchestrator.advance_session(session.session_id)
        persisted = services.session_service.get_session(session.session_id)

        self.assertEqual("ANALYZING", step1.status.value)
        self.assertEqual("READY_FOR_REPORT", step2.status.value)
        self.assertEqual("failed", persisted.search_tasks[0].status)
        self.assertNotEqual("FAILED", persisted.status.value)

    def test_calculation_failure_does_not_block_report_generation(self):
        services = build_test_services(
            analysis_adapter=CalculationPlanningAdapter(),
            calculation_adapter=ExplodingCalculationAdapter(),
        )
        session = self._prepare_answered_session(services)

        step1 = services.orchestrator.advance_session(session.session_id)
        step2 = services.orchestrator.advance_session(session.session_id)
        step3 = services.orchestrator.advance_session(session.session_id)
        persisted = services.session_service.get_session(session.session_id)

        self.assertEqual("ANALYZING", step1.status.value)
        self.assertEqual("READY_FOR_REPORT", step2.status.value)
        self.assertEqual("READY_FOR_EXECUTION", step3.status.value)
        self.assertEqual("failed", persisted.calculation_tasks[0].status)
        self.assertIsNotNone(persisted.report)

    def test_chart_failure_still_allows_final_report_display(self):
        services = build_test_services(
            analysis_adapter=ChartPlanningAdapter(),
            chart_adapter=ExplodingChartAdapter(),
        )
        session = self._prepare_answered_session(services)

        step1 = services.orchestrator.advance_session(session.session_id)
        step2 = services.orchestrator.advance_session(session.session_id)
        step3 = services.orchestrator.advance_session(session.session_id)
        persisted = services.session_service.get_session(session.session_id)

        self.assertEqual("ANALYZING", step1.status.value)
        self.assertEqual("READY_FOR_REPORT", step2.status.value)
        self.assertEqual("READY_FOR_EXECUTION", step3.status.value)
        self.assertEqual("failed", persisted.chart_tasks[0].status)
        self.assertTrue(persisted.report.markdown)

    def test_invalid_llm_report_output_falls_back_to_deterministic_template(self):
        adapter = OpenAICompatibleAnalysisAdapter(
            provider="test",
            base_url="http://example.com",
            api_key="test-key",
            model="test-model",
        )
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I apply for graduate school now or work for two years first?",
        )

        with patch.object(
            adapter,
            "_request_json_with_retry",
            side_effect=LLMOutputValidationError("malformed json"),
        ):
            report = adapter.build_report(session)

        self.assertTrue(report.markdown.strip())
        self.assertTrue(
            any(event.kind == "llm_fallback_to_rwa_template_report" for event in session.events)
        )

    def test_incomplete_user_information_still_produces_a_conservative_report(self):
        services = build_test_services(analysis_adapter=MockAnalysisAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I join an overseas exchange program in my junior year?",
            owner_client_id="client-1",
        )
        step = services.orchestrator.advance_session(session.session_id)
        services.session_service.record_answers(
            session.session_id,
            [
                UserAnswer(
                    question_id=question.question_id,
                    value="I am not sure yet and want a conservative recommendation.",
                )
                for question in step.pending_questions
            ],
        )

        for _ in range(6):
            step = services.orchestrator.advance_session(session.session_id)
            if step.status.value == "READY_FOR_EXECUTION":
                break

        persisted = services.session_service.get_session(session.session_id)
        self.assertEqual("READY_FOR_EXECUTION", persisted.status.value)
        self.assertIsNotNone(persisted.report)
        self.assertNotEqual("", persisted.report.summary)
