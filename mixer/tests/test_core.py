import os

import numpy as np
import pytest
import soundfile as sf

from mixer.core import analyze, mix_to_file
from mixer.effects.looping import make_loopable
from mixer.effects.spatial import apply_pan, assign_spatial


def _sine(freq: float, sr: int, seconds: float) -> np.ndarray:
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    return 0.3 * np.sin(2 * np.pi * freq * t).astype(np.float32)


def _noise(sr: int, seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (0.2 * rng.standard_normal(int(sr * seconds))).astype(np.float32)


@pytest.fixture
def elements(tmp_path):
    sr = 22050
    signals = {
        "bass_drone": _sine(60.0, sr, 4.0),
        "hiss": _sine(9000.0, sr, 4.0),
        "texture": _noise(sr, 4.0, seed=7),
    }
    els = []
    for i, (label, mono) in enumerate(signals.items()):
        path = os.path.join(tmp_path, f"{label}.wav")
        sf.write(path, mono, sr)
        els.append({
            "label": label,
            "type": "music" if label == "bass_drone" else "sound",
            "prompt": label,
            "file": path,
        })
    return els


def test_analyze_annotates_every_element(elements):
    valid, wavs, srs = analyze(elements)

    assert len(valid) == len(elements)
    assert len(wavs) == len(valid)
    assert len(srs) == len(valid)

    for el in valid:
        assert isinstance(el["eq_json"], list)
        assert 0.15 <= el["volume"] <= 1.0
        assert -0.85 <= el["pan"] <= 0.85
        assert 0.0 <= el["depth"] <= 0.8


def test_analyze_loops_clips_by_default(tmp_path):
    sr = 22050
    path = os.path.join(tmp_path, "long.wav")
    sf.write(path, _noise(sr, 8.0, seed=3), sr)
    element = {"label": "long", "type": "sound", "prompt": "long", "file": path}

    _, wavs, _ = analyze([element])

    assert wavs[0].shape[-1] < int(sr * 8.0)


def test_analyze_leaves_already_looped_clips_at_their_length(tmp_path, elements):
    sr = 22050
    path = os.path.join(tmp_path, "long.wav")
    sf.write(path, _noise(sr, 8.0, seed=3), sr)
    elements.append({"label": "long", "type": "sound", "prompt": "long", "file": path})
    for element in elements:
        element["looped"] = True

    valid, wavs, _ = analyze(elements)

    for element, wav in zip(elements, wavs):
        original, _ = sf.read(element["file"], always_2d=True)
        assert wav.shape[-1] == original.shape[0]

    for element in valid:
        assert isinstance(element["eq_json"], list)
        assert 0.15 <= element["volume"] <= 1.0


def test_analyze_skips_missing_files(elements):
    elements.append({"label": "ghost", "type": "sound", "prompt": "x", "file": "/no/such.wav"})
    valid, _, _ = analyze(elements)
    assert all(el["label"] != "ghost" for el in valid)


def test_analyze_empty_input():
    valid, wavs, srs = analyze([])
    assert valid == [] and wavs == [] and srs == []


def test_eq_bands_have_valid_shape(elements):
    valid, _, _ = analyze(elements)
    for el in valid:
        for band in el["eq_json"]:
            assert band["type"] in ("lowshelf", "peaking", "highshelf")
            assert "freq" in band and "gain" in band


def test_mix_to_file_produces_normalized_stereo(elements, tmp_path):
    out = os.path.join(tmp_path, "mixed.wav")
    result = mix_to_file(elements, out)

    assert os.path.exists(result)
    mixed, sr = sf.read(result, always_2d=True)
    assert mixed.shape[1] == 2
    assert np.abs(mixed).max() <= 1.0 + 1e-6


def test_mix_to_file_rejects_empty():
    with pytest.raises(ValueError):
        mix_to_file([], "unused.wav")


def test_apply_pan_hard_left_silences_right():
    wav = _sine(440.0, 22050, 1.0)
    out = apply_pan(wav, -1.0)
    assert out.shape[0] == 2
    assert np.abs(out[1]).max() < 1e-6
    assert np.abs(out[0]).max() > 0.0


def test_apply_pan_hard_right_silences_left():
    wav = _sine(440.0, 22050, 1.0)
    out = apply_pan(wav, 1.0)
    assert np.abs(out[0]).max() < 1e-6
    assert np.abs(out[1]).max() > 0.0


def test_apply_pan_center_is_equal_power():
    wav = _sine(440.0, 22050, 1.0)
    out = apply_pan(wav, 0.0)
    assert np.allclose(out[0], out[1])


def test_assign_spatial_matches_input_length():
    sr = 22050
    els = [(_sine(120.0, sr, 2.0), sr), (_sine(6000.0, sr, 2.0), sr)]
    spatial = assign_spatial(els)
    assert len(spatial) == 2
    for pan, depth in spatial:
        assert -0.85 <= pan <= 0.85
        assert 0.0 <= depth <= 0.8


def test_make_loopable_preserves_channel_layout():
    sr = 22050
    stereo = np.stack([_sine(200.0, sr, 3.0), _sine(200.0, sr, 3.0)])
    looped = make_loopable(stereo, sr)
    assert looped.ndim == 2
    assert looped.shape[0] == 2


def test_make_loopable_handles_short_clip():
    sr = 22050
    short = _sine(200.0, sr, 0.05)[np.newaxis, :]
    looped = make_loopable(short, sr)
    assert looped.shape[0] == 1
    assert looped.shape[1] <= short.shape[1]
