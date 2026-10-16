import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ESLINT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx"}


def ruff(root: Path) -> str | None:
    local = root / ".venv" / "bin" / "ruff"
    return str(local) if local.exists() else shutil.which("ruff")


def command(path: Path, root: Path) -> tuple[list[str], Path] | None:
    if path.suffix == ".py" or path.suffix == ".ipynb":
        binary = ruff(root)
        return ([binary, "check", "--quiet", str(path)], root) if binary else None
    frontend = root / "frontend"
    if path.suffix in ESLINT_SUFFIXES and frontend in path.parents:
        eslint = frontend / "node_modules" / ".bin" / "eslint"
        if not eslint.exists() or "node_modules" in path.parts or "dist" in path.parts:
            return None
        return ([str(eslint), str(path)], frontend)
    return None


def main() -> int:
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input") or {}
    raw = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not raw:
        return 0
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()).resolve()
    path = (Path(raw) if os.path.isabs(raw) else root / raw).resolve()
    if not path.is_file():
        return 0
    planned = command(path, root)
    if planned is None:
        return 0
    args, cwd = planned
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return 0
    if result.returncode == 0:
        return 0
    output = (result.stdout + result.stderr).strip()
    sys.stderr.write(f"Lint failed for {path.relative_to(root)}:\n{output[-3000:]}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
