import json
import os
import sys
from pathlib import PurePosixPath

PROTECTED_DIRS = {
    "data": "data/ is runtime state: the database, generated audio and secret.key.",
    "frontend/dist": "frontend/dist is a build output. Change frontend/src and run npm run build.",
    "audiocraft": "audiocraft/ is vendored. Fix generation in generators/core instead.",
    "output": "output/ is scratch output from the mixer CLI.",
}
GENERATED_FILES = {
    "frontend/package-lock.json": "Lockfiles change through npm install, never by hand.",
    "uv.lock": "Lockfiles change through uv lock, never by hand.",
    "frontend/public/soundtouch-processor.js": "Copied from node_modules by npm run copy-worklets on every build.",
}
SECRET_SUFFIXES = (".pem", ".key")


def relative(path: str, root: str) -> PurePosixPath:
    absolute = os.path.abspath(os.path.join(root, path))
    try:
        return PurePosixPath(os.path.relpath(absolute, root))
    except ValueError:
        return PurePosixPath(absolute)


def refusal(path: PurePosixPath) -> str | None:
    text = path.as_posix()
    if text.startswith(".."):
        return None
    name = path.name
    if name.startswith(".env") and name != ".env.example":
        return f"{text} holds secrets. Document new variables in .env.example and ask the user to set them."
    if name.endswith(SECRET_SUFFIXES):
        return f"{text} looks like key material."
    if text in GENERATED_FILES:
        return f"{text}: {GENERATED_FILES[text]}"
    for directory, reason in PROTECTED_DIRS.items():
        if text == directory or text.startswith(directory + "/"):
            return reason
    return None


def main() -> int:
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input") or {}
    path = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not path:
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    reason = refusal(relative(path, root))
    if reason is None:
        return 0
    sys.stderr.write(f"Blocked edit to a protected path. {reason}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
