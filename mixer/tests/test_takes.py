import numpy as np
import pytest

from mixer.effects.events import rms_db
from mixer.effects.takes import TAKE_MATCH_MAX_DB, match_take


def _noise(sr: int, seconds: float, level: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return level * rng.standard_normal((1, int(sr * seconds)))


@pytest.mark.parametrize("sr", [16000, 32000])
def test_match_take_lands_on_the_reference_loudness(sr):
    reference = _noise(sr, 8.0, 0.1, seed=1)
    take = _noise(sr, 8.0, 0.03, seed=2)

    matched = match_take(take, sr, reference)

    assert abs(rms_db(matched) - rms_db(reference)) < 0.5


def test_match_take_trims_the_take_to_a_loop():
    sr = 16000
    take = _noise(sr, 8.0, 0.1, seed=3)

    matched = match_take(take, sr, _noise(sr, 8.0, 0.1, seed=4))

    assert matched.shape[0] == 1
    assert matched.shape[-1] < take.shape[-1]


def test_match_take_caps_the_gain():
    sr = 16000
    reference = _noise(sr, 6.0, 0.2, seed=5)
    take = _noise(sr, 6.0, 0.0005, seed=6)

    matched = match_take(take, sr, reference)

    gain_db = rms_db(matched) - rms_db(take)
    assert gain_db == pytest.approx(TAKE_MATCH_MAX_DB, abs=0.5)


def test_match_take_never_exceeds_full_scale():
    sr = 16000
    reference = _noise(sr, 6.0, 0.9, seed=7)
    take = _noise(sr, 6.0, 0.2, seed=8)

    matched = match_take(take, sr, reference)

    assert np.abs(matched).max() <= 1.0 + 1e-9


def test_match_take_accepts_mono_vectors():
    sr = 16000
    take = _noise(sr, 6.0, 0.1, seed=9)[0]

    matched = match_take(take, sr, _noise(sr, 6.0, 0.1, seed=10))

    assert matched.ndim == 2
