import io
import json
import os
import subprocess
import sys
import tokenize
from collections import Counter
from pathlib import Path

C_LIKE = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
BLOCK_ONLY = {".css"}
HASH = {".yml", ".yaml", ".toml", ".sh", ".cfg", ".ini"}
HASH_NAMES = {"Dockerfile", ".gitignore", ".dockerignore"}
MARKUP = {".html"}
ALLOWED_PREFIXES = (
    "#!",
    "# type:",
    "# noqa",
    "# pragma",
    "# syntax=",
    "// eslint-",
    "/* eslint-",
    "// @ts-",
    "/// <reference",
    "// prettier-ignore",
)


def python_comments(source: str) -> list[tuple[int, str]]:
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        return [(t.start[0], t.string.strip()) for t in tokens if t.type == tokenize.COMMENT]
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return hash_comments(source)


def c_like_comments(source: str, line_comments: bool = True) -> list[tuple[int, str]]:
    found = []
    i, line, n = 0, 1, len(source)
    quote = None
    while i < n:
        ch = source[i]
        if ch == "\n":
            line += 1
        if quote:
            if ch == "\\":
                if i + 1 < n and source[i + 1] == "\n":
                    line += 1
                i += 2
                continue
            if ch == quote or (ch == "\n" and quote != "`"):
                quote = None
            i += 1
            continue
        if ch in "'\"`":
            quote = ch
            i += 1
            continue
        if line_comments and source.startswith("//", i):
            end = source.find("\n", i)
            end = n if end == -1 else end
            found.append((line, source[i:end].strip()))
            i = end
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            end = n if end == -1 else end + 2
            text = source[i:end]
            found.append((line, text.strip().splitlines()[0] if text.strip() else text))
            line += text.count("\n")
            i = end
            continue
        i += 1
    return found


def hash_comments(source: str) -> list[tuple[int, str]]:
    found = []
    for number, raw in enumerate(source.splitlines(), start=1):
        quote = None
        for index, ch in enumerate(raw):
            if quote:
                if ch == quote:
                    quote = None
                continue
            if ch in "'\"":
                quote = ch
            elif ch == "#" and (index == 0 or raw[index - 1] in " \t"):
                found.append((number, raw[index:].strip()))
                break
    return found


def markup_comments(source: str) -> list[tuple[int, str]]:
    found = []
    start = source.find("<!--")
    while start != -1:
        end = source.find("-->", start)
        end = len(source) if end == -1 else end + 3
        found.append((source.count("\n", 0, start) + 1, source[start:end].strip().splitlines()[0]))
        start = source.find("<!--", end)
    return found


def comments(path: Path, source: str) -> list[tuple[int, str]] | None:
    suffix = path.suffix
    if suffix == ".py":
        return python_comments(source)
    if suffix in C_LIKE:
        return c_like_comments(source)
    if suffix in BLOCK_ONLY:
        return c_like_comments(source, line_comments=False)
    if suffix in HASH or path.name in HASH_NAMES:
        return hash_comments(source)
    if suffix in MARKUP:
        return markup_comments(source)
    return None


def committed(path: Path, root: Path) -> str:
    try:
        relative = path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return ""
    result = subprocess.run(
        ["git", "show", f"HEAD:{relative}"],
        cwd=root,
        capture_output=True,
        text=True,
    )
    return result.stdout if result.returncode == 0 else ""


def added_comments(path: Path, root: Path) -> list[tuple[int, str]]:
    current = comments(path, path.read_text(encoding="utf-8", errors="replace"))
    if not current:
        return []
    before = Counter(text for _, text in comments(path, committed(path, root)) or [])
    added = []
    for number, text in current:
        if text.startswith(ALLOWED_PREFIXES):
            continue
        if before[text] > 0:
            before[text] -= 1
            continue
        added.append((number, text))
    return added


def main() -> int:
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input") or {}
    raw = tool_input.get("file_path")
    if not raw:
        return 0
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd())
    path = Path(raw) if os.path.isabs(raw) else root / raw
    if not path.is_file():
        return 0
    added = added_comments(path, root)
    if not added:
        return 0
    listing = "\n".join(f"  line {number}: {text[:120]}" for number, text in added[:10])
    sys.stderr.write(
        f"{path.name} gained comments, and this repo forbids them (AGENTS.md golden rule 1).\n"
        f"{listing}\n"
        "Remove them; put the explanation in the PR description or .claude/docs/ instead.\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
