from __future__ import annotations

import runpy
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "training" / "scripts" / "refresh_public_corpus.py"


if __name__ == "__main__":
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    sys.argv[0] = str(TARGET)
    runpy.run_path(str(TARGET), run_name="__main__")
