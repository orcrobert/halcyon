import re
import subprocess
import sys

FIRST_VERSION = (0, 1, 0)
BREAKING = re.compile(r"^[a-z]+!:|^BREAKING CHANGE:", re.MULTILINE)
FEATURE = re.compile(r"^feat:", re.MULTILINE)
FIX = re.compile(r"^fix:", re.MULTILINE)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def last_tag() -> str | None:
    tags = git("tag", "--list", "v*.*.*", "--sort=-v:refname", "--merged", "HEAD").split()
    return tags[0] if tags else None


def commit_messages(since: str | None) -> list[str]:
    span = f"{since}..HEAD" if since else "HEAD"
    return [m.strip() for m in git("log", span, "--format=%B%x00").split("\0") if m.strip()]


def bump(version: tuple[int, int, int], messages: list[str]) -> tuple[int, int, int] | None:
    major, minor, patch = version
    if any(BREAKING.search(m) for m in messages):
        return (major + 1, 0, 0)
    if any(FEATURE.search(m) for m in messages):
        return (major, minor + 1, 0)
    if any(FIX.search(m) for m in messages):
        return (major, minor, patch + 1)
    return None


def next_version() -> str | None:
    tag = last_tag()
    if tag is None:
        return ".".join(map(str, FIRST_VERSION)) if commit_messages(None) else None
    current = tuple(int(part) for part in tag.removeprefix("v").split("."))
    bumped = bump(current, commit_messages(tag))
    return ".".join(map(str, bumped)) if bumped else None


if __name__ == "__main__":
    sys.stdout.write(next_version() or "")
