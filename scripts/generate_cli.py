import sys
import json
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate
from mixer.mixer.core import mix


def main():
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "a Witcher tavern with a bard playing"

    print(f"Prompt: {prompt}\n")

    decomposed = decompose(prompt)
    print("Decomposition:")
    print(json.dumps(decomposed, indent=2))
    print()

    results = generate(decomposed)
    for e in results:
        print(f"  [{e['type']}] {e['label']} (vol={e['volume']}) -> {e['file']}")

    output = mix(results)
    print(f"\nMixed: {output}")


if __name__ == "__main__":
    main()
