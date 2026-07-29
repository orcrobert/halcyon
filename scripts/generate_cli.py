import json
import sys

from api.app.services.decomposer import decompose
from api.app.services.generator import generate
from api.app.services.runconfig import default_config
from mixer.core import mix_to_file


def main():
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "a Witcher tavern with a bard playing"

    print(f"Prompt: {prompt}\n")

    config = default_config()

    decomposed = decompose(prompt, config)
    print("Decomposition:")
    print(json.dumps(decomposed, indent=2))
    print()

    results = generate(decomposed, config)
    for e in results:
        print(f"  [{e['type']}] {e['label']} -> {e['file']}")

    output = mix_to_file(results)
    print(f"\nMixed: {output}")


if __name__ == "__main__":
    main()
