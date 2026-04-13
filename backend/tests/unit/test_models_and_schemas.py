import unittest

from pydantic import ValidationError

from app.domain.models import (
    AnalysisMode,
    AnalysisSession,
    ClarificationQuestion,
    EvidenceItem,
    UserAnswer,
)
from app.domain.rwa import AssetTemplate, AssetType
from app.domain.schemas import (
    ContinueSessionRequest,
    RecordAttestationRequest,
    ReportAnchorRequest,
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

    def test_analysis_mode_accepts_legacy_aliases(self):
        self.assertEqual(
            AnalysisMode.SINGLE_ASSET_ALLOCATION,
            AnalysisMode("single_decision"),
        )
        self.assertEqual(
            AnalysisMode.STRATEGY_COMPARE,
            AnalysisMode("multi_option"),
        )

    def test_record_attestation_request_rejects_short_transaction_hash(self):
        with self.assertRaises(ValidationError):
            RecordAttestationRequest(
                network="testnet",
                transaction_hash="0x123",
            )

    def test_report_anchor_request_allows_draft_anchor_without_transaction_hash(self):
        payload = ReportAnchorRequest(
            network="testnet",
            submitted_by="0xabc",
            note="draft anchor",
        )

        self.assertEqual("testnet", payload.network)
        self.assertEqual("", payload.transaction_hash)

    def test_asset_template_accepts_richer_rwa_execution_fields(self):
        asset = AssetTemplate(
            asset_id="cpic-estable-mmf",
            symbol="MMF",
            name="CPIC Estable MMF",
            asset_type=AssetType.MMF,
            description="Tokenized money-market fund sleeve.",
            chain_id=177,
            contract_address="0x1234",
            protocol_name="HashKey Earn",
            permissioning_standard="ERC-3643",
            required_kyc_level=2,
            eligible_investor_types=["professional"],
            restricted_jurisdictions=["us"],
            min_subscription_amount=5000,
            redemption_window="T+2",
            settlement_asset="USDT",
            oracle_provider="APRO",
            oracle_contract="0xfeed",
            nav_or_price=1.01,
            indicative_yield=0.048,
            reserve_summary="Short-duration T-bills",
            custody_summary="Regulated custodian",
            bridge_support=["ethereum"],
            proof_refs=["issuer-factsheet"],
            risk_flags=["redemption_window"],
        )

        self.assertEqual("0x1234", asset.contract_address)
        self.assertEqual("ERC-3643", asset.permissioning_standard)
        self.assertEqual(["professional"], asset.eligible_investor_types)
        self.assertEqual(["ethereum"], asset.bridge_support)

    def test_rwa_comparison_request_defaults_demo_and_non_production_flags(self):
        payload = RwaComparisonRequest(problem_statement="Compare MMF and silver RWAs.")

        self.assertFalse(payload.include_non_production_assets)
        self.assertFalse(payload.demo_mode)
        self.assertEqual("", payload.demo_scenario_id)

    def test_rwa_clarify_request_rejects_too_short_problem_statement(self):
        with self.assertRaises(ValidationError):
            RwaClarifyRequest(problem_statement="RWA")
