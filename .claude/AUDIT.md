# Project audit

The cleanup backlog. Tagged by severity (🔴 high / 🟡 medium / 🟢 low) and by
whether a fix is **safe** (behaviour-preserving) or **risky** (could change
behaviour — this is a thesis project and the audio path has no browser tests).

Nothing here blocks the app. These are quality, correctness, and hygiene items.

Last reviewed against the tree at `refactor/architecture-cleanup`.

---

## Correctness

- 🟡 **Binaural oscillators bypass the master bus.** In `useAudioEngine.ts`,
  `startBinaural` connects its gain node straight to `ctx.destination`, while
  every track routes through the analyser and the −4 dB limiter. So the beat
  tones are neither visualised nor limited, and they survive a track mute. They
  are also absent from `exportMix`, which renders tracks only. *Risky: routing
  them through the analyser changes what the visualiser shows and what the
  limiter clamps; decide deliberately whether binaural is part of the mix or an
  overlay, then make playback and export agree.*
- 🟡 **A generator failure is terminal.** `GenerationWorker` runs each
  atmosphere once; any exception marks it `failed`. Against a Colab+ngrok link
  that drops routinely, one transient error loses the whole run. *Risky:
  retries with backoff change failure semantics and re-spend GPU time; decide
  deliberately rather than drifting into it.*
- 🟢 **The two mixing engines can drift in loudness.** The Python mixer
  peak-normalizes in `mix_to_file`; the browser uses a −4 dB 20:1 limiter. A
  backend mix and a browser export of the same atmosphere will not match. Their
  *parameter* conventions are now pinned (EQ 200/1k/8k, pan −1..1, depth 0..1,
  and the shared constants at the top of `useAudioEngine.ts`), but the gain
  stage is not. *Risky: align intentionally and document which chain is
  canonical.*

## Test coverage

- 🟡 **`auto_eq` and `volume` have no direct tests.** `mixer/tests/test_core.py`
  covers `analyze`, `mix_to_file`, `apply_pan`, `assign_spatial`, and
  `make_loopable`, but the two modules that carry the most tuning — masking cuts
  and perceptual level assignment — are only exercised through `analyze`, which
  asserts shape, not behaviour. *Safe and high value: pin their output for
  synthetic inputs before touching the DSP.*
- 🟢 **No frontend tests at all.** The audio engine is verified by ear. Even a
  couple of jsdom tests over the pure helpers (`buildEQState`, `trackGain`,
  `dryGainFor`/`wetGainFor`, `audioBufferToWav` headers) would catch the
  drift class of bug the constants refactor was aimed at.

## Frontend maintainability

- 🟡 **`useAudioEngine.ts` is a ~530-line monolith** doing decode, graph
  construction, EQ, pan, reverb, tuning, binaural, the animate loop, and offline
  export in one hook. *Risky but high value: extract cohesive units (graph
  builder, binaural, animate, export) behind the same public surface, one at a
  time, with listening checks between.*
- 🟢 **`exportMix` duplicates the graph construction in `startFromDecoded`.**
  Both build filters → gain → reverb → panner in the same order; only the
  context and the parameter sources differ. The shared constants removed the
  numeric drift, but the topology is still written twice. *Safe: extract one
  builder taking a `BaseAudioContext`.*

## Repo hygiene

- 🟡 **`backend/` is an untracked leftover of the removed Laravel app.** Still on
  disk locally with a `vendor/` tree and its own `.env`. Gitignored by nothing —
  it is simply untracked, so it is one `git add -A` away from being committed,
  secrets included. *Safe: delete it locally once you have confirmed nothing in
  it is wanted.*
- 🟢 **Local `.DS_Store` files and macOS "keep both" duplicates**
  (`favicon 2.svg`, `index 2.html`) litter `frontend/public/` and `frontend/dist/`.
  Gitignored, but worth cleaning.

---

## Resolved

Kept as a record of what the earlier audits called for.

**Laravel removal / Python API rewrite**
- ✅ `ai/app/sessions/`, `routers/sessions.py`, and the legacy `/generate`
  endpoint are gone with the Laravel backend, as are its migrations and its
  stock README.
- ✅ `services/generator.py` no longer writes to disk. The global
  `output/session.json` and the per-element WAV cache are gone; audio goes to a
  per-run temporary directory for mixer analysis, then to `DATA_DIR/audio/`.
  `OUTPUT_DIR` went with them.
- ✅ Deleting an atmosphere now removes its audio directory.
- ✅ The web layer has real tests — 68 covering auth, ownership scoping,
  validation ranges, settings encryption, provider dispatch, the worker, and a
  full generation run.

**Packaging**
- ✅ The `sys.path` hacks are gone. The repo root is the `api` distribution and
  takes `mixer/` as a path dependency; `api/__init__.py` makes `api.app` a real
  package. `api/app/__init__.py`, `mixer/conftest.py`, and
  `scripts/generate_cli.py` no longer touch `sys.path`, and imports work from
  any working directory.

**Correctness**
- ✅ Play/pause resumed from sample 0. `unpause` rebuilt the whole graph on
  every resume; the resume path is now `start()` alone, which only builds when
  there are no live tracks.
- ✅ `sanitize_label` filename collisions — element filenames are prefixed with
  the position (`00_rain.wav`).
- ✅ Fragile JSON extraction in `decomposer._parse_result` — it tries
  `json.loads` on the whole response first and only then falls back to the
  regex, and it validates element shape.

**Dead code**
- ✅ `predict_pan` / `predict_and_apply` (abandoned learned-pan approach) are
  removed; `apply_pan` and `assign_spatial` are the shipped heuristic.
- ✅ `useAudioEngine`'s unused `preload` export and write-only
  `masterLimiterRef` are removed.
- ✅ `mixer/models/*.pkl` are a documented negative result; the experiment lives
  in `experiments/spatial_model/` with a README and the shipped mixer is
  heuristic.

**Hygiene**
- ✅ Root `README.md` and `LICENSE` exist; `frontend/README.md` documents this
  project instead of the Vite template.
- ✅ Duplicated frontend audio constants (`* 0.5` gain scale, reverb
  coefficients, EQ frequencies) are named at the top of `useAudioEngine.ts`.
- ✅ CI runs lint, typecheck, build, and both pytest suites on every push and
  pull request (`.github/workflows/ci.yml`).
