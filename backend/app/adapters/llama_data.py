"""DeFi Llama data adapter — fetches yield and protocol metadata.

This adapter queries the public DeFi Llama APIs to gather evidence about
on-chain yields, protocol TVL, and pool metadata.  Results are normalised
into our ``EvidencePanelItem`` format so the rest of the pipeline can treat
them identically to catalog-derived evidence.

Design notes
------------
- Uses ``httpx`` (already in requirements.txt) for async-capable HTTP.
- Caches responses in memory with a simple TTL to avoid hammering the API.
- Degrades gracefully: network errors produce empty results, never exceptions
  that crash the pipeline.
- Does NOT fabricate data — if a field is unavailable, it is left empty or
  tagged with low confidence.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

YIELDS_URL = "https://yields.llama.fi/pools"
PROTOCOLS_URL = "https://api.llama.fi/protocols"
DEFAULT_TTL_SECONDS = 300  # 5-minute cache


@dataclass
class _CacheEntry:
    data: Any
    fetched_at: float = 0.0


_cache: dict[str, _CacheEntry] = {}


def _get_cached(key: str, ttl: int = DEFAULT_TTL_SECONDS) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry.fetched_at) < ttl:
        return entry.data
    return None


def _set_cached(key: str, data: Any) -> None:
    _cache[key] = _CacheEntry(data=data, fetched_at=time.time())


def clear_llama_cache() -> None:
    """Clear all cached DeFi Llama responses."""
    _cache.clear()


def fetch_yield_pools(
    *,
    chain: str = "HashKey",
    project: str | None = None,
    limit: int = 20,
    timeout: float = 8.0,
) -> list[dict[str, Any]]:
    """Fetch top yield pools from DeFi Llama, optionally filtered.

    Returns a list of raw pool dictionaries.  On failure, returns [].
    """
    cache_key = f"yields:{chain}:{project}:{limit}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        resp = httpx.get(YIELDS_URL, timeout=timeout)
        resp.raise_for_status()
        all_pools: list[dict[str, Any]] = resp.json().get("data", [])
    except Exception as exc:
        logger.warning("DeFi Llama yields fetch failed: %s", exc)
        return []

    # Filter
    filtered = all_pools
    if chain:
        chain_lower = chain.lower()
        filtered = [
            p for p in filtered
            if (p.get("chain") or "").lower() == chain_lower
        ]
    if project:
        project_lower = project.lower()
        filtered = [
            p for p in filtered
            if (p.get("project") or "").lower() == project_lower
        ]

    # Sort by TVL descending, take top N
    filtered.sort(key=lambda p: p.get("tvlUsd", 0) or 0, reverse=True)
    result = filtered[:limit]

    _set_cached(cache_key, result)
    return result


def fetch_protocol_metadata(
    protocol_slug: str,
    *,
    timeout: float = 8.0,
) -> dict[str, Any] | None:
    """Fetch metadata for a single protocol by DeFi Llama slug.

    Returns the protocol dict on success, None on failure.
    """
    cache_key = f"protocol:{protocol_slug}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        resp = httpx.get(PROTOCOLS_URL, timeout=timeout)
        resp.raise_for_status()
        protocols: list[dict[str, Any]] = resp.json()
    except Exception as exc:
        logger.warning("DeFi Llama protocols fetch failed: %s", exc)
        return None

    match = next(
        (p for p in protocols
         if (p.get("slug") or "").lower() == protocol_slug.lower()),
        None,
    )
    if match:
        _set_cached(cache_key, match)
    return match


def pool_to_evidence_dict(pool: dict[str, Any]) -> dict[str, Any]:
    """Convert a DeFi Llama pool dict into an evidence-compatible dict.

    This does NOT return an ``EvidencePanelItem`` directly to avoid a
    circular import from the domain layer.  The caller (``rwa/evidence.py``)
    wraps it.
    """
    pool_id = pool.get("pool", "")
    project = pool.get("project", "unknown")
    chain = pool.get("chain", "")
    symbol = pool.get("symbol", "")
    apy = pool.get("apy")
    tvl = pool.get("tvlUsd")

    facts: list[str] = []
    if apy is not None:
        facts.append(f"APY: {apy:.2f}%")
    if tvl is not None:
        facts.append(f"TVL: ${tvl:,.0f}")
    if symbol:
        facts.append(f"Pool symbol: {symbol}")
    if chain:
        facts.append(f"Chain: {chain}")

    return {
        "title": f"{project} — {symbol}" if symbol else project,
        "source_url": f"https://defillama.com/yields/pool/{pool_id}",
        "source_name": "DeFi Llama",
        "summary": (
            f"DeFi Llama pool data for {project} on {chain}. "
            f"APY={apy:.2f}%, TVL=${tvl:,.0f}."
            if apy is not None and tvl is not None
            else f"DeFi Llama pool data for {project}."
        ),
        "extracted_facts": facts,
        "confidence": 0.7 if apy is not None else 0.4,
    }


def protocol_to_evidence_dict(protocol: dict[str, Any]) -> dict[str, Any]:
    """Convert a DeFi Llama protocol dict into an evidence-compatible dict."""
    name = protocol.get("name", "Unknown")
    slug = protocol.get("slug", "")
    tvl = protocol.get("tvl")
    chains = protocol.get("chains", [])
    category = protocol.get("category", "")

    facts: list[str] = []
    if tvl is not None:
        facts.append(f"Total TVL: ${tvl:,.0f}")
    if chains:
        facts.append(f"Active chains: {', '.join(chains[:5])}")
    if category:
        facts.append(f"Category: {category}")

    return {
        "title": f"{name} protocol overview",
        "source_url": f"https://defillama.com/protocol/{slug}" if slug else "",
        "source_name": "DeFi Llama",
        "summary": f"Protocol-level metadata for {name} from DeFi Llama.",
        "extracted_facts": facts,
        "confidence": 0.65,
    }
