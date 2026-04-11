from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from training.schemas import PublicSource


TRAINING_ROOT = Path(__file__).resolve().parent
PUBLIC_SOURCES_PATH = TRAINING_ROOT / "sources" / "public_sources.json"
NORMALIZED_TABLES = {
    "asset_snapshot",
    "market_series",
    "reserve_backing",
    "regulatory_constraints",
    "source_provenance",
}


def _parse_published_date(value: str) -> date | None:
    raw = value.strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def load_public_sources(path: Path | None = None) -> list[PublicSource]:
    target = path or PUBLIC_SOURCES_PATH
    payload = json.loads(target.read_text(encoding="utf-8"))
    sources: list[PublicSource] = []
    for item in payload.get("sources", []):
        sources.append(
            PublicSource(
                source_id=str(item["source_id"]),
                title=str(item["title"]),
                source_name=str(item["source_name"]),
                source_url=str(item["source_url"]),
                category=str(item["category"]),
                source_tier=str(item["source_tier"]),
                data_kind=str(item["data_kind"]),
                cadence=str(item["cadence"]),
                freshness_budget_days=int(item["freshness_budget_days"]),
                verified_summary=str(item["verified_summary"]),
                normalized_targets=tuple(str(value) for value in item.get("normalized_targets", [])),
                asset_tags=tuple(str(value) for value in item.get("asset_tags", [])),
                task_tags=tuple(str(value) for value in item.get("task_tags", [])),
                published_date=str(item.get("published_date", "")),
                notes=str(item.get("notes", "")),
            )
        )
    return sources


def validate_public_sources(
    sources: list[PublicSource],
    *,
    today: date | None = None,
) -> list[str]:
    reference_date = today or datetime.now(timezone.utc).date()
    errors: list[str] = []
    seen_ids: set[str] = set()
    for source in sources:
        if source.source_id in seen_ids:
            errors.append(f"Duplicate source_id: {source.source_id}")
        seen_ids.add(source.source_id)
        if not source.source_url.startswith("https://"):
            errors.append(f"Non-https source_url: {source.source_id}")
        if source.freshness_budget_days <= 0:
            errors.append(f"Invalid freshness budget: {source.source_id}")
        if not source.verified_summary.strip():
            errors.append(f"Missing verified_summary: {source.source_id}")
        unknown_targets = set(source.normalized_targets) - NORMALIZED_TABLES
        if unknown_targets:
            errors.append(
                f"Unknown normalized targets for {source.source_id}: {sorted(unknown_targets)}"
            )
        published_date = _parse_published_date(source.published_date)
        if source.published_date and published_date is None:
            errors.append(f"Invalid published_date: {source.source_id}")
        if published_date is not None:
            age_days = (reference_date - published_date).days
            if age_days > source.freshness_budget_days:
                errors.append(
                    f"Stale source: {source.source_id} is {age_days} days old for a {source.freshness_budget_days}-day freshness budget."
                )
    return errors


def build_normalized_tables(sources: list[PublicSource]) -> dict[str, list[dict[str, Any]]]:
    captured_at = datetime.now(timezone.utc).isoformat()
    tables = {name: [] for name in NORMALIZED_TABLES}
    for source in sources:
        provenance_record = {
            "source_id": source.source_id,
            "title": source.title,
            "source_name": source.source_name,
            "source_url": source.source_url,
            "category": source.category,
            "source_tier": source.source_tier,
            "data_kind": source.data_kind,
            "cadence": source.cadence,
            "freshness_budget_days": source.freshness_budget_days,
            "published_date": source.published_date,
            "verified_summary": source.verified_summary,
            "asset_tags": list(source.asset_tags),
            "task_tags": list(source.task_tags),
            "captured_at": captured_at,
        }
        tables["source_provenance"].append(provenance_record)

        if "asset_snapshot" in source.normalized_targets:
            for asset_tag in source.asset_tags or ("generic-rwa",):
                tables["asset_snapshot"].append(
                    {
                        "source_id": source.source_id,
                        "asset_tag": asset_tag,
                        "snapshot_label": source.title,
                        "source_url": source.source_url,
                        "source_tier": source.source_tier,
                        "verified_summary": source.verified_summary,
                        "captured_at": captured_at,
                    }
                )

        if "market_series" in source.normalized_targets:
            tables["market_series"].append(
                {
                    "source_id": source.source_id,
                    "series_label": source.title,
                    "source_name": source.source_name,
                    "source_url": source.source_url,
                    "cadence": source.cadence,
                    "freshness_budget_days": source.freshness_budget_days,
                    "asset_tags": list(source.asset_tags),
                    "captured_at": captured_at,
                }
            )

        if "reserve_backing" in source.normalized_targets:
            tables["reserve_backing"].append(
                {
                    "source_id": source.source_id,
                    "issuer": source.source_name,
                    "coverage_scope": list(source.asset_tags),
                    "attestation_summary": source.verified_summary,
                    "source_url": source.source_url,
                    "freshness_budget_days": source.freshness_budget_days,
                    "captured_at": captured_at,
                }
            )

        if "regulatory_constraints" in source.normalized_targets:
            tables["regulatory_constraints"].append(
                {
                    "source_id": source.source_id,
                    "constraint_scope": source.category,
                    "source_name": source.source_name,
                    "source_url": source.source_url,
                    "verified_summary": source.verified_summary,
                    "task_tags": list(source.task_tags),
                    "captured_at": captured_at,
                }
            )

    return tables
