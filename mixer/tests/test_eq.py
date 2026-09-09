import os

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import sosfreqz

from mixer.core import analyze
from mixer.effects.auto_eq import auto_eq
from mixer.effects.eq import _peak, _shelf, apply_eq
from mixer.effects.looping import PEAK_CEILING, make_loopable

SR = 48000


def _response_db(sos: np.ndarray, freqs: np.ndarray) -> np.ndarray:
    _, h = sosfreqz(sos, worN=freqs * 2 * np.pi / SR)
    return 20.0 * np.log10(np.abs(h) + 1e-30)


def test_peaking_cut_reaches_its_gain_and_leaves_the_rest_alone():
    db = _response_db(_peak(1000.0, -4.2, 1.2, SR), np.array([50, 1000, 15000]))
    assert db[1] == pytest.approx(-4.2, abs=0.05)
    assert db[0] == pytest.approx(0.0, abs=0.2)
    assert db[2] == pytest.approx(0.0, abs=0.2)


def test_peaking_is_symmetric_in_gain():
    freqs = np.array([200, 700, 1000, 1400, 5000])
    cut = _response_db(_peak(1000.0, -3.0, 1.2, SR), freqs)
    boost = _response_db(_peak(1000.0, 3.0, 1.2, SR), freqs)
    assert cut == pytest.approx(-boost, abs=0.01)


def test_shelf_reaches_its_gain_in_the_band_it_targets():
    low = _response_db(_shelf(200.0, -6.0, "low", SR), np.array([10, 200, 8000]))
    assert low[0] == pytest.approx(-6.0, abs=0.1)
    assert low[1] == pytest.approx(-3.0, abs=0.3)
    assert low[2] == pytest.approx(0.0, abs=0.1)

    high = _response_db(_shelf(8000.0, -6.0, "high", SR), np.array([100, 20000]))
    assert high[0] == pytest.approx(0.0, abs=0.3)
    assert high[1] == pytest.approx(-6.0, abs=0.6)


def test_applying_a_cut_never_makes_the_signal_louder():
    rng = np.random.default_rng(3)
    wav = 0.4 * rng.standard_normal((1, SR))
    bands = [{"type": "peaking", "freq": 1000.0, "gain": -4.0, "q": 1.2}]
    assert np.abs(apply_eq(wav, SR, bands)).max() <= np.abs(wav).max() + 1e-9


def test_auto_eq_gives_every_band_a_positive_q():
    rng = np.random.default_rng(11)
    wavs = [0.3 * rng.standard_normal((1, SR)) for _ in range(2)]
    elements = [{"type": "sound"}, {"type": "music"}]
    for bands in auto_eq(wavs, [SR, SR], elements):
        for band in bands:
            assert band["q"] > 0


def test_analyze_keeps_every_clip_under_the_ceiling(tmp_path):
    rng = np.random.default_rng(5)
    elements = []
    for i, playback in enumerate(("loop", "oneshot")):
        mono = np.clip(1.4 * rng.standard_normal(SR * 2), -1.0, 1.0)
        path = os.path.join(tmp_path, f"{i}.wav")
        sf.write(path, mono.astype(np.float32), SR, subtype="FLOAT")
        elements.append({
            "label": f"el{i}",
            "type": "sound",
            "prompt": "x",
            "file": path,
            "playback": playback,
            "looped": True,
        })

    _, wavs, _ = analyze(elements)
    assert wavs
    for wav in wavs:
        assert np.abs(wav).max() <= PEAK_CEILING + 1e-9


def _swelling_drone(sr: int, seconds: float, f0: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(int(sr * seconds)) / sr
    envelope = 1.0 + 0.75 * np.sin(2 * np.pi * 0.75 * t + rng.random() * 6.28)
    tone = np.sin(2 * np.pi * f0 * t) + 0.35 * np.sin(2 * np.pi * 2 * f0 * t + 0.7)
    signal = tone * envelope + 0.04 * rng.standard_normal(t.size)
    return (0.3 * signal / np.abs(signal).max())[np.newaxis, :]


def _seam_step_db(looped: np.ndarray, sr: int) -> float:
    mono = looped.mean(axis=0)
    window = int(0.05 * sr)
    head = np.sqrt(np.mean(mono[:window] ** 2))
    tail = np.sqrt(np.mean(mono[-window:] ** 2))
    return abs(20.0 * np.log10((head + 1e-12) / (tail + 1e-12)))


@pytest.mark.parametrize("seed", range(6))
def test_a_swelling_drone_loops_without_a_level_step(seed):
    sr = 16000
    looped = make_loopable(_swelling_drone(sr, 4.0, 60.0 + 7 * seed, seed), sr)
    assert _seam_step_db(looped, sr) < 1.5
