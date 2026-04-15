import unittest

from app.adapters.calculation import LocalCalculationAdapter
from app.adapters.chart import StructuredChartAdapter
from app.domain.models import (
    AnalysisLoopPlan,
    AnalysisMode,
    AnalysisReport,
    AnalysisSession,
    CalculationTask,
    ChartTask,
    ClarificationQuestion,
    MajorConclusionItem,
    UserAnswer,
)
from app.orchestrator.engine import AnalysisOrchestrator
from app.persistence.memory import InMemorySessionRepository
from app.services.audit import AuditLogService
from app.services.sessions import SessionService


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


class NoopSearchAdapter:
    def run(self, tasks):
        for task in tasks:
            task.status = "completed"
        return []


class PlanningMathChartAnalysisAdapter:
    def generate_initial_questions(
        self,
        session: AnalysisSession,
    ) -> list[ClarificationQuestion]:
        return [
            ClarificationQuestion(
                question_text="What matters most for this decision?",
                purpose="Capture the primary optimization target.",
                options=["Lower total cost", "Lower risk", "Higher upside"],
                priority=1,
            )
        ]

    def plan_next_round(self, session: AnalysisSession) -> AnalysisLoopPlan:
        if not session.answers:
            return AnalysisLoopPlan(
                reasoning_focus="Collect the primary decision objective first.",
                stop_reason="Waiting for the user's first clarification answer.",
                major_conclusions=[
                    MajorConclusionItem(
                        content="A concrete objective is required before deterministic comparison tasks are useful.",
                        conclusion_type="inference",
                        confidence=0.62,
                    )
                ],
            )

        if not session.calculation_tasks:
            return AnalysisLoopPlan(
                calculation_tasks=[
                    CalculationTask(
                        objective="Option A total cost",
                        formula_hint="base_cost + travel_cost",
                        input_params={
                            "base_cost": 120,
                            "travel_cost": 30,
                        },
                        unit="USD",
                    ),
                    CalculationTask(
                        objective="Option B total cost",
                        formula_hint="base_cost + subscription_cost",
                        input_params={
                            "base_cost": 100,
                            "subscription_cost": 80,
                        },
                        unit="USD",
                    ),
                ],
                chart_tasks=[
                    ChartTask(
                        objective="Compare the deterministic total cost of each option.",
                        chart_type="bar",
                        title="Option Cost Comparison",
                        preferred_unit="USD",
                    )
                ],
                major_conclusions=[
                    MajorConclusionItem(
                        content="The current user objective is specific enough to justify deterministic cost calculations.",
                        conclusion_type="fact",
                        confidence=0.81,
                    )
                ],
                reasoning_focus="Convert the current option set into deterministic numeric comparisons.",
                stop_reason="Run calculation and chart MCP tasks before the next reasoning round.",
            )

        return AnalysisLoopPlan(
            ready_for_report=True,
            major_conclusions=[
                MajorConclusionItem(
                    content="Option A has the lower deterministic total cost in the current scenario.",
                    conclusion_type="fact",
                    basis_refs=["Option Cost Comparison"],
                    confidence=0.92,
                )
            ],
            reasoning_focus="The deterministic comparison is complete.",
            stop_reason="The numeric comparison is complete and ready for final reporting.",
        )

    def build_report(self, session: AnalysisSession) -> AnalysisReport:
        return AnalysisReport(
            summary="Option A is cheaper than Option B under the provided deterministic inputs.",
            assumptions=["The provided cost inputs are complete and current."],
            recommendations=["Prefer Option A if minimizing deterministic cost is the primary goal."],
            open_questions=[],
            chart_refs=[artifact.chart_id for artifact in session.chart_artifacts],
            markdown=(
                "## Recommendation\n"
                "Option A is cheaper than Option B under the current deterministic inputs.\n\n"
                "## Why\n"
                "- Option A total cost = 150 USD\n"
                "- Option B total cost = 180 USD"
            ),
        )


class CalculationAdapterTests(unittest.TestCase):
    def test_local_calculation_adapter_evaluates_formula(self):
        task = CalculationTask(
            objective="Break-even units",
            formula_hint="fixed_cost / (unit_price - unit_cost)",
            input_params={
                "fixed_cost": 1500,
                "unit_price": 35,
                "unit_cost": 20,
            },
            unit="units",
        )

        LocalCalculationAdapter().run([task])

        self.assertEqual("completed", task.status)
        self.assertEqual(100.0, task.result_value)
        self.assertEqual("100", task.result_text)

    def test_local_calculation_adapter_rejects_natural_language_formula(self):
        task = CalculationTask(
            objective="Invalid task",
            formula_hint="待搜索数据填充",
            input_params={"principal": 1000},
            unit="USDT",
        )

        LocalCalculationAdapter().run([task])

        self.assertEqual("rejected", task.status)
        self.assertEqual("rejected", task.validation_state)
        self.assertFalse(task.user_visible)
        self.assertIn("formula", task.failure_reason.lower())


