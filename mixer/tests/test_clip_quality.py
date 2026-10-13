import numpy as np
import pytest
from scipy.signal import butter, sosfilt

from mixer.effects.quality import (
    QUALITY_SILENT_WEIGHT,
    clipped_fraction,
    inspect_clip,
    presence_fraction,
    quality_score,
    seam_steps,
)

SR = 16000


def _noise(seconds: float, scale: float = 0.05, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return scale * rng.standard_normal(int(SR * seconds))


def _sine(freq: float, seconds: float, amplitude: float = 0.3) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    return amplitude * np.sin(2 * np.pi * freq * t)


def _checks(issues: list[dict]) -> list[str]:
    return [issue["check"] for issue in issues]


@pytest.mark.parametrize("sr", [16000, 22050, 32000])
@pytest.mark.parametrize("seconds", [2.0, 4.0, 10.0])
def test_steady_noise_passes_every_check(sr, seconds):
    rng = np.random.default_rng(1)
    wav = 0.05 * rng.standard_normal(int(sr * seconds))

    assert inspect_clip(wav, sr, role="bed") == []


def test_a_low_tone_passes():
    assert inspect_clip(_sine(220.0, 10.0), SR) == []


def test_a_silent_clip_is_flagged_and_nothing_else():
    issues = inspect_clip(np.zeros(SR * 4), SR, role="bed")

    assert _checks(issues) == ["silent"]


def test_a_near_silent_clip_is_flagged():
    assert _checks(inspect_clip(_noise(4.0, scale=1e-4), SR)) == ["silent"]


def test_a_clipped_clip_is_flagged():
    wav = np.clip(_noise(4.0, scale=0.8), -1.0, 1.0)

    assert "clipping" in _checks(inspect_clip(wav, SR, role="bed"))


def test_a_single_full_scale_peak_is_not_clipping():
    wav = _noise(4.0)
    wav[SR] = 1.0

    assert clipped_fraction(wav[np.newaxis, :]) == 0.0


def test_clipping_is_checked_on_events_too():
    wav = np.zeros(SR * 2)
    wav[: SR // 2] = np.clip(_noise(0.5, scale=2.0), -1.0, 1.0)

    assert _checks(inspect_clip(wav, SR, role="event", playback="oneshot")) == [
        "clipping"
    ]


def test_a_burst_in_a_bed_is_flagged():
    wav = _noise(4.0, scale=0.01)
    wav[SR : SR + SR // 10] = _noise(0.1, scale=0.5)

    assert "burst" in _checks(inspect_clip(wav, SR, role="bed"))


def test_a_texture_tolerates_more_dynamics_than_a_bed():
    wav = _noise(10.0, scale=0.02)
    wav[SR : SR + SR // 10] *= 10.0

    assert "burst" in _checks(inspect_clip(wav, SR, role="bed"))
    assert "burst" not in _checks(inspect_clip(wav, SR, role="texture"))


def test_an_event_is_never_a_burst():
    wav = np.zeros(SR * 2)
    wav[SR // 4 : SR // 2] = _noise(0.25, scale=0.3)

    assert inspect_clip(wav, SR, role="event", playback="oneshot") == []


def test_a_gap_in_a_bed_is_a_dropout():
    wav = _noise(4.0)
    wav[SR : 2 * SR] = 0.0

    assert "dropout" in _checks(inspect_clip(wav, SR, role="bed"))


def test_a_gap_in_a_texture_is_allowed():
    wav = _noise(4.0)
    wav[SR : 2 * SR] = 0.0

    assert "dropout" not in _checks(inspect_clip(wav, SR, role="texture"))


def test_a_short_gap_in_a_bed_is_allowed():
    wav = _noise(4.0)
    wav[SR : SR + SR // 5] = 0.0

    assert "dropout" not in _checks(inspect_clip(wav, SR, role="bed"))


def test_energy_piled_into_the_presence_band_is_harsh():
    assert presence_fraction(_sine(3000.0, 4.0), SR) > 0.9
    assert "harsh" in _checks(inspect_clip(_sine(3000.0, 4.0), SR))


def test_broadband_noise_is_not_harsh():
    assert presence_fraction(_noise(4.0), SR) < 0.5


def test_a_clip_that_ends_louder_than_it_starts_has_a_bad_seam():
    rng = np.random.default_rng(2)
    n = SR * 10
    wav = rng.standard_normal(n) * 10.0 ** (np.linspace(-40.0, -20.0, n) / 20.0)

    level, _ = seam_steps(wav, SR)

    assert level > 6.0
    assert "seam" in _checks(inspect_clip(wav, SR, role="bed"))


def test_a_clip_that_changes_colour_has_a_bad_seam():
    dark = sosfilt(butter(4, 500.0, "lowpass", fs=SR, output="sos"), _noise(5.0, seed=5))
    bright = sosfilt(butter(4, 4000.0, "highpass", fs=SR, output="sos"), _noise(5.0, seed=6))
    wav = np.concatenate([dark, bright * (np.std(dark) / np.std(bright))])

    _, spectrum = seam_steps(wav, SR)

    assert spectrum > 8.0


def test_already_looped_clips_skip_the_seam_check():
    rng = np.random.default_rng(2)
    n = SR * 10
    wav = rng.standard_normal(n) * 10.0 ** (np.linspace(-40.0, -20.0, n) / 20.0)

    assert "seam" not in _checks(inspect_clip(wav, SR, role="bed", looped=True))


def test_stereo_clips_are_inspected():
    wav = np.stack([_noise(4.0, seed=3), _noise(4.0, seed=4)])

    assert inspect_clip(wav, SR, role="bed") == []


def test_inspection_does_not_modify_the_clip():
    wav = _noise(4.0)
    before = wav.copy()

    inspect_clip(wav, SR, role="bed")

    np.testing.assert_array_equal(wav, before)


def test_score_ranks_silence_far_below_other_issues():
    silent = [{"check": "silent", "value": -90.0, "limit": -50.0}]
    noisy = [
        {"check": "burst", "value": 20.0, "limit": 15.0},
        {"check": "harsh", "value": 0.7, "limit": 0.6},
    ]

    assert quality_score([]) == 0.0
    assert quality_score(noisy) == 2.0
    assert quality_score(silent) == QUALITY_SILENT_WEIGHT
