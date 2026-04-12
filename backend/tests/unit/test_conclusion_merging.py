import unittest

from app.domain.models import AnalysisMode, AnalysisSession, MajorConclusionItem
from app.orchestrator.engine import AnalysisOrchestrator


class ConclusionMergingTests(unittest.TestCase):
    def test_merge_conclusions_deduplicates_by_normalized_content(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Should I buy a car or use public transit?",
        )
        session.major_conclusions = [
            MajorConclusionItem(
                content="Public transit has the lower monthly cost.",
                conclusion_type="fact",
                basis_refs=["pricing"],
                confidence=0.8,
            )
        ]

        added = AnalysisOrchestrator._merge_conclusions(
            session,
            [
                MajorConclusionItem(
                    content="Public transit has the lower monthly cost!",
                    conclusion_type="inference",
                    basis_refs=["duplicate"],
                    confidence=0.2,
                ),
                MajorConclusionItem(
                    content="Buying a car improves late-night travel flexibility.",
                    conclusion_type="inference",
                    basis_refs=["commute-patterns"],
                    confidence=0.74,
                ),
            ],
        )

        self.assertEqual(1, len(added))
        self.assertEqual(2, len(session.major_conclusions))

    def test_merge_conclusions_preserves_classification_basis_and_confidence(self):
        session = AnalysisSession(
            owner_client_id="client-1",
            mode=AnalysisMode.SINGLE_DECISION,
            problem_statement="Should I join a university exchange program abroad?",
        )
        new_conclusion = MajorConclusionItem(
            content="The opportunity cost is material but bounded.",
            conclusion_type="estimate",
            basis_refs=["tuition", "housing"],
            confidence=0.67,
        )

        added = AnalysisOrchestrator._merge_conclusions(session, [new_conclusion])

        self.assertEqual(1, len(added))
        self.assertEqual("estimate", session.major_conclusions[0].conclusion_type)
        self.assertEqual(["tuition", "housing"], session.major_conclusions[0].basis_refs)
        self.assertAlmostEqual(0.67, session.major_conclusions[0].confidence)
