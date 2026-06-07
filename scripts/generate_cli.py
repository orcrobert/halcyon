import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mixer"))

from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate
from mixer.core import mix_to_file


def main():
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "a Witcher tavern with a bard playing"

    print(f"Prompt: {prompt}\n")

    decomposed = decompose(prompt)
    print("Decomposition:")
    print(json.dumps(decomposed, indent=2))
    print()

    results = generate(decomposed)
    for e in results:
        print(f"  [{e['type']}] {e['label']} -> {e['file']}")

    output = mix_to_file(results)
    print(f"\nMixed: {output}")


if __name__ == "__main__":
    main()
