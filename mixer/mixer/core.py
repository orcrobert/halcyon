import numpy as np
import soundfile as sf
from mixer.effects.looping import make_loopable
from mixer.effects.eq import apply_eq


def _resample(wav: np.ndarray, sr: int, target_sr: int) -> np.ndarray:
    if sr == target_sr:
        return wav
    new_len = int(len(wav) * target_sr / sr)
    return np.interp(
        np.linspace(0, len(wav) - 1, new_len),
        np.arange(len(wav)),
        wav,
    )


def _loop_to_length(track: np.ndarray, target_len: int) -> np.ndarray:
    if track.shape[-1] >= target_len:
        return track[..., :target_len]
    repeats = (target_len // track.shape[-1]) + 1
    return np.tile(track, (1, repeats))[..., :target_len]


def _to_stereo(track: np.ndarray) -> np.ndarray:
    if track.shape[0] == 1:
        return np.repeat(track, 2, axis=0)
    return track


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

        wav = apply_eq(wav, target_sr, element.get("eq", []))
        wav = make_loopable(wav, target_sr)
        tracks.append(wav * element["volume"])

    max_len = max(t.shape[-1] for t in tracks)
    tracks = [_to_stereo(_loop_to_length(t, max_len)) for t in tracks]

    mixed = np.stack(tracks).sum(axis=0)

    peak = np.abs(mixed).max()
    if peak > 1.0:
        mixed = mixed / peak

    sf.write(output_path, mixed.T, target_sr)
    return output_path
