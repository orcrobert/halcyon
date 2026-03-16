import numpy as np
import soundfile as sf


def _resample(wav: np.ndarray, sr: int, target_sr: int) -> np.ndarray:
    if sr == target_sr:
        return wav
    new_len = int(len(wav) * target_sr / sr)
    return np.interp(
        np.linspace(0, len(wav) - 1, new_len),
        np.arange(len(wav)),
        wav,
    )


def mix(elements: list[dict], output_path: str = "output/mixed.wav") -> str:
    tracks = []
    target_sr = None

    for element in elements:
        wav, sr = sf.read(element["file"], always_2d=True)
        wav = wav.T

        if target_sr is None:
            target_sr = sr
        elif sr != target_sr:
            wav = np.stack([_resample(ch, sr, target_sr) for ch in wav])

        tracks.append(wav * element["volume"])

    max_len = max(t.shape[-1] for t in tracks)

    padded = []
    for t in tracks:
        if t.shape[-1] < max_len:
            repeats = (max_len // t.shape[-1]) + 1
            t = np.tile(t, (1, repeats))[..., :max_len]
        if t.shape[0] == 1:
            t = np.repeat(t, 2, axis=0)
        padded.append(t)

    mixed = np.stack(padded).sum(axis=0)

    peak = np.abs(mixed).max()
    if peak > 1.0:
        mixed = mixed / peak

    sf.write(output_path, mixed.T, target_sr)
    return output_path


if __name__ == "__main__":
    import json

    with open("output/session.json") as f:
        session = json.load(f)

    output = mix(session["elements"])
    print(f"Mixed: {output}")
