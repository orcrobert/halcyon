import numpy as np
import pytest

from mixer.effects import volume


@pytest.fixture(params=[True, False], ids=["librosa", "numpy"])
def feature_backend(request, monkeypatch):
    if request.param and not volume._LIBROSA:
        pytest.skip("librosa is unavailable")
    monkeypatch.setattr(volume, "_LIBROSA", request.param)


def tone(sr, hz=300, amplitude=0.1):
    return (amplitude * np.sin(2 * np.pi * hz * np.arange(sr * 2) / sr))[None, :]


def gains(wavs, sr):
    return np.array(volume.assign_volumes(
        [{"type": "sound"} for _ in wavs], wavs, [sr] * len(wavs)
    ))


@pytest.mark.parametrize("sr", [16000, 48000])
def test_single_layer_keeps_its_level(feature_backend, sr):
    assert gains([tone(sr)], sr) == pytest.approx([1.0])


@pytest.mark.parametrize("sr", [16000, 48000])
def test_near_identical_tones_keep_similar_levels(feature_backend, sr):
    reference = gains([tone(sr), tone(sr)], sr)
    assert reference[0] == reference[1]
    for hz in (299, 301, 305):
        actual = gains([tone(sr), tone(sr, hz)], sr)
        assert np.max(np.abs(20 * np.log10(actual / reference))) < 1.0
        assert abs(20 * np.log10(actual[0] / actual[1])) < 1.0


def test_small_level_changes_do_not_switch_overlap_penalties(feature_backend):
    sr = 16000
    reference = gains([tone(sr), tone(sr)], sr)
    for db in (-0.01, 0.01):
        actual = gains([tone(sr), tone(sr, amplitude=0.1 * 10 ** (db / 20))], sr)
        assert np.max(np.abs(20 * np.log10(actual / reference))) < 0.1


def test_near_equal_scores_do_not_switch_between_different_loudness_anchors(feature_backend):
    sr = 16000
    reference = gains([tone(sr), tone(sr, amplitude=0.02)], sr)
    for hz in (299, 301):
        actual = gains([tone(sr), tone(sr, hz, 0.02)], sr)
        assert np.max(np.abs(20 * np.log10(actual / reference))) < 0.1


def test_steady_tone_has_no_onset_priority():
    if not volume._LIBROSA:
        pytest.skip("librosa is unavailable")
    assert volume._extract_features(tone(48000), 48000)["onset_density"] == 0.0


def test_pulsed_source_retains_onset_priority():
    if not volume._LIBROSA:
        pytest.skip("librosa is unavailable")
    sr = 16000
    wav = tone(sr, 1000)
    envelope = np.tile(np.concatenate([np.zeros(sr // 4), np.ones(sr // 4)]), 4)
    assert volume._extract_features(wav * envelope, sr)["onset_density"] > 0.0


def test_layer_order_does_not_change_the_mix(feature_backend):
    sr = 16000
    rng = np.random.default_rng(7)
    wavs = [tone(sr), tone(sr, 301, 0.05), rng.normal(0, 0.02, (1, sr * 2))]
    assert gains(wavs, sr) == pytest.approx(gains(wavs[::-1], sr)[::-1])


def test_dense_identical_layers_share_bounded_attenuation(feature_backend):
    actual = gains([tone(16000)] * 12, 16000)
    assert np.all(actual == actual[0])
    assert actual[0] >= 0.5


def test_louder_source_is_attenuated_without_amplifying_quiet_source(feature_backend):
    actual = gains([tone(16000, amplitude=0.05), tone(16000, amplitude=0.1)], 16000)
    assert 0.15 <= actual[1] < actual[0] <= 1.0


def test_empty_scene_has_no_gains():
    assert volume.assign_volumes([], [], []) == []
