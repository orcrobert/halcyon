import os
import re
import torch
from audiocraft.models import MusicGen, AudioGen
from audiocraft.data.audio import audio_write

DURATION = 10
OUTPUT_DIR = "output"


def get_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def sanitize_label(label: str) -> str:
    return re.sub(r"[^\w]+", "_", label.lower()).strip("_")


def generate(decomposed: dict) -> list[dict]:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    device = get_device()

    atmosphere = sanitize_label(decomposed["atmosphere"])
    elements = decomposed["elements"]

    sound_elements = [e for e in elements if e["type"] == "sound"]
    music_elements = [e for e in elements if e["type"] == "music"]

    results = []

    if sound_elements:
        model = AudioGen.get_pretrained("facebook/audiogen-medium", device=device)
        model.set_generation_params(duration=DURATION)
        wavs = model.generate([e["prompt"] for e in sound_elements])

        for element, wav in zip(sound_elements, wavs):
            path = os.path.join(OUTPUT_DIR, f"{atmosphere}_{sanitize_label(element['label'])}")
            audio_write(path, wav.cpu(), model.sample_rate, strategy="loudness", loudness_compressor=True)
            element["file"] = path + ".wav"
            results.append(element)

        del model
        if device == "mps":
            torch.mps.empty_cache()

    if music_elements:
        model = MusicGen.get_pretrained("facebook/musicgen-small", device=device)
        model.set_generation_params(duration=DURATION)
        wavs = model.generate([e["prompt"] for e in music_elements])

        for element, wav in zip(music_elements, wavs):
            path = os.path.join(OUTPUT_DIR, f"{atmosphere}_{sanitize_label(element['label'])}")
            audio_write(path, wav.cpu(), model.sample_rate, strategy="loudness", loudness_compressor=True)
            element["file"] = path + ".wav"
            results.append(element)

        del model
        if device == "mps":
            torch.mps.empty_cache()

    return results


if __name__ == "__main__":
    import sys
    import json
    from decomposer import decompose

    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "a rainy night in a cyberpunk city"
    decomposed = decompose(prompt)
    print(json.dumps(decomposed, indent=2))

    results = generate(decomposed)
    for e in results:
        print(f"[{e['type']}] {e['label']} (vol={e['volume']}) -> {e['file']}")
