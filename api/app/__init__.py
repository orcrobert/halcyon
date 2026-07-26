import sys
from pathlib import Path

_mixer_root = Path(__file__).resolve().parents[2] / "mixer"

if (_mixer_root / "mixer" / "core.py").is_file():
    if str(_mixer_root) not in sys.path:
        sys.path.insert(0, str(_mixer_root))
    _cached = sys.modules.get("mixer")
    if _cached is not None and getattr(_cached, "__file__", None) is None:
        del sys.modules["mixer"]