class ChartAdapterTests(unittest.TestCase):
    def test_structured_chart_adapter_builds_artifact_from_completed_calculations(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Which option is cheaper?",
        )
        session.calculation_tasks = [
            CalculationTask(
                objective="Option A total cost",
                formula_hint="100 + 50",
                input_params={"base_cost": 100, "travel_cost": 50},
                unit="USD",
                result_value=150,
                result_text="150",
                status="completed",
            ),
            CalculationTask(
                objective="Option B total cost",
                formula_hint="100 + 80",
                input_params={"base_cost": 100, "subscription_cost": 80},
                unit="USD",
                result_value=180,
                result_text="180",
                status="completed",
            ),
        ]
        session.chart_tasks = [
            ChartTask(
                objective="Compare option costs",
                chart_type="bar",
                title="Option Cost Comparison",
                preferred_unit="USD",
            )
        ]

        artifacts = StructuredChartAdapter().build_preview(session)

        self.assertEqual(1, len(artifacts))
        self.assertEqual("completed", session.chart_tasks[0].status)
        self.assertEqual("bar", artifacts[0].chart_type)
        self.assertEqual(
            ["Option A total cost", "Option B total cost"],
            artifacts[0].spec["categories"],
        )


class OrchestratorMcpPipelineTests(unittest.TestCase):
    def test_orchestrator_runs_calculation_and_chart_pipeline(self):
        repository = RepositoryWithAudit()
        audit_log_service = AuditLogService(repository)
        session_service = SessionService(repository, audit_log_service)
        orchestrator = AnalysisOrchestrator(
            repository=repository,
            audit_log_service=audit_log_service,
            analysis_adapter=PlanningMathChartAnalysisAdapter(),
            search_adapter=NoopSearchAdapter(),
            calculation_adapter=LocalCalculationAdapter(),
            chart_adapter=StructuredChartAdapter(),
        )

        session = session_service.create_session(
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Should I choose option A or option B if cost matters most?",
            owner_client_id="client-1",
        )

        step1 = orchestrator.advance_session(session.session_id)
        self.assertEqual("ask_user", step1.next_action.value)
        question_id = step1.pending_questions[0].question_id

        session_service.record_answers(
            session.session_id,
            [
                UserAnswer(
                    question_id=question_id,
                    value="Lower total cost",
                    source="frontend",
                )
            ],
        )

        step2 = orchestrator.advance_session(session.session_id)
        self.assertEqual("ANALYZING", step2.status.value)
        self.assertEqual("run_mcp", step2.next_action.value)
        saved_after_plan = session_service.get_session(session.session_id)
        self.assertIsNotNone(saved_after_plan)
        self.assertEqual(2, len(saved_after_plan.calculation_tasks))
        self.assertEqual(1, len(saved_after_plan.chart_tasks))

        step3 = orchestrator.advance_session(session.session_id)
        self.assertEqual("READY_FOR_REPORT", step3.status.value)
        saved_after_mcp = session_service.get_session(session.session_id)
        self.assertIsNotNone(saved_after_mcp)
        self.assertEqual(
            [150.0, 180.0],
            [task.result_value for task in saved_after_mcp.calculation_tasks],
        )
        self.assertEqual(1, len(saved_after_mcp.chart_artifacts))

        step4 = orchestrator.advance_session(session.session_id)
        self.assertEqual("READY_FOR_EXECUTION", step4.status.value)
        saved_final = session_service.get_session(session.session_id)
        self.assertIsNotNone(saved_final)
        self.assertIsNotNone(saved_final.report)
        self.assertEqual(1, len(saved_final.report.chart_refs))

    def test_session_service_sanitizes_duplicate_and_invalid_calculations_on_read(self):
        repository = RepositoryWithAudit()
        audit_log_service = AuditLogService(repository)
        session_service = SessionService(repository, audit_log_service)

        session = session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
            owner_client_id="client-1",
        )
        raw = repository.get(session.session_id)
        self.assertIsNotNone(raw)
        raw.calculation_tasks = [
            CalculationTask(
                objective="Visible task",
                formula_hint="principal * (1 + annual_return)",
                input_params={"principal": 10000, "annual_return": 0.01},
                unit="USDT",
                result_value=10100,
                result_text="10100",
                status="completed",
            ),
            CalculationTask(
                objective="Visible task duplicate wording",
                formula_hint="principal * (1 + annual_return)",
                input_params={"principal": 10000, "annual_return": 0.01},
                unit="USDT",
                result_value=10100,
                result_text="10100",
                status="completed",
            ),
            CalculationTask(
                objective="Rejected task",
                formula_hint="待搜索数据填充",
                input_params={"principal": 10000},
                unit="USDT",
                status="failed",
            ),
        ]
        repository.save(raw)

        sanitized = session_service.get_session(session.session_id)
        self.assertIsNotNone(sanitized)
        visible = [task for task in sanitized.calculation_tasks if task.user_visible]
        hidden = [task for task in sanitized.calculation_tasks if not task.user_visible]

        self.assertEqual(1, len(visible))
        self.assertEqual("completed", visible[0].status)
        self.assertTrue(any(task.validation_state == "rejected" for task in hidden))


if __name__ == "__main__":
    unittest.main()
