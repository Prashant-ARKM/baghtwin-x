"""Make `physics` and `simdata` importable when pytest runs from backend/ or from the repo root."""
import sys
import warnings
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

warnings.filterwarnings("ignore", category=RuntimeWarning)
