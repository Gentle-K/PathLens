"""Tests for the evidence pipeline and DeFi Llama adapter."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.domain.rwa import DataSourceTag, EvidencePanelItem
from app.rwa.evidence import (
    collect_all_evidence,
    normalize_evidence_items,
)


class NormalizeEvidenceTests(unittest.TestCase):
    def test_deduplicates_by_url_and_title(self):
        items = [
            EvidencePanelItem(
                title="Test A",
                source_url="https://example.com/a",
                source_name="Ex",
                summary="First",
            ),
            EvidencePanelItem(
                title="Test A",
                source_url="https://example.com/a",
                source_name="Ex",
                summary="Duplicate",
            ),
            EvidencePanelItem(
                title="Test B",
                source_url="https://example.com/b",
                source_name="Ex",
                summary="Different",
            ),
        ]
        result = normalize_evidence_items(items)
        self.assertEqual(len(result), 2)

    def test_strips_empty_facts(self):
        item = EvidencePanelItem(
            title="Test",
            source_url="https://example.com",
            source_name="Ex",
            summary="Sum",
            extracted_facts=["Fact 1", "", "  ", "Fact 2"],
        )
        result = normalize_evidence_items([item])
        self.assertEqual(result[0].extracted_facts, ["Fact 1", "Fact 2"])

    def test_clamps_confidence(self):
        item = EvidencePanelItem(
            title="Test",
            source_url="https://example.com",
            source_name="Ex",
            summary="Sum",
            confidence=1.5,
        )
        result = normalize_evidence_items([item])
        self.assertLessEqual(result[0].confidence, 1.0)

        item2 = EvidencePanelItem(
            title="Test2",
            source_url="https://example.com/2",
            source_name="Ex",
            summary="Sum",
            confidence=-0.3,
        )
        result2 = normalize_evidence_items([item2])
        self.assertGreaterEqual(result2[0].confidence, 0.0)


class CollectAllEvidenceTests(unittest.TestCase):
    def test_returns_catalog_evidence_when_llama_disabled(self):
        catalog = [
            EvidencePanelItem(
                title="Catalog item",
                source_url="https://docs.hashkeychain.net",
                source_name="HashKey",
                summary="A catalog evidence item",
            ),
        ]
        result = collect_all_evidence(
            catalog_evidence=catalog,
            include_defi_llama=False,
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].title, "Catalog item")

    def test_returns_empty_when_no_sources(self):
        result = collect_all_evidence(
            catalog_evidence=None,
            include_defi_llama=False,
        )
        self.assertEqual(len(result), 0)

    def test_deduplicates_across_sources(self):
        catalog = [
            EvidencePanelItem(
                title="Shared item",
                source_url="https://example.com/shared",
                source_name="Source A",
                summary="From catalog",
            ),
            EvidencePanelItem(
                title="Shared item",
                source_url="https://example.com/shared",
                source_name="Source B",
                summary="Duplicate from catalog",
            ),
        ]
        result = collect_all_evidence(
            catalog_evidence=catalog,
            include_defi_llama=False,
        )
        self.assertEqual(len(result), 1)


class LlamaDataAdapterTests(unittest.TestCase):
    def test_pool_to_evidence_dict_structure(self):
        from app.adapters.llama_data import pool_to_evidence_dict

        pool = {
            "pool": "pool-123",
            "project": "TestProject",
            "chain": "HashKey",
            "symbol": "USDT",
            "apy": 5.25,
            "tvlUsd": 1_000_000,
        }
        result = pool_to_evidence_dict(pool)
        self.assertIn("title", result)
        self.assertIn("source_url", result)
        self.assertIn("extracted_facts", result)
        self.assertIn("confidence", result)
        self.assertIn("APY: 5.25%", result["extracted_facts"])

    def test_protocol_to_evidence_dict_structure(self):
        from app.adapters.llama_data import protocol_to_evidence_dict

        proto = {
            "name": "TestProto",
            "slug": "testproto",
            "tvl": 5_000_000,
            "chains": ["Ethereum", "HashKey"],
            "category": "DEX",
        }
        result = protocol_to_evidence_dict(proto)
        self.assertIn("title", result)
        self.assertEqual(result["source_name"], "DeFi Llama")
        self.assertIn("Category: DEX", result["extracted_facts"])


if __name__ == "__main__":
    unittest.main()
