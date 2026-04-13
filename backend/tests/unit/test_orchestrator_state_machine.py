import unittest

from app.domain.models import (
    AnalysisLoopPlan,
    AnalysisMode,
    AnalysisReport,
    AnalysisSession,
    ClarificationQuestion,
    MajorConclusionItem,
    SearchTask,
    UserAnswer,
)
from app.orchestrator.engine import AnalysisOrchestrator
from tests.support import build_test_services


class DeterministicPlanningAdapter:
    def generate_initial_questions(self, session: AnalysisSession):
        return [
            ClarificationQuestion(
                question_text="What is the main outcome you care about?",
                purpose="Need one primary optimization target.",
                options=["Lower cost", "Lower risk", "Higher upside"],
                allow_skip=False,
                priority=1,
            )
        ]

    def plan_next_round(self, session: AnalysisSession):
        if not session.answers:
            return AnalysisLoopPlan(
                reasoning_focus="Wait for the first answer.",
                stop_reason="The first clarification answer is still missing.",
            )

        if not session.search_tasks:
            return AnalysisLoopPlan(
                search_tasks=[
                    SearchTask(
                        search_topic="Option comparison facts",
                        search_goal="Collect one fact to support the recommendation.",
                        search_scope="Public web",
                    )
                ],
                major_conclusions=[
                    MajorConclusionItem(
                        content="The user's objective is specific enough to search for supporting evidence.",
                        conclusion_type="fact",
                        confidence=0.8,
                    )
                ],
                reasoning_focus="Gather evidence for the chosen objective.",
                stop_reason="Run the next evidence task before deciding.",
            )

        return AnalysisLoopPlan(
            ready_for_report=True,
            major_conclusions=[
                MajorConclusionItem(
                    content="The decision is now bounded enough to write the final report.",
                    conclusion_type="inference",
                    basis_refs=["Option comparison facts"],
                    confidence=0.86,
                )
            ],
            reasoning_focus="Summarize the evidence-backed conclusion.",
            stop_reason="No more clarification or tool calls are needed.",
        )

    def build_report(self, session: AnalysisSession):
        return AnalysisReport(
            summary="Option A remains the better fit under the current evidence.",
            assumptions=["Only the current structured evidence snapshot was used."],
            recommendations=["Keep the lower-risk option as the default."],
            markdown="## Summary\n\nOption A remains the better fit.",
        )


class ExplodingPlanningAdapter(DeterministicPlanningAdapter):
    def plan_next_round(self, session: AnalysisSession):
        raise ValueError("planning exploded")


class OrchestratorStateMachineTests(unittest.TestCase):
    def test_init_transitions_to_clarifying_and_writes_audit_log(self):
        services = build_test_services(analysis_adapter=DeterministicPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car or continue using public transit?",
            owner_client_id="client-1",
        )

        step = services.orchestrator.advance_session(session.session_id)
        persisted = services.session_service.get_session(session.session_id)

        self.assertEqual("CLARIFYING", step.status.value)
        self.assertEqual("ask_user", step.next_action.value)
        self.assertEqual(1, len(step.pending_questions))
        self.assertEqual("CLARIFYING", persisted.status.value)
        self.assertTrue(
            any(log.action == "QUESTIONS_GENERATED" for log in services.audit_log_service.list_logs())
        )

    def test_clarifying_with_unanswered_questions_stays_blocked(self):
        services = build_test_services(analysis_adapter=DeterministicPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I join an overseas exchange program?",
            owner_client_id="client-1",
        )
        services.orchestrator.advance_session(session.session_id)

        step = services.orchestrator.advance_session(session.session_id)

        self.assertEqual("CLARIFYING", step.status.value)
        self.assertEqual("ask_user", step.next_action.value)
        self.assertIn("unanswered", step.prompt_to_user.lower())

    def test_valid_full_lifecycle_reaches_ready_for_execution(self):
        services = build_test_services(analysis_adapter=DeterministicPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I work for two years before graduate school?",
            owner_client_id="client-1",
        )

        step1 = services.orchestrator.advance_session(session.session_id)
        question_id = step1.pending_questions[0].question_id
        services.session_service.record_answers(
            session.session_id,
            [UserAnswer(question_id=question_id, value="Lower downside matters most.")],
        )

        step2 = services.orchestrator.advance_session(session.session_id)
        step3 = services.orchestrator.advance_session(session.session_id)
        step4 = services.orchestrator.advance_session(session.session_id)
        final_session = services.session_service.get_session(session.session_id)

        self.assertEqual("ANALYZING", step2.status.value)
        self.assertEqual("READY_FOR_REPORT", step3.status.value)
        self.assertEqual("READY_FOR_EXECUTION", step4.status.value)
        self.assertIsNotNone(final_session.report)
        self.assertEqual("ready_for_execution", final_session.activity_status)

    def test_reporting_status_completes_on_next_advance(self):
        services = build_test_services(analysis_adapter=DeterministicPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Estimate the budget for a university exchange program.",
            owner_client_id="client-1",
        )
        raw = services.session_service.repository.get(session.session_id)
        raw.status = raw.status.REPORTING
        services.session_service.repository.save(raw)

        step = services.orchestrator.advance_session(session.session_id)

        self.assertEqual("COMPLETED", step.status.value)

    def test_completed_session_does_not_reopen(self):
        services = build_test_services(analysis_adapter=DeterministicPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car?",
            owner_client_id="client-1",
        )
        raw = services.session_service.repository.get(session.session_id)
        raw.status = raw.status.COMPLETED
        raw.report = AnalysisReport(summary="Done.")
        services.session_service.repository.save(raw)

        step = services.orchestrator.advance_session(session.session_id)

        self.assertEqual("COMPLETED", step.status.value)
        self.assertEqual("complete", step.next_action.value)

    def test_planning_exception_marks_session_failed(self):
        services = build_test_services(analysis_adapter=ExplodingPlanningAdapter())
        session = services.session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car?",
            owner_client_id="client-1",
        )
        step1 = services.orchestrator.advance_session(session.session_id)
        question_id = step1.pending_questions[0].question_id
        services.session_service.record_answers(
            session.session_id,
            [UserAnswer(question_id=question_id, value="Need the lower-risk option.")],
        )

        step2 = services.orchestrator.advance_session(session.session_id)
        persisted = services.session_service.get_session(session.session_id)

        self.assertEqual("FAILED", step2.status.value)
        self.assertEqual("unexpected_error", step2.activity_status)
        self.assertIn("planning exploded", persisted.error_message or "")
