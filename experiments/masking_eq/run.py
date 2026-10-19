import argparse
import copy
import json
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from mixer.core import analyze
from mixer.effects.eq import apply_eq
from mixer.effects.volume import assign_volumes

HERE = Path(__file__).resolve().parent
RESULTS_DIR = HERE / "results"

N_BANDS = 40
F_LOW = 50.0
F_HIGH = 16000.0
FRAME_S = 0.064
HOP_S = 0.02
SPREAD_OFFSET = 0.474
MASKER_INDEX_DB = -6.0
SILENT_DB = -60.0
SALIENT_DB = -30.0
COLLISION_DB = 6.0
ROLE_PRIORITY_DB = {"texture": 6.0, "bed": 0.0, "event": -6.0}
MUSIC_PRIORITY_DB = 2.0
SYNTH_SR = 32000
SYNTH_S = 8.0


def _hz_to_erb(f: np.ndarray | float) -> np.ndarray | float:
    return 21.366 * np.log10(1.0 + np.asarray(f) * 4.37e-3)


def _erb_to_hz(e: np.ndarray | float) -> np.ndarray | float:
    return (10.0 ** (np.asarray(e) / 21.366) - 1.0) / 4.37e-3


EDGES_HZ = _erb_to_hz(np.linspace(_hz_to_erb(F_LOW), _hz_to_erb(F_HIGH), N_BANDS + 1))
CENTERS_ERB = (_hz_to_erb(EDGES_HZ[:-1]) + _hz_to_erb(EDGES_HZ[1:])) / 2.0
_dz = CENTERS_ERB[None, :] - CENTERS_ERB[:, None] + SPREAD_OFFSET
SPREAD = 10.0 ** ((15.81 + 7.5 * _dz - 17.5 * np.sqrt(1.0 + _dz ** 2)) / 10.0)
INDEX = 10.0 ** (MASKER_INDEX_DB / 10.0)


