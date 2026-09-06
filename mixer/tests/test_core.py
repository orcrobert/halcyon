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


def _hot_transients(sr: int, seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(sr * seconds)
    mono = 0.15 * rng.standard_normal(n)
    burst = np.exp(-np.arange(800) / 150.0) * np.sin(np.arange(800) * 0.9)
    for start in rng.integers(0, n - 800, 40):
        mono[start:start + 800] += rng.uniform(4.0, 8.0) * burst
    mono = mono / np.sqrt(np.mean(mono ** 2)) * 10 ** (-14 / 20)
    return np.tanh(mono).astype(np.float32)


def _correlated_pad(sr: int, seconds: float) -> np.ndarray:
    t = np.arange(int(sr * seconds)) / sr
    mono = sum(np.sin(2 * np.pi * f * t) for f in (110.0, 165.0, 220.0, 330.0))
    mono = mono / np.sqrt(np.mean(mono ** 2)) * 10 ** (-14 / 20)
    return np.tanh(mono).astype(np.float32)


def test_make_loopable_never_exceeds_full_scale():
    sr = 16000
    looped = make_loopable(_hot_transients(sr, 10.0, seed=3)[np.newaxis, :], sr)
    assert np.abs(looped).max() <= 1.0


def test_make_loopable_does_not_swell_at_the_loop_head():
    sr = 16000
    n_fade = int(1.5 * sr)
    looped = make_loopable(_correlated_pad(sr, 10.0)[np.newaxis, :], sr)[0]
    head = looped[n_fade // 2 - 800 : n_fade // 2 + 800]
    body = looped[n_fade:]
    ratio_db = 20 * np.log10(np.sqrt(np.mean(head ** 2)) / np.sqrt(np.mean(body ** 2)))
    assert abs(ratio_db) < 1.0


def test_make_loopable_seam_is_continuous():
    sr = 16000
    looped = make_loopable(_correlated_pad(sr, 10.0)[np.newaxis, :], sr)[0]
    assert abs(looped[0] - looped[-1]) < 0.05


def test_find_loop_point_scales_the_window_with_length():
    from mixer.effects.looping import find_loop_point

    sr = 16000
    long_clip = _correlated_pad(sr, 10.0)[np.newaxis, :]
    short_clip = _correlated_pad(sr, 4.0)[np.newaxis, :]

    assert int(5.5 * sr) <= find_loop_point(long_clip, sr) <= int(8.5 * sr)
    assert int(2.0 * sr) <= find_loop_point(short_clip, sr) <= int(3.2 * sr)


def test_make_loopable_keeps_most_of_a_short_bed():
    sr = 16000
    looped = make_loopable(_correlated_pad(sr, 4.0)[np.newaxis, :], sr)[0]

    assert len(looped) >= 2 * sr
    assert np.abs(looped).max() <= 1.0
    assert abs(looped[0] - looped[-1]) < 0.05


def test_analyze_leaves_one_shots_untrimmed(tmp_path):
    sr = 22050
    path = os.path.join(tmp_path, "bark.wav")
    sf.write(path, _noise(sr, 2.0, seed=5), sr)

    element = {
        "label": "bark",
        "type": "sound",
        "prompt": "bark",
        "playback": "oneshot",
        "file": path,
    }
    _, wavs, _ = analyze([element])

    assert wavs[0].shape[-1] == int(sr * 2.0)


def _one_shot(sr: int, seconds: float, lead_s: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros(int(sr * seconds), dtype=np.float32)
    start = int(sr * lead_s)
    body = int(sr * 0.4)
    envelope = np.exp(-np.arange(body) / (sr * 0.12))
    tone = np.sin(2 * np.pi * 420.0 * np.arange(body) / sr)
    out[start:start + body] = (0.6 * envelope * tone).astype(np.float32)
    out += (1e-5 * rng.standard_normal(len(out))).astype(np.float32)
    return out


def _write(tmp_path, name: str, mono: np.ndarray, sr: int) -> str:
    path = os.path.join(tmp_path, name)
    sf.write(path, mono, sr)
    return path


def test_trim_to_envelope_drops_the_silence_around_a_one_shot():
    from mixer.effects.events import trim_to_envelope

    sr = 22050
    trimmed = trim_to_envelope(_one_shot(sr, 2.0, 1.2, seed=1)[np.newaxis, :], sr)

    assert 0.2 * sr <= trimmed.shape[-1] <= 0.7 * sr
    assert abs(float(trimmed[0, 0])) < 1e-3
    assert abs(float(trimmed[0, -1])) < 1e-3


def test_trim_to_envelope_returns_nothing_for_silence():
    from mixer.effects.events import trim_to_envelope

    sr = 22050
    assert trim_to_envelope(np.zeros((1, sr)), sr).shape[-1] == 0


def test_analyze_trims_one_shots_and_never_crossfades_them(tmp_path):
    sr = 22050
    element = {
        "label": "hoot",
        "type": "sound",
        "prompt": "single owl hoot",
        "playback": "oneshot",
        "file": _write(tmp_path, "hoot.wav", _one_shot(sr, 2.0, 1.2, seed=2), sr),
    }

    valid, wavs, _ = analyze([element])

    assert len(valid) == 1
    assert wavs[0].shape[-1] < int(sr * 1.0)
    assert valid[0]["depth"] == pytest.approx(0.35)
    assert valid[0]["pan"] == 0.0


def test_analyze_drops_a_one_shot_that_came_back_empty(tmp_path):
    sr = 22050
    bed = {
        "label": "rain",
        "type": "sound",
        "prompt": "rain",
        "file": _write(tmp_path, "rain.wav", _noise(sr, 4.0, seed=3), sr),
    }
    dud = {
        "label": "hoot",
        "type": "sound",
        "prompt": "hoot",
        "playback": "oneshot",
        "file": _write(tmp_path, "dud.wav", np.zeros(sr, dtype=np.float32), sr),
    }

    valid, wavs, _ = analyze([bed, dud])

    assert [element["label"] for element in valid] == ["rain"]
    assert len(wavs) == 1


def test_events_do_not_move_the_volume_anchor(tmp_path):
    sr = 22050
    beds = [
        {
            "label": "rain",
            "type": "sound",
            "prompt": "rain",
            "file": _write(tmp_path, "rain.wav", _noise(sr, 4.0, seed=4), sr),
        },
        {
            "label": "drone",
            "type": "music",
            "prompt": "drone",
            "file": _write(tmp_path, "drone.wav", _sine(80.0, sr, 4.0), sr),
        },
    ]
    event = {
        "label": "hoot",
        "type": "sound",
        "prompt": "hoot",
        "playback": "oneshot",
        "file": _write(tmp_path, "hoot.wav", _one_shot(sr, 2.0, 1.2, seed=5), sr),
    }

    without, _, _ = analyze([dict(bed) for bed in beds])
    with_event, _, _ = analyze([dict(bed) for bed in beds] + [dict(event)])

    assert [round(e["volume"], 3) for e in with_event[:2]] == [
        round(e["volume"], 3) for e in without
    ]


def test_place_events_stays_inside_the_allowed_range():
    from mixer.effects.events import EVENT_VOLUME_RANGE, place_events

    sr = 22050
    quiet = 1e-4 * _one_shot(sr, 1.0, 0.1, seed=6)[np.newaxis, :]
    loud = 40.0 * _one_shot(sr, 1.0, 0.1, seed=7)[np.newaxis, :]

    low, high = EVENT_VOLUME_RANGE
    for volume, pan, depth in place_events([quiet, loud], -18.0):
        assert low <= volume <= high
        assert pan == 0.0
        assert 0.0 <= depth <= 1.0


def test_place_events_falls_back_when_there_is_no_loop_layer():
    from mixer.effects.events import (
        EVENT_FALLBACK_ANCHOR_DB,
        EVENT_OFFSET_DB,
        place_events,
        rms_db,
    )

    sr = 22050
    clip = _one_shot(sr, 1.0, 0.1, seed=8)[np.newaxis, :]

    volume = place_events([clip], None)[0][0]
    expected = 10.0 ** (
        (EVENT_FALLBACK_ANCHOR_DB + EVENT_OFFSET_DB - rms_db(clip)) / 20.0
    )

    assert volume == pytest.approx(min(expected, 1.0), abs=1e-3)


def test_mix_to_file_scatters_one_shots_instead_of_tiling(tmp_path):
    sr = 22050
    elements = [
        {
            "label": "rain",
            "type": "sound",
            "prompt": "rain",
            "file": _write(tmp_path, "rain.wav", _noise(sr, 6.0, seed=9), sr),
        },
        {
            "label": "hoot",
            "type": "sound",
            "prompt": "hoot",
            "playback": "oneshot",
            "interval_min_s": 2.0,
            "interval_max_s": 3.0,
            "file": _write(tmp_path, "hoot.wav", _one_shot(sr, 2.0, 1.2, seed=10), sr),
        },
    ]

    output = mix_to_file(elements, os.path.join(tmp_path, "mixed.wav"))
    mixed, out_sr = sf.read(output)

    assert out_sr == sr
    assert mixed.shape[0] < int(sr * 6.5)
