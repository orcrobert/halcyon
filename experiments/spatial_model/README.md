# spatial_model

Research experiment, not part of the shipped pipeline.

This directory holds the attempt to **learn** stereo placement for generated
elements from audio features. The result was negative — the learned model did not
beat the heuristic — so the shipped mixer uses the rule-based approach in
`mixer/mixer/effects/spatial.py` instead.

| File | Role |
|------|------|
| `src/` | STARSS23 pipeline: download, clip extraction, feature extraction, training |
| `build_dataset.py` | MUSDB18 variant — writes `data/spatial_dataset.csv` |
| `train_mlp.py` | Trains an MLP on that CSV, writes `mixer/models/*.pkl` |
| `train_spatial_model.ipynb` | Exploratory version of the same training run |

`src/` resolves paths relative to this directory. `build_dataset.py` and
`train_mlp.py` use paths relative to the working directory, so run them from the
repo root.

Kept for reproducibility and as the record of the comparison. The
`.pkl` artifacts under `mixer/models/` are outputs of this experiment and are not
loaded at runtime.
