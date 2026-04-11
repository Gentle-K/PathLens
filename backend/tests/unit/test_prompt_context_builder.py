import unittest

from app.domain.models import (
    AnalysisMode,
    AnalysisSession,
    CalculationTask,
    ChartTask,
    ClarificationQuestion,
    EvidenceItem,
    MajorConclusionItem,
    SearchTask,
    SessionEvent,
    UserAnswer,
)
from app.orchestrator.engine import AnalysisOrchestrator
from app.prompts.analysis import build_planning_prompts


class PromptContextBuilderTests(unittest.TestCase):
    def test_planning_prompt_uses_structured_context_and_omits_raw_event_history(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car or use public transit?",
        )
        question = ClarificationQuestion(
            question_text="What matters most?",
            purpose="Need the key objective.",
            answered=True,
            question_group="objective",
        )
        session.clarification_questions = [question]
        session.answers = [UserAnswer(question_id=question.question_id, value="Lower total cost")]
        session.evidence_items = [
            EvidenceItem(
                title="Transit pass pricing",
                source_url="https://example.com/transit",
                source_name="Transit Authority",
                summary="Monthly pass is cheaper than fuel and insurance in the baseline case.",
                extracted_facts=["Transit pass: 120 USD/month"],
                confidence=0.82,
            )
        ]
        session.major_conclusions = [
            MajorConclusionItem(
                content="Public transit has the lower deterministic baseline cost.",
                conclusion_type="fact",
                basis_refs=["Transit pass pricing"],
                confidence=0.85,
            )
        ]
        session.events = [
            SessionEvent(
                kind="raw_chat_history",
                payload={"content": "PRIVATE_CHAT_TRANSCRIPT_SHOULD_NOT_BE_IN_PROMPT"},
            )
        ]

        _, prompt = build_planning_prompts(session, compact=False)

        self.assertIn("asked_questions_json=", prompt)
        self.assertIn("answered_questions_json=", prompt)
        self.assertIn("existing_evidence_json=", prompt)
        self.assertIn("existing_major_conclusions_json=", prompt)
        self.assertNotIn("PRIVATE_CHAT_TRANSCRIPT_SHOULD_NOT_BE_IN_PROMPT", prompt)

    def test_compact_planning_prompt_handles_missing_data_safely(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Should I join a university exchange program abroad?",
        )

        _, prompt = build_planning_prompts(session, compact=True)

        self.assertIn("context_profile=compact", prompt)
        self.assertIn("asked_questions_json=[]", prompt)
        self.assertIn("answered_questions_json=[]", prompt)

    def test_merge_helpers_deduplicate_across_rounds(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car?",
        )
        session.search_tasks = [
            SearchTask(
                search_topic="commute costs",
                search_goal="Compare transit and driving costs",
                search_scope="public web",
            )
        ]
        session.calculation_tasks = [
            CalculationTask(
                objective="Transit monthly cost",
                formula_hint="pass_cost + occasional_taxi",
                input_params={"pass_cost": 120, "occasional_taxi": 30},
                unit="USD",
            )
        ]
        session.chart_tasks = [
            ChartTask(
                objective="Compare costs",
                chart_type="bar",
                title="Mobility cost comparison",
            )
        ]

        merged_search = AnalysisOrchestrator._merge_search_tasks(
            session,
            [
                SearchTask(
                    search_topic="commute costs",
                    search_goal="Compare transit and driving costs",
                    search_scope="public web",
                ),
                SearchTask(
                    search_topic="parking costs",
                    search_goal="Estimate monthly parking expense",
                    search_scope="public web",
                ),
            ],
        )
        merged_calculation = AnalysisOrchestrator._merge_calculation_tasks(
            session,
            [
                CalculationTask(
                    objective="Transit monthly cost duplicate wording",
                    formula_hint="pass_cost + occasional_taxi",
                    input_params={"pass_cost": 120, "occasional_taxi": 30},
                    unit="USD",
                ),
                CalculationTask(
                    objective="Driving monthly cost",
                    formula_hint="fuel + parking",
                    input_params={"fuel": 180, "parking": 220},
                    unit="USD",
                ),
            ],
        )
        merged_chart = AnalysisOrchestrator._merge_chart_tasks(
            session,
            [
                ChartTask(
                    objective="Compare costs",
                    chart_type="bar",
                    title="Mobility cost comparison",
                ),
                ChartTask(
                    objective="Show cost composition",
                    chart_type="pie",
                    title="Driving cost mix",
                ),
            ],
        )

        self.assertEqual(1, len(merged_search))
        self.assertEqual(1, len(merged_calculation))
        self.assertEqual(1, len(merged_chart))
        self.assertEqual(2, len(session.search_tasks))
        self.assertEqual(2, len(session.calculation_tasks))
        self.assertEqual(2, len(session.chart_tasks))
