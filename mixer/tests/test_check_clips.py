import numpy as np
import soundfile as sf

from scripts.check_clips import main

SR = 16000


def test_the_script_reports_each_clip_and_a_tally(tmp_path, capsys):
    rng = np.random.default_rng(0)
    sf.write(tmp_path / "rain.wav", rng.normal(0, 0.05, SR * 4), SR)
    sf.write(tmp_path / "hot.wav", np.clip(rng.normal(0, 0.8, SR * 4), -1, 1), SR)
    sf.write(tmp_path / "quiet.wav", np.zeros(SR * 4), SR)
    (tmp_path / "broken.wav").write_bytes(b"junk")

    assert main([str(tmp_path), "--role", "bed"]) == 0

    out = capsys.readouterr().out
    rows = {line.split()[-1]: line for line in out.splitlines() if line.endswith(".wav")}
    assert rows["rain.wav"].startswith("ok")
    assert "clipping" in out
    assert "silent" in out
    assert "unreadable" in out
    assert "3 of 4 clips flagged as bed" in out


def test_the_script_fails_on_an_empty_folder(tmp_path):
    assert main([str(tmp_path)]) == 1
