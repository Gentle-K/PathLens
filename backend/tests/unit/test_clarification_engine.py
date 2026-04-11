import unittest

from app.adapters.llm_analysis import MockAnalysisAdapter
from app.domain.models import AnalysisMode, AnalysisSession, SearchTask, UserAnswer


class ClarificationEngineTests(unittest.TestCase):
    def test_rwa_initial_questions_are_prioritized_and_customizable(self):
        adapter = MockAnalysisAdapter()
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="Build a liquid RWA portfolio for 10,000 USDT on HashKey Chain.",
        )

        questions = adapter.generate_initial_questions(session)

        self.assertGreaterEqual(len(questions), 5)
        self.assertEqual(
            ["objective", "liquidity", "risk", "assets", "kyc"],
            [question.question_group for question in questions[:5]],
        )
        self.assertTrue(all(question.allow_custom_input for question in questions[:5]))
        self.assertTrue(all(question.priority == 1 for question in questions[:5]))
        self.assertTrue(all(not question.allow_skip for question in questions[:4]))

    def test_rwa_plan_waits_for_unanswered_questions(self):
        adapter = MockAnalysisAdapter()
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="Compare USDC, MMF, and silver RWAs for a 30-day horizon.",
        )
        session.clarification_questions = adapter.generate_initial_questions(session)

        plan = adapter.plan_next_round(session)

        self.assertFalse(plan.ready_for_report)
        self.assertFalse(plan.search_tasks)
        self.assertIn("Waiting for clarification answers", plan.stop_reason)

    def test_rwa_plan_generates_tool_tasks_before_reporting(self):
        adapter = MockAnalysisAdapter()
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="Compare USDC, MMF, and silver RWAs for a 30-day horizon.",
        )
        session.clarification_questions = adapter.generate_initial_questions(session)
        for question in session.clarification_questions:
            question.answered = True
            session.answers.append(
                UserAnswer(
                    question_id=question.question_id,
                    value="Use the most liquid options first.",
                )
            )

        plan = adapter.plan_next_round(session)

        self.assertFalse(plan.ready_for_report)
        self.assertTrue(plan.search_tasks)
        self.assertTrue(plan.calculation_tasks)
        self.assertTrue(plan.chart_tasks)
        self.assertIn("bounded mcp round", plan.stop_reason.lower())

    def test_rwa_plan_adds_follow_up_when_information_is_still_thin(self):
        adapter = MockAnalysisAdapter()
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="Compare USDC, MMF, and silver RWAs for a 30-day horizon.",
        )
        session.clarification_questions = adapter.generate_initial_questions(session)
        for index, question in enumerate(session.clarification_questions):
            question.answered = True
            if index < 3:
                session.answers.append(
                    UserAnswer(
                        question_id=question.question_id,
                        value="Keep a stable reserve and avoid long lockups.",
                    )
                )
        session.search_tasks = [
            SearchTask(
                search_topic="done",
                search_goal="done",
                search_scope="done",
            )
        ]

        plan = adapter.plan_next_round(session)

        self.assertFalse(plan.ready_for_report)
        self.assertEqual(1, len(plan.clarification_questions))
        self.assertEqual("sizing", plan.clarification_questions[0].question_group)
