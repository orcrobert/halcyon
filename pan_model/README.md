# pan_model

Research experiment, not part of the shipped pipeline.

This directory holds the attempt to **learn** stereo placement for generated
elements from audio features (feature extraction, dataset building, training in
`src/` and `notebooks/train_spatial_model.ipynb`). The result was negative — the
learned model did not beat the heuristic — so the shipped mixer uses the
rule-based approach in `mixer/mixer/effects/spatial.py` instead.

Kept for reproducibility and because the thesis documents the comparison. The
`.pkl` artifacts under `mixer/models/` are outputs of this experiment and are not
loaded at runtime.
