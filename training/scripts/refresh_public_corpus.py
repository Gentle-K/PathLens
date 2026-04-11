from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from training.public_etl import refresh_public_corpus


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("training/artifacts/public"),
    )
    args = parser.parse_args()
    manifest = refresh_public_corpus(args.output_dir)
    print(f"Wrote normalized public corpus to {args.output_dir} with {manifest['source_count']} sources.")


if __name__ == "__main__":
    main()