def band_frames(wav: np.ndarray, sr: int) -> np.ndarray:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    n_fft = int(round(FRAME_S * sr))
    hop = int(round(HOP_S * sr))
    n_frames = max(1, (mono.size - n_fft) // hop + 1)
    window = np.hanning(n_fft)
    frames = np.stack(
        [mono[i * hop: i * hop + n_fft] * window for i in range(n_frames)], axis=1
    )
    power = np.abs(np.fft.rfft(frames, axis=0)) ** 2 / n_fft
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    out = np.zeros((N_BANDS, n_frames))
    for b in range(N_BANDS):
        mask = (freqs >= EDGES_HZ[b]) & (freqs < EDGES_HZ[b + 1])
        if mask.any():
            out[b] = power[mask].sum(axis=0)
    return out


def masking_report(layers: list[np.ndarray], order: list[int]) -> list[dict]:
    n_frames = min(layer.shape[1] for layer in layers)
    layers = [layer[:, :n_frames] for layer in layers]
    spread = [SPREAD.T @ layer * INDEX for layer in layers]
    peak = max(layer.max() for layer in layers) + 1e-30

    reports = []
    for k, own in enumerate(layers):
        below = order[order.index(k) + 1:]
        threshold = sum((spread[j] for j in below), np.zeros_like(own))
        audible = own > peak * 10.0 ** (SILENT_DB / 10.0)
        salient = own > own.max(axis=0, keepdims=True) * 10.0 ** (SALIENT_DB / 10.0)
        considered = audible & salient
        total = own[considered].sum() + 1e-30
        masked = own[considered & (own < threshold)].sum()
        collided = own[considered & (own < threshold * 10.0 ** (COLLISION_DB / 10.0))].sum()
        margin = 10.0 * np.log10((own[considered] + 1e-30) / (threshold[considered] + 1e-30))
        reports.append({
            "masked_fraction": float(masked / total),
            "collided_fraction": float(collided / total),
            "median_margin_db": float(np.median(margin)) if margin.size else 0.0,
        })
    return reports


def rms_db(wav: np.ndarray) -> float:
    return float(20.0 * np.log10(np.sqrt(np.mean(wav ** 2)) + 1e-12))


def a_weighted_db(wav: np.ndarray, sr: int) -> float:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    spectrum = np.abs(np.fft.rfft(mono)) ** 2
    f2 = np.fft.rfftfreq(mono.size, 1.0 / sr) ** 2
    weight = (12194.0 ** 4 * f2 ** 2) / (
        (f2 + 20.6 ** 2)
        * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
        * (f2 + 12194.0 ** 2)
    )
    power = (spectrum * weight ** 2).sum() / mono.size ** 2
    return float(10.0 * np.log10(power + 1e-30))


def priority(element: dict, wav: np.ndarray, sr: int) -> float:
    role = element.get("role")
    if role not in ROLE_PRIORITY_DB:
        role = "event" if element.get("playback") == "oneshot" else "texture"
    bonus = ROLE_PRIORITY_DB[role] + (MUSIC_PRIORITY_DB if element.get("type") == "music" else 0.0)
    return a_weighted_db(wav, sr) + bonus


def priority_order(elements: list[dict], wavs: list[np.ndarray], srs: list[int]) -> list[int]:
    priorities = [priority(el, w, sr) for el, w, sr in zip(elements, wavs, srs)]
    return sorted(range(len(elements)), key=lambda i: priorities[i], reverse=True)


def score_scene(name: str, elements: list[dict]) -> dict | None:
    valid, wavs, srs = analyze(copy.deepcopy(elements))
    loops = [i for i, el in enumerate(valid) if el.get("playback") != "oneshot"]
    if len(loops) < 2:
        return None

    els = [valid[i] for i in loops]
    gains = assign_volumes(els, [wavs[i] for i in loops], [srs[i] for i in loops])
    dry = [wavs[i] * g for i, g in zip(loops, gains)]
    wet = [apply_eq(wavs[i], srs[i], valid[i]["eq_json"]) * g for i, g in zip(loops, gains)]
    carved = [
        apply_eq(wavs[i], srs[i], [b for b in valid[i]["eq_json"] if b.get("source") != "tone"]) * g
        for i, g in zip(loops, gains)
    ]
    sr = [srs[i] for i in loops]

    order = priority_order(els, dry, sr)
    before = masking_report([band_frames(w, s) for w, s in zip(dry, sr)], order)
    after = masking_report([band_frames(w, s) for w, s in zip(wet, sr)], order)
    masking_only = masking_report([band_frames(w, s) for w, s in zip(carved, sr)], order)

    layers = []
    for rank, i in enumerate(order):
        layers.append({
            "label": els[i].get("label"),
            "type": els[i].get("type"),
            "role": els[i].get("role"),
            "rank": rank,
            "volume": gains[i],
            "bands": els[i]["eq_json"],
            "eq_loss_db": round(rms_db(dry[i]) - rms_db(wet[i]), 2),
            "masked_before": round(before[i]["masked_fraction"], 4),
            "masked_after": round(after[i]["masked_fraction"], 4),
            "masked_masking_only": round(masking_only[i]["masked_fraction"], 4),
            "collided_before": round(before[i]["collided_fraction"], 4),
            "collided_after": round(after[i]["collided_fraction"], 4),
            "collided_masking_only": round(masking_only[i]["collided_fraction"], 4),
            "margin_before_db": round(before[i]["median_margin_db"], 2),
            "margin_after_db": round(after[i]["median_margin_db"], 2),
        })

    events = [
        {"label": valid[i].get("label"), "bands": valid[i]["eq_json"]}
        for i, el in enumerate(valid)
        if el.get("playback") == "oneshot"
    ]
    return {"scene": name, "layers": layers, "events": events}


def _noise(rng: np.random.Generator, n: int, tilt: float) -> np.ndarray:
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1.0 / SYNTH_SR)
    spectrum *= 1.0 / np.maximum(freqs, 20.0) ** (tilt / 2.0)
    return np.fft.irfft(spectrum, n)


