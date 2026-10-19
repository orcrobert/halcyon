import numpy as np
import pytest

from mixer.effects import auto_eq as auto_eq_module
from mixer.effects.auto_eq import (
    _BAND_NYQUIST_RATIO,
    _MASKING_BUDGET_DB,
    _MASKING_CAP_DB,
    _MASKING_Q_RANGE,
    _MERGE_FLOOR_DB,
    _merge_bands,
    _role,
    auto_eq,
)
from mixer.effects.eq import apply_eq

SR = 32000
SECONDS = 4


def _band_noise(rng: np.random.Generator, lo: float, hi: float, sr: int = SR) -> np.ndarray:
    spectrum = np.fft.rfft(rng.standard_normal(sr * SECONDS))
    freqs = np.fft.rfftfreq(sr * SECONDS, 1.0 / sr)
    spectrum[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spectrum, sr * SECONDS)


def _pad() -> np.ndarray:
    t = np.arange(SR * SECONDS) / SR
    return 0.02 * sum(np.sin(2 * np.pi * f * t) for f in (400.0, 500.0, 600.0))


def _bed(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return 0.03 * _band_noise(rng, 200, 6000) + 0.25 * _band_noise(rng, 350, 700)


def _layer(kind: str, role: str | None, playback: str = "loop") -> dict:
    return {"type": kind, "role": role, "playback": playback}


def _masking(bands: list[dict]) -> list[dict]:
    return [b for b in bands if b["source"] in ("masking", "both")]


def _scene(pad_role: str | None, bed_role: str | None, gains=(1.0, 1.0), pad_playback="loop"):
    return auto_eq(
        [_pad()[np.newaxis, :], _bed()[np.newaxis, :]],
        [SR, SR],
        [_layer("music", pad_role, pad_playback), _layer("sound", bed_role)],
        list(gains),
    )


def test_the_less_important_layer_is_cut_where_it_buries_the_other():
    pad, bed = _scene("texture", "bed")
    assert not _masking(pad)
    cuts = _masking(bed)
    assert cuts
    assert all(350 <= b["freq"] <= 700 for b in cuts)
    assert all(b["type"] == "peaking" and b["gain"] < 0 for b in cuts)


def test_swapping_the_roles_swaps_who_is_cut():
    pad, bed = _scene("bed", "texture")
    assert _masking(pad)
    assert not _masking(bed)


def test_a_quiet_enough_masker_is_left_alone():
    pad, bed = _scene("texture", "bed", gains=(1.0, 0.3))
    assert not _masking(pad)
    assert not _masking(bed)


def test_an_event_never_causes_a_cut_on_a_loop_layer():
    event, bed = _scene("event", "bed", pad_playback="oneshot")
    assert not _masking(bed)
    assert _masking(event)


def test_an_event_is_measured_against_the_whole_loop_not_its_opening():
    pad = _pad()
    pad[: SR * 2] = 0.0
    rng = np.random.default_rng(1)
    burst = 0.25 * _band_noise(rng, 350, 700)[: SR // 2]
    _, event = auto_eq(
        [pad[np.newaxis, :], burst[np.newaxis, :]],
        [SR, SR],
        [_layer("music", "texture"), _layer("sound", "event", "oneshot")],
        [1.0, 1.0],
    )
    assert _masking(event)


def test_an_event_that_outranks_the_loop_is_left_alone():
    event, bed = _scene("event", "bed", gains=(60.0, 1.0), pad_playback="oneshot")
    assert not _masking(event)
    assert not _masking(bed)


def test_a_masking_cut_beside_a_shelf_keeps_the_merge_floor():
    shelf = {"type": "lowshelf", "freq": 80, "gain": -6.0, "q": 0.7, "source": "tone"}
    cut = {"type": "peaking", "freq": 90, "gain": -4.5, "q": 1.2, "source": "masking"}
    merged = _merge_bands([shelf], [cut])
    assert sum(b["gain"] for b in merged) >= _MERGE_FLOOR_DB - 1e-9
    assert [b["type"] for b in merged] == ["lowshelf", "peaking"]

    floored = _merge_bands([{**shelf, "gain": _MERGE_FLOOR_DB}], [cut])
    assert floored == [{**shelf, "gain": _MERGE_FLOOR_DB}]


def test_a_missing_role_falls_back_by_playback():
    assert _role({"playback": "oneshot"}) == "event"
    assert _role({"playback": "loop"}) == "texture"
    assert _role({"role": "Bed", "playback": "loop"}) == "bed"
    assert _role({"role": "unknown", "playback": "loop"}) == "texture"


def test_masking_cuts_stay_gentle():
    for bands in _scene("texture", "bed"):
        for band in _masking(bands):
            assert -_MASKING_CAP_DB - 1e-9 <= band["gain"] < 0
            assert _MASKING_Q_RANGE[0] <= band["q"] <= _MASKING_Q_RANGE[1]


def test_a_layer_buried_across_its_whole_body_loses_no_more_than_the_budget():
    rng = np.random.default_rng(4)
    bed = 0.3 * _band_noise(rng, 350, 700)
    _, bed_bands = auto_eq(
        [_pad()[np.newaxis, :], bed[np.newaxis, :]],
        [SR, SR],
        [_layer("music", "texture"), _layer("sound", "bed")],
        [1.0, 0.6],
    )
    cuts = _masking(bed_bands)
    assert cuts
    carved = apply_eq(bed[np.newaxis, :], SR, cuts)
    loss_db = 10.0 * np.log10(np.mean(bed ** 2) / np.mean(carved ** 2))
    assert loss_db <= _MASKING_BUDGET_DB + 0.5


def test_no_cut_lands_above_what_a_low_rate_layer_can_carry():
    rng = np.random.default_rng(2)
    low_sr = 16000
    hiss = 0.2 * _band_noise(rng, 2000, 7900, low_sr)
    air = 0.05 * _band_noise(rng, 2000, 15000)
    for bands in auto_eq(
        [air[np.newaxis, :], hiss[np.newaxis, :]],
        [SR, low_sr],
        [_layer("sound", "texture"), _layer("sound", "bed")],
        [1.0, 1.0],
    ):
        for band in _masking(bands):
            assert band["freq"] < _BAND_NYQUIST_RATIO * low_sr / 2


def test_every_band_says_where_it_came_from():
    for bands in _scene("texture", "bed"):
        for band in bands:
            assert band["source"] in ("tone", "masking", "both")


def test_the_numpy_path_carves_the_same_way(monkeypatch):
    monkeypatch.setattr(auto_eq_module, "_LIBROSA", False)
    pad, bed = _scene("texture", "bed")
    assert not _masking(pad)
    assert _masking(bed)


def _band_level(sr: int) -> float:
    t = np.arange(sr * SECONDS) / sr
    tone = (0.1 * np.sin(2 * np.pi * 1000.0 * t)).astype(np.float32)
    S, freqs = auto_eq_module._stft_power(tone, sr)
    return float(auto_eq_module._band_power_frames(S, freqs).sum(axis=0).mean())


@pytest.mark.parametrize("sr", [16000, 32000])
def test_band_levels_do_not_depend_on_the_sample_rate(sr):
    assert 10.0 * np.log10(_band_level(sr) / _band_level(48000)) == pytest.approx(0.0, abs=0.5)
