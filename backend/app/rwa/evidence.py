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

from app.domain.rwa import DataSourceTag, EvidencePanelItem

logger = logging.getLogger(__name__)


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
