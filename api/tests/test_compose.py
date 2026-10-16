from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_the_readme_shows_the_shipped_compose_file():
    readme = (REPO_ROOT / "README.md").read_text()
    start = readme.index("```yaml\n") + len("```yaml\n")
    block = readme[start : readme.index("```", start)]

    assert block == (REPO_ROOT / "compose.yaml").read_text()
