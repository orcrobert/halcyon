from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

MAX_PROMPT_LENGTH = 40000


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text()


def default_decomposer_prompt() -> str:
    return load_prompt("decomposer")


def refiner_prompt() -> str:
    return load_prompt("refiner")
