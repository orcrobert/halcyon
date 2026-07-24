---
name: mixer
description: Work safely on the mixer DSP core (auto-EQ, volume, spatial, looping) in mixer/. Use before changing anything under mixer/mixer/. Explains the public API, invariants, and how to test DSP changes.
---

# Working on the mixer (core IP)

The mixer is the thesis's main contribution. Treat changes here as high-stakes:
they affect the sound of every generated atmosphere and must stay defensible in
the thesis. Full map in
[`.claude/docs/architecture.md`](../../docs/architecture.md).

## Public API — do not break

`mixer/mixer/core.py`:
- `analyze(elements) -> (valid, wavs, srs)` — annotates each element dict in
  place with `eq_json`, `volume`, `pan`, `depth`. Called by the AI service.
- `mix_to_file(elements, path) -> path` — renders one mixed WAV.

Anything importing `from mixer.core import analyze` (the AI service) depends on
this surface. Keep it stable or update all callers in the same change.

## Invariants to preserve

- **Graceful `librosa` fallback.** `auto_eq`, `volume`, and `spatial` each guard
  `librosa` and provide a NumPy path. Every change must keep working when
  `librosa` is not installed.
- **Mixing params come from audio, never from the LLM.** Do not add parameters
  suggested by the decomposer — that approach was tried and removed (thesis ch4).
- **Ambient character.** Output must stay calm/soft — no aggressive processing.
- **DSP constants stay module-level UPPER_CASE.** The existing domain-citation
  comments (ERB, A-weighting, spreading function) are intentional — keep them,
  don't add new comments elsewhere.
- **Parameter conventions** (pan −1..1, depth 0..1, EQ 200/1k/8k) must match the
  browser engine (`frontend/src/hooks/useAudioEngine.ts`). Changing one usually
  means changing both.

## The pipeline (what runs, in order)

`analyze`: loopable (`looping.make_loopable`) → `auto_eq.auto_eq` (tonal shaping
+ masking cuts) → `volume.assign_volumes` (perceptual weighting − overlap
penalty) → `spatial.assign_spatial` (reach→pan, loudness/HF/onset→depth).

## Testing DSP changes

There is currently **no test suite for the mixer** — this is the top cleanup
item in [`.claude/AUDIT.md`](../../AUDIT.md). Before changing behaviour:

1. Add/extend `pytest` regression tests under `mixer/tests/` that pin the current
   output for representative inputs (synthetic tones + noise at a couple of
   sample rates), so refactors are provably behaviour-preserving.
2. Run: `cd mixer && pip install -e '.[dev]' librosa && pytest`.
3. For audible changes, render with `mix_to_file` and listen — numbers alone
   don't prove it sounds right.

## Known issues here (see AUDIT for detail)

- `predict_pan` / `predict_and_apply` are dead legacy stubs — safe to remove.
- `mixer/models/*.pkl` + `pan_model/` are a negative-result experiment, not used
  by the shipped heuristic.
