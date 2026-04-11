from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from training.source_registry import build_normalized_tables, load_public_sources, validate_public_sources
from training.utils import ensure_directory, write_json, write_jsonl


def refresh_public_corpus(output_dir: Path) -> dict[str, Any]:
    sources = load_public_sources()
    errors = validate_public_sources(sources)
    if errors:
        raise ValueError("Invalid public source registry: " + "; ".join(errors))

    normalized = build_normalized_tables(sources)
    ensure_directory(output_dir)
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(sources),
        "table_counts": {},
    }
    for table_name, rows in normalized.items():
        manifest["table_counts"][table_name] = len(rows)
        write_jsonl(output_dir / f"{table_name}.jsonl", rows)

    write_json(output_dir / "manifest.json", manifest)
    return manifest

