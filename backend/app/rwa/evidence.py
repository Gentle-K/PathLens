"""RWA evidence pipeline — gathers, normalises, and deduplicates evidence.

This module orchestrates evidence collection from multiple sources:

  1. **Catalog evidence** — static facts derived from the asset template
     library (already implemented in ``rwa/engine.py``).
  2. **DeFi Llama evidence** — external yield / protocol data from the
     ``adapters/llama_data`` adapter.
  3. **Future sources** — oracle snapshots, on-chain analytics, etc.

All evidence is normalised into ``EvidencePanelItem`` instances so the
report builder and frontend can consume them uniformly.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable

from app.domain.models import EvidenceItem
from app.domain.rwa import (
    AssetTemplate,
    DataSourceTag,
    EvidenceConflict,
    EvidenceCoverage,
    EvidenceFactType,
    EvidenceFreshness,
    EvidenceFreshnessBucket,
    EvidenceGovernance,
    EvidencePanelItem,
)

logger = logging.getLogger(__name__)
KEY_FACT_FAMILIES = {
    "earliest_exit",
    "kyc_requirement",
    "total_cost",
    "onchain_verified",
    "issuer_disclosed",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def fetch_defi_llama_evidence(
    *,
    chain: str = "HashKey",
    project: str | None = None,
    limit: int = 5,
) -> list[EvidencePanelItem]:
    """Fetch yield-pool evidence from DeFi Llama and wrap as EvidencePanelItem.

    Degrades gracefully — returns [] if the adapter fails.
    """
    try:
        from app.adapters.llama_data import fetch_yield_pools, pool_to_evidence_dict
    except Exception as exc:
        logger.warning("Could not import llama_data adapter: %s", exc)
        return []

    pools = fetch_yield_pools(chain=chain, project=project, limit=limit)
    items: list[EvidencePanelItem] = []
    for pool in pools:
        raw = pool_to_evidence_dict(pool)
        items.append(
            EvidencePanelItem(
                title=raw["title"],
                source_url=raw["source_url"],
                source_name=raw["source_name"],
                source_tag=DataSourceTag.MODEL_INFERENCE,
                fetched_at=_utcnow(),
                summary=raw["summary"],
                extracted_facts=raw.get("extracted_facts", []),
                confidence=raw.get("confidence", 0.5),
            )
        )
    return items


def fetch_protocol_evidence(
    protocol_slug: str,
) -> EvidencePanelItem | None:
    """Fetch protocol-level metadata from DeFi Llama."""
    try:
        from app.adapters.llama_data import (
            fetch_protocol_metadata,
            protocol_to_evidence_dict,
        )
    except Exception as exc:
        logger.warning("Could not import llama_data adapter: %s", exc)
        return None

    proto = fetch_protocol_metadata(protocol_slug)
    if proto is None:
        return None
    raw = protocol_to_evidence_dict(proto)
    return EvidencePanelItem(
        title=raw["title"],
        source_url=raw["source_url"],
        source_name=raw["source_name"],
        source_tag=DataSourceTag.MODEL_INFERENCE,
        fetched_at=_utcnow(),
        summary=raw["summary"],
        extracted_facts=raw.get("extracted_facts", []),
        confidence=raw.get("confidence", 0.5),
    )


def normalize_evidence_items(
    items: list[EvidencePanelItem],
) -> list[EvidencePanelItem]:
    """Deduplicate and clean evidence items.

    - Removes duplicates by (source_url, title).
    - Strips empty extracted_facts entries.
    - Clamps confidence to [0, 1].
    """
    seen: set[tuple[str, str]] = set()
    result: list[EvidencePanelItem] = []
    for item in items:
        key = (item.source_url, item.title)
        if key in seen:
            continue
        seen.add(key)
        # Clean up
        item.extracted_facts = [f for f in item.extracted_facts if f.strip()]
        item.confidence = max(0.0, min(1.0, item.confidence))
        result.append(item)
    return result


def compute_freshness(
    fetched_at: datetime | None,
    *,
    reference_time: datetime | None = None,
) -> EvidenceFreshness:
    if fetched_at is None:
        return EvidenceFreshness(
            bucket=EvidenceFreshnessBucket.UNDATED,
            label="Undated",
        )
    reference = reference_time or _utcnow()
    age_hours = max(0.0, (reference - fetched_at).total_seconds() / 3600)
    if age_hours <= 48:
        return EvidenceFreshness(
            bucket=EvidenceFreshnessBucket.FRESH,
            label="Fresh",
            age_hours=round(age_hours, 1),
        )
    if age_hours <= 168:
        return EvidenceFreshness(
            bucket=EvidenceFreshnessBucket.AGING,
            label="Aging",
            age_hours=round(age_hours, 1),
        )
    return EvidenceFreshness(
        bucket=EvidenceFreshnessBucket.STALE,
        label="Stale",
        age_hours=round(age_hours, 1),
        stale_warning="Key facts should be revalidated before relying on this evidence.",
    )


def enrich_report_evidence(
    items: list[EvidenceItem],
    *,
    reference_time: datetime | None = None,
) -> list[EvidenceItem]:
    enriched: list[EvidenceItem] = []
    conflict_map = _detect_conflicts(items)
    for item in items:
        cloned = item.model_copy(deep=True)
        cloned.freshness = compute_freshness(cloned.fetched_at, reference_time=reference_time)
        cloned.conflict_keys = sorted(conflict_map.get(cloned.evidence_id, set()))
        enriched.append(cloned)
    return enriched


def build_evidence_governance(
    items: list[EvidenceItem],
    assets: Iterable[AssetTemplate],
    *,
    reference_time: datetime | None = None,
) -> EvidenceGovernance:
    enriched = enrich_report_evidence(items, reference_time=reference_time)
    conflicts = _materialize_conflicts(enriched)
    coverage = _build_coverage(enriched, list(assets))

    if coverage:
        overall_score = sum(item.coverage_score for item in coverage) / len(coverage)
    else:
        overall_score = 0.0
    overall_score = max(0.0, min(1.0, overall_score - len(conflicts) * 0.08))

    weak_warning = ""
    weak_assets = [item.asset_name or item.asset_id for item in coverage if item.coverage_score < 0.55]
    stale_count = sum(1 for item in enriched if item.freshness.bucket == EvidenceFreshnessBucket.STALE)
    if weak_assets or stale_count or conflicts:
        weak_warning = (
            "Evidence quality is uneven across assets; review stale, incomplete, or conflicting facts before acting."
        )

    return EvidenceGovernance(
        overall_score=round(overall_score, 2),
        weak_evidence_warning=weak_warning,
        conflicts=conflicts,
        coverage=coverage,
    )


def _detect_conflicts(items: list[EvidenceItem]) -> dict[str, set[str]]:
    values_by_asset_and_field: dict[tuple[str, str], dict[str, set[str]]] = {}
    for item in items:
        if not item.asset_id:
            continue
        for fact in item.extracted_facts:
            parsed = _parse_fact_family(fact)
            if parsed is None:
                continue
            field_key, value = parsed
            bucket = values_by_asset_and_field.setdefault((item.asset_id, field_key), {})
            bucket.setdefault(value, set()).add(item.evidence_id)

    conflict_map: dict[str, set[str]] = {}
    for (_, field_key), value_map in values_by_asset_and_field.items():
        if len(value_map) < 2:
            continue
        for evidence_ids in value_map.values():
            for evidence_id in evidence_ids:
                conflict_map.setdefault(evidence_id, set()).add(field_key)
    return conflict_map


def _materialize_conflicts(items: list[EvidenceItem]) -> list[EvidenceConflict]:
    grouped: dict[tuple[str, str], list[EvidenceItem]] = {}
    for item in items:
        for field_key in item.conflict_keys:
            grouped.setdefault((item.asset_id, field_key), []).append(item)

    conflicts: list[EvidenceConflict] = []
    for (asset_id, field_key), group in grouped.items():
        conflicts.append(
            EvidenceConflict(
                asset_id=asset_id,
                field_key=field_key,
                severity="warning",
                summary=f"Evidence sources disagree on {field_key.replace('_', ' ')}.",
                evidence_ids=[item.evidence_id for item in group],
            )
        )
    return conflicts


def _build_coverage(
    items: list[EvidenceItem],
    assets: list[AssetTemplate],
) -> list[EvidenceCoverage]:
    by_asset: dict[str, list[EvidenceItem]] = {}
    for item in items:
        if item.asset_id:
            by_asset.setdefault(item.asset_id, []).append(item)

    coverage: list[EvidenceCoverage] = []
    for asset in assets:
        asset_items = by_asset.get(asset.asset_id, [])
        family_keys = {
            parsed[0]
            for item in asset_items
            for fact in item.extracted_facts
            for parsed in [_parse_fact_family(fact)]
            if parsed is not None
        }
        missing_fields = sorted(KEY_FACT_FAMILIES - family_keys)
        coverage_score = min(1.0, (len(asset_items) / 3.0) * 0.4 + (len(family_keys) / len(KEY_FACT_FAMILIES)) * 0.6)
        completeness_score = len(family_keys) / len(KEY_FACT_FAMILIES) if KEY_FACT_FAMILIES else 0.0
        strengths: list[str] = []
        gaps: list[str] = []
        if any(item.fact_type == EvidenceFactType.ONCHAIN_VERIFIED_FACT for item in asset_items):
            strengths.append("Contains onchain-verifiable facts.")
        if any(item.fact_type == EvidenceFactType.OFFCHAIN_DISCLOSED_FACT for item in asset_items):
            strengths.append("Includes issuer-disclosed evidence.")
        if not strengths:
            gaps.append("No strong proof source identified.")
        if any(item.freshness.bucket == EvidenceFreshnessBucket.STALE for item in asset_items):
            gaps.append("Some evidence is stale.")
        if missing_fields:
            gaps.append(f"Missing key fact families: {', '.join(missing_fields)}.")
        coverage.append(
            EvidenceCoverage(
                asset_id=asset.asset_id,
                asset_name=asset.name,
                coverage_score=round(coverage_score, 2),
                completeness_score=round(completeness_score, 2),
                strengths=strengths,
                gaps=gaps,
                missing_fields=missing_fields,
            )
        )
    return coverage


def _parse_fact_family(fact: str) -> tuple[str, str] | None:
    normalized = fact.strip().lower()
    if not normalized:
        return None
    separators = (":", "：", "=")
    for separator in separators:
        if separator in normalized:
            left, right = normalized.split(separator, 1)
            field_key = _normalize_field_key(left.strip())
            if field_key:
                return field_key, right.strip()
    return None


def _normalize_field_key(label: str) -> str | None:
    if "earliest exit" in label or "最短退出" in label or "最早退出" in label:
        return "earliest_exit"
    if "kyc" in label:
        return "kyc_requirement"
    if "cost" in label or "总成本" in label:
        return "total_cost"
    if "onchain" in label or "链上验证" in label:
        return "onchain_verified"
    if "issuer disclosed" in label or "发行方披露" in label:
        return "issuer_disclosed"
    return None


def collect_all_evidence(
    *,
    catalog_evidence: list[EvidencePanelItem] | None = None,
    include_defi_llama: bool = True,
    defi_llama_chain: str = "HashKey",
    defi_llama_limit: int = 5,
) -> list[EvidencePanelItem]:
    """Gather evidence from all available sources, normalise, and return.

    Parameters
    ----------
    catalog_evidence
        Pre-built evidence from ``engine.build_catalog_evidence()``.
    include_defi_llama
        Whether to attempt DeFi Llama evidence fetch.
    defi_llama_chain
        Chain filter for DeFi Llama.
    defi_llama_limit
        Max pools to fetch.

    Returns
    -------
    list[EvidencePanelItem]
        Deduplicated, normalised evidence items.
    """
    all_items: list[EvidencePanelItem] = []

    if catalog_evidence:
        all_items.extend(catalog_evidence)

    if include_defi_llama:
        try:
            llama_items = fetch_defi_llama_evidence(
                chain=defi_llama_chain,
                limit=defi_llama_limit,
            )
            all_items.extend(llama_items)
        except Exception as exc:
            logger.warning("DeFi Llama evidence collection failed: %s", exc)

    return normalize_evidence_items(all_items)
