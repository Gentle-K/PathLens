from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.config import REPO_ROOT
from app.domain.rwa import AssetTemplate, SourceProvenanceRef


SOURCE_REGISTRY_PATH = REPO_ROOT / "training" / "sources" / "public_sources.json"


@lru_cache(maxsize=1)
def load_public_source_registry() -> list[dict[str, object]]:
    if not SOURCE_REGISTRY_PATH.exists():
        return []
    payload = json.loads(SOURCE_REGISTRY_PATH.read_text(encoding="utf-8"))
    return [
        item
        for item in payload.get("sources", [])
        if isinstance(item, dict)
    ]


def _asset_tags(asset: AssetTemplate) -> set[str]:
    tags = {
        asset.asset_type.value.replace("_", "-"),
        asset.symbol.lower(),
        asset.asset_id.lower(),
    }
    tags.update(tag.lower() for tag in asset.tags)
    if asset.requires_kyc_level:
        tags.add("kyc")
        tags.add("eligibility")
    if asset.oracle_count:
        tags.add("oracle")
    if asset.asset_type.value == "stablecoin":
        tags.update({"stablecoin", "reserves", "redemption"})
    if asset.asset_type.value == "mmf":
        tags.update({"mmf", "money-market-fund"})
    if asset.asset_type.value == "precious_metal":
        tags.update({"silver", "precious-metal"})
    return {tag for tag in tags if tag}


def build_source_provenance_refs(
    assets: list[AssetTemplate],
    *,
    limit: int = 10,
) -> list[SourceProvenanceRef]:
    registry = load_public_source_registry()
    if not registry:
        return []

    desired_tags: set[str] = {"hashkey-chain", "network", "report", "stress", "score_explain"}
    for asset in assets:
        desired_tags.update(_asset_tags(asset))

    selected: list[SourceProvenanceRef] = []
    seen_ids: set[str] = set()
    for item in registry:
        source_id = str(item.get("source_id", "")).strip()
        if not source_id or source_id in seen_ids:
            continue
        asset_tags = {str(tag).lower() for tag in item.get("asset_tags", [])}
        task_tags = {str(tag).lower() for tag in item.get("task_tags", [])}
        if asset_tags and not desired_tags.intersection(asset_tags | task_tags):
            continue
        selected.append(
            SourceProvenanceRef(
                ref_id=source_id,
                title=str(item.get("title", "")).strip() or source_id,
                source_name=str(item.get("source_name", "")).strip() or "Public Source",
                source_url=str(item.get("source_url", "")).strip(),
                source_kind=str(item.get("data_kind", "report")).strip() or "report",
                source_tier=str(item.get("source_tier", "official")).strip() or "official",
                freshness_date=str(item.get("published_date", "")).strip(),
                verified_summary=str(item.get("verified_summary", "")).strip(),
            )
        )
        seen_ids.add(source_id)
        if len(selected) >= limit:
            break
    return selected


def source_ref_lookup(refs: list[SourceProvenanceRef]) -> dict[str, SourceProvenanceRef]:
    return {item.ref_id: item for item in refs}

