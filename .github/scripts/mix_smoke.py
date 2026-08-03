import numpy as np
import soundfile as sf

from mixer.core import analyze

SAMPLE_RATE = 22050

rng = np.random.default_rng(0)
sf.write(
    "/tmp/ci-tone.wav",
    rng.normal(0, 0.05, SAMPLE_RATE * 2).astype(np.float32),
    SAMPLE_RATE,
)

valid, wavs, srs = analyze(
    [{"file": "/tmp/ci-tone.wav", "label": "noise", "type": "sound"}]
)

assert valid, "analyze returned no usable elements"
assert valid[0].get("eq_json"), f"no EQ computed: {valid[0]}"
assert srs and wavs, "analyze returned no audio"

print(f"mixer analyze OK: volume={valid[0]['volume']} pan={valid[0]['pan']}")
