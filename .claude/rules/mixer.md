---
paths:
  - "mixer/**"
---

# Mixer rules

Applies to `mixer/`, the DSP core. Changes here alter the sound of every
generated atmosphere, so treat them as high-stakes. Full map in
[architecture.md](../docs/architecture.md).

## Public API: keep it stable

`mixer/mixer/core.py`:

- `analyze(elements) -> (valid, wavs, srs)` annotates each element dict in place
  with `eq_json`, `volume`, `pan` and `depth`. Called by
  `api/app/services/pipeline.py`.
- `mix_to_file(elements, path) -> path` renders one mixed WAV. Its only caller,
  `scripts/generate_cli.py`, is currently broken (see `.claude/AUDIT.md`), so
  nothing exercises it; CI's `.github/scripts/mix_smoke.py` covers `analyze`
  inside the image.

`mixer/mixer/effects/quality.py` `inspect_clip` (used by `api/app/services/quality.py`
and `scripts/check_clips.py`) and `mixer/mixer/effects/looping.py` `pad_for_looping`
(used by the pipeline's persist step) are public too. Change a signature only
together with every caller.

## What `analyze` does, in order

1. Read each clip and remove subsonics. Events are trimmed to their envelope
   and dropped below `EVENT_MIN_S`; loop layers go through `make_loopable`
   unless already marked `looped`. Every clip is peak-limited.
2. `auto_eq` computes corrective bands for all layers (tonal shaping plus
   masking cuts on ERB bands where layers are co-active), and `apply_eq`
   applies them before level analysis.
3. `assign_volumes` (perceptual weighting minus an overlap penalty) and
   `assign_spatial` (spectral reach → pan, loudness / high-frequency share /
   onsets → depth) run over the **loop layers only**. A
   mostly-silent one-shot would otherwise win the loudness anchor and push every
   bed to the 0.15 floor.
4. Events get `place_events` instead, sitting `EVENT_OFFSET_DB` under the
   loudest loop layer, or under `EVENT_FALLBACK_ANCHOR_DB` when a scene has no
   loop layer at all.

## Invariants

- **Graceful `librosa` fallback.** `auto_eq`, `volume` and `spatial` each guard
  the `librosa` import and keep a NumPy path. Every change must still work
  without `librosa` installed.
- **Mixing params come from audio, never from the LLM.**
- **Ambient character.** Output stays calm and soft; no aggressive processing.
- **DSP constants stay module-level UPPER_CASE**, including the `QUALITY_*`
  thresholds in `mixer/mixer/effects/quality.py`.
- **The existing domain-citation comments** (ERB, A-weighting, spreading
  function, the loop-seam scoring note) stay. Add no new comments.
- **Parameter conventions match the browser** (`frontend/src/hooks/useAudioEngine.ts`):
  pan −1..1, depth 0..1, RBJ cookbook filters. `eq_json` is a full band list,
  never three fixed bands. Changing one engine usually means changing both.
- **Loop padding.** `pad_for_looping` writes `LOOP_PAD_S` of each end past the
  loop points; the stored `duration_s` is the unpadded length. One-shots are
  never padded.
- **Quality checks only read.** `inspect_clip` returns `{check, value, limit}`
  issues and never changes a clip. `analyze` does not call it.

## Testing DSP changes

1. Pin current behaviour first: extend `mixer/tests/` with synthetic tones and
   noise at a couple of sample rates, so a refactor is provably
   behaviour-preserving.
2. `pytest mixer/tests` from the repo root.
3. For audible changes, render with `mix_to_file` and listen. Numbers alone do
   not prove it sounds right.
4. Calibrate quality thresholds with `python -m scripts.check_clips <folder>`
   over real clips.

`mixer/models/*.pkl` and `experiments/spatial_model/` are a negative-result
experiment, not used by the shipped heuristic.
