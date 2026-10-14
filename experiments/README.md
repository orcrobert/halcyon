# Experiments

Research code and results. None of this runs in production — nothing under
`api/`, `mixer/`, or `frontend/` imports from here. Each subdirectory is one
experiment and holds its own code, data and write-up.

| Directory | Question | Outcome |
|-----------|----------|---------|
| [`llm_eval/`](llm_eval/) | Which LLM decomposes a scene prompt most reliably? | Mistral and Gemini Flash usable; Llama 3.1 breaks the output schema |
| [`spatial_model/`](spatial_model/) | Can stereo placement be learned from audio features? | Negative — the learned model did not beat the heuristic; the mixer stays rule-based |
| [`masking_eq/`](masking_eq/) | Does a role-and-loudness masking EQ unmask the important layer? | Same unmasking as before at lower cost: fewer, shallower cuts, priority layer left alone |

## llm_eval

Decomposition benchmark: 20 prompts × 3 models × 3 runs, scored on schema
validity, element count, coverage and duplication.

```
pip install -r experiments/llm_eval/requirements.txt
python experiments/llm_eval/run.py --model all
python experiments/llm_eval/score.py
```

`run.py` reads the repo-root `.env` for credentials and the live decomposer
prompt from `api/prompts/decomposer.txt`, then writes one JSON file per run to
`runs/<model>/`. `score.py` reads those back and regenerates `results.csv` and
`results.md`. It leaves `manual_scoring.md` alone once that file exists, because
the scores in it are hand-entered.

## spatial_model

Feature extraction, dataset building and training for the learned pan model.
`src/` is the STARSS23 pipeline; `build_dataset.py` and `train_mlp.py` are the
MUSDB18 variant and run from the repo root:

```
python experiments/spatial_model/build_dataset.py --musdb /path/to/MUSDB18
python experiments/spatial_model/train_mlp.py
```

The `.pkl` artifacts these write under `mixer/models/` are experiment outputs and
are not loaded at runtime. See [`spatial_model/README.md`](spatial_model/README.md).

## masking_eq

Before/after benchmark for the masking stage of `auto_eq`, on synthetic scenes
and on stored atmospheres exported from a running instance. Details and the
result table are in [`masking_eq/README.md`](masking_eq/README.md).

```
python experiments/masking_eq/run.py --name masking --scenes corpus/scenes.json
python experiments/masking_eq/compare.py baseline masking
```