def _band(signal: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, 1.0 / SYNTH_SR)
    spectrum[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spectrum, signal.size)


def _pad(t: np.ndarray, notes: list[float], seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros_like(t)
    for f0 in notes:
        for h in range(1, 7):
            out += np.sin(2 * np.pi * f0 * h * t + rng.random() * 6.28) / h ** 1.3
    return out * (0.75 + 0.25 * np.sin(2 * np.pi * 0.2 * t))


def _norm(x: np.ndarray, db: float) -> np.ndarray:
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * 10.0 ** (db / 20.0)


def synthetic_scenes(seed: int = 0) -> dict[str, list[tuple[dict, np.ndarray]]]:
    rng = np.random.default_rng(seed)
    n = int(SYNTH_SR * SYNTH_S)
    t = np.arange(n) / SYNTH_SR
    rain = _norm(_band(_noise(rng, n, 0.6), 300, 12000), -20)
    wind = _norm(_band(_noise(rng, n, 1.6), 80, 2500), -18)
    hum = _norm(_band(_noise(rng, n, 1.0), 150, 900) + 0.3 * np.sin(2 * np.pi * 110 * t), -19)
    pad = _norm(_pad(t, [220.0, 277.2, 329.6], 1), -22)
    cello = _norm(_pad(t, [130.8, 196.0], 2), -21)
    birds = _norm(_band(_noise(rng, n, 0.0), 2500, 7000) * (np.sin(2 * np.pi * 3 * t) > 0.6), -26)

    def layer(label: str, kind: str, role: str, audio: np.ndarray) -> tuple[dict, np.ndarray]:
        return {"label": label, "type": kind, "role": role, "playback": "loop"}, audio

    return {
        "synthetic: rain over pad": [
            layer("rain", "sound", "bed", rain),
            layer("pad", "music", "texture", pad),
        ],
        "synthetic: wind under cello": [
            layer("wind", "sound", "bed", wind),
            layer("cello", "music", "texture", cello),
        ],
        "synthetic: room hum, pad, birds": [
            layer("hum", "sound", "bed", hum),
            layer("pad", "music", "texture", pad),
            layer("birds", "sound", "texture", birds),
        ],
        "synthetic: three beds and a cello": [
            layer("rain", "sound", "bed", rain),
            layer("wind", "sound", "bed", wind),
            layer("hum", "sound", "bed", hum),
            layer("cello", "music", "texture", cello),
        ],
    }


def run_synthetic(scratch: Path) -> list[dict]:
    results = []
    for n, (name, layers) in enumerate(synthetic_scenes().items()):
        elements = []
        for i, (element, audio) in enumerate(layers):
            path = scratch / f"{n}_{i}.wav"
            sf.write(path, audio.astype(np.float32), SYNTH_SR, subtype="FLOAT")
            elements.append({**element, "prompt": "", "file": str(path), "looped": True})
        result = score_scene(name, elements)
        if result:
            results.append(result)
    return results


def run_stored(scenes_path: Path, audio_root: Path) -> list[dict]:
    results = []
    for scene in json.loads(scenes_path.read_text()):
        elements = [
            {
                "label": el["label"],
                "type": el["type"],
                "role": el.get("role"),
                "playback": el.get("playback") or "loop",
                "prompt": "",
                "file": str(audio_root / el["audio_path"]),
                "looped": True,
            }
            for el in scene["elements"]
        ]
        result = score_scene(f"#{scene['id']}: {scene['prompt'][:48]}", elements)
        if result:
            results.append(result)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--scenes", type=Path)
    parser.add_argument("--audio-root", type=Path)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as scratch:
        results = run_synthetic(Path(scratch))
    if args.scenes:
        results += run_stored(args.scenes, args.audio_root or args.scenes.parent / "audio")

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{args.name}.json"
    out.write_text(json.dumps(results, indent=1))
    print(f"{len(results)} scenes -> {out}")


if __name__ == "__main__":
    main()
