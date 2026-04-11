import unittest

from pydantic import ValidationError

from app.domain.models import (
    AnalysisMode,
    AnalysisSession,
    ClarificationQuestion,
    EvidenceItem,
    UserAnswer,
)
from app.domain.schemas import (
    ContinueSessionRequest,
    RecordAttestationRequest,
    RwaClarifyRequest,
    RwaComparisonRequest,
    SessionCreateRequest,
)


class ModelAndSchemaValidationTests(unittest.TestCase):
    def test_analysis_session_defaults_are_initialized(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I work for two years before graduate school?",
        )

        self.assertEqual("INIT", session.status.value)
        self.assertTrue(session.intake_context)
        self.assertEqual([], session.clarification_questions)
        self.assertEqual([], session.report_snapshots)

    def test_clarification_question_allows_custom_input_by_default(self):
        question = ClarificationQuestion(
            question_text="What matters most?",
            purpose="Need the key optimization target.",
        )

        self.assertTrue(question.allow_custom_input)
        self.assertTrue(question.allow_skip)

    def test_evidence_item_has_structured_freshness_defaults(self):
        evidence = EvidenceItem(
            title="Issuer disclosure",
            source_url="https://example.com/fact",
            source_name="Example",
            summary="A structured evidence record.",
        )

        self.assertEqual("undated", evidence.freshness.bucket.value)
        self.assertEqual([], evidence.conflict_keys)

    def test_continue_session_request_accepts_answer_list(self):
        payload = ContinueSessionRequest(
            answers=[UserAnswer(question_id="q-1", value="Cash flow matters most.")]
        )

        self.assertEqual(1, len(payload.answers))

    def test_session_create_request_rejects_short_problem_statement(self):
        with self.assertRaises(ValidationError):
            SessionCreateRequest(
                mode=AnalysisMode.SINGLE_DECISION,
                problem_statement="bad",
            )

    def test_record_attestation_request_rejects_short_transaction_hash(self):
        with self.assertRaises(ValidationError):
            RecordAttestationRequest(
                network="testnet",
                transaction_hash="0x123",
            )

    def test_rwa_comparison_request_defaults_demo_and_non_production_flags(self):
        payload = RwaComparisonRequest(problem_statement="Compare MMF and silver RWAs.")

        self.assertFalse(payload.include_non_production_assets)
        self.assertFalse(payload.demo_mode)
        self.assertEqual("", payload.demo_scenario_id)

    def test_rwa_clarify_request_rejects_too_short_problem_statement(self):
        with self.assertRaises(ValidationError):
            RwaClarifyRequest(problem_statement="RWA")
