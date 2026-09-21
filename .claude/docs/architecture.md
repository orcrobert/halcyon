# Architecture

Definitive reference for how the system fits together. Skim
[CLAUDE.md](../../CLAUDE.md) first for the summary.

---

## Components and responsibilities

### `frontend/` — React + Web Audio
- **Views** (`components/`): `AuthView`, `PromptView`, `GeneratingView`,
  `DashboardView`, `HistoryPanel`, plus mixing controls (`TrackStrip`, `Fader`,
  `EQPanel`, `PanKnob`, `SpatialPad`/`SpatialModal`, `TuningControl`,
  `BinauralModal`, `Visualizer`).
- **State machine**: `App.tsx` drives three views — `prompt → generating →
  dashboard` — plus history and binaural state. It owns polling and the
  atmosphere object.
- **Audio engine**: `hooks/useAudioEngine.ts` is the heart of playback. It
  decodes element WAVs, builds one Web Audio graph per track
  (`source (loops the padded interior) → SoundTouch pitch → rumble HPF →
  corrective EQ → 3-band slider EQ → gain → panner → reverb send/dry →
  analyser → limiter → destination`), and exposes imperative setters
  (`setVolume`, `setEQ`, `setPan`, `setDepth`, `setTuning`), an autonomous
  `startAnimate` drift loop, binaural oscillators, and an offline `exportMix`.
- **Persistence of edits**: `hooks/useDebouncedPatcher.ts` batches mix edits and
  `PATCH`es them to the API (250 ms debounce, flush on unload).
- **API layer** (`api/`): `client.ts` (axios + bearer token injection, 401
  handling), `token.ts` (localStorage), `errors.ts` (FastAPI error shapes),
  `atmospheres.ts` (create/get/poll/delete), `elements.ts`, `auth.ts`,
  `settings.ts`.
- **Contract**: `types/index.ts` mirrors `api/app/models/schemas.py`. Treat it as
  the single source of truth for the client-side API shape.

### `api/` — FastAPI service
- **`main.py`**: lifespan (create tables, reclaim interrupted runs, start the
  worker), routers, and the SPA mount that serves `frontend/dist` when present.
- **Schema changes** (`db.py`): `init_db` creates missing tables and adds
  nullable columns that appeared after a database was first created. Anything
  beyond an additive column still needs a hand-written migration.
- **Auth**: opaque bearer tokens, SHA-256 hashed in `auth_tokens`. Passwords are
  argon2 via `pwdlib`. `deps.py` exposes the `CurrentUser` dependency.
- **Domain** (`models/tables.py`): `User` has many `Atmosphere`, each with many
  `Element` ordered by `position`. Status, progress, current stage and the
  requested `duration_s` (the loop length asked of the generator) live on the
  atmosphere itself, alongside `timings_json` (seconds per pipeline stage);
  `Element.status`/`error`/`version` track a single layer being regenerated.
  `Element.playback`/`clip_s`/`interval_min_s`/`interval_max_s` describe how a
  layer repeats, and `source`/`source_json` where its audio came from. `original_*` columns on `Element` store the mixer's computed
  defaults so the UI can reset. `UserSettings` holds per-user provider config.
- **Routers**: `auth.py`, `settings.py`, `atmospheres.py`, `elements.py`. Every
  query is scoped to the current user; a foreign id returns 404, not 403.
- **Generation**: `AtmosphereController`-equivalent `store` creates the row and
  hands the id to `worker.GenerationWorker`, a single daemon thread consuming a
  `queue.Queue`. `services/pipeline.py` is the job body — `run_generation` for a
  whole atmosphere, `regenerate_element` for one layer, both serialized on that
  one thread.
- **Providers** (`services/providers.py`): a registry of LLM backends — `gemini`
  (native), `ollama` (native), `openai` (any OpenAI-compatible endpoint). Adding
  an entry surfaces it in the account panel with no frontend change.
- **Config resolution** (`services/runconfig.py`): merges a user's `UserSettings`
  over the instance `.env` defaults into a frozen `RunConfig`. Switching provider
  drops inherited credentials so one provider's key is never sent to another.
- **Prompts** (`services/prompts.py`): loads the shipped system prompts from
  `api/prompts/`. `RunConfig.decomposer_prompt` is a user's override of the
  decomposer prompt and falls back to the shipped file when unset. The refiner
  prompt behind per-layer regeneration is shipped only, not user-editable.
- **Storage** (`services/storage.py`): audio at
  `DATA_DIR/audio/{atmosphere_id}/{position}_{label}.wav`, with path-escape
  checks on read.
- **Secrets** (`security.py`): per-user API keys encrypted with Fernet, keyed off
  `SECRET_KEY` or an auto-generated `DATA_DIR/secret.key`.
- **Config**: `config.py` (pydantic-settings) reads the repo-root `.env` and
  migrates legacy `DECOMPOSER_MODEL` provider names.

### `mixer/` — the DSP core (standalone package)
Public API in `mixer/mixer/core.py`:
- `analyze(elements)` → makes each clip loopable, or for `playback: "oneshot"`
  trims it to its envelope and drops it if nothing survives, computes
  per-element EQ
  (`effects/auto_eq.py`), volume (`effects/volume.py`), and spatial pan/depth
  (`effects/spatial.py`); annotates the element dicts in place.
- `mix_to_file(elements, path)` → renders a single mixed WAV (resample → EQ →
  pan → volume → sum → peak-normalize).

Effects:
- **`auto_eq.py`**: ERB-band analysis with A-weighting; two stages — *tonal
  shaping* (tame sub/air/boxy/harsh per element type) and *masking cuts*
  (pairwise spreading-function masking, music weighted slightly higher) — merged
  into a compact EQ band list per element.
- **`volume.py`**: perceptual weighting (mid energy, onset density, bandwidth,
  type) → target dB per element relative to the loudest-weighted anchor, minus a
  spectral-overlap penalty, clamped to a gain range.
- **`spatial.py`**: per-element spectral features → a `reach` score drives pan
  placement (alternating sides, spectral-similarity clustering, minimum
  separation); loudness/HF/onset drive `depth`. Degrades to centre/no-depth if
  `librosa` is missing.
- **`looping.py`**: cross-correlation loop-point search + equal-power crossfade
  so every clip loops seamlessly (infinite playback).

### `colab/` — reference generator
Runs AudioGen (sound) and MusicGen (music) from Meta's AudioCraft, exposes
`POST /generate` over ngrok. It is one implementation of the generator contract;
the `api/` service treats any generator as a black box behind `GENERATOR_URL`
(legacy alias `COLAB_URL`). See [SELF_HOSTING.md](../../SELF_HOSTING.md#the-generator-contract).

### Research
Everything research-only lives under `experiments/`, one directory per
experiment; see [`experiments/README.md`](../../experiments/README.md).

- `experiments/llm_eval/` — decomposition benchmark (prompts, per-run JSON,
  scoring).
- `experiments/spatial_model/` — the learned spatial-placement experiment
  (negative result).

---

## Request lifecycle (generation)

```
Frontend                    API                          LLM      Generator
   │  POST /api/atmospheres  │                            │           │
   ├────────────────────────▶│ insert row, submit to      │           │
   │◀─ 202 (pending) ────────┤ the worker thread          │           │
   │  poll GET /{id} ───────▶│                            │           │
   │                         │ ── decompose ─────────────▶│           │
   │                         │ ◀─ typed elements ─────────┤           │
   │                         │ ── POST /generate ────────────────────▶│
   │                         │ ◀─ wavs (b64) ─────────────────────────┤
   │                         │ mixer.analyze()            │           │
   │                         │ write wavs + element rows  │           │
   │◀─ ready + elements ─────┤ status=ready               │           │
   │  GET /api/elements/{id}/audio with bearer token      │           │
   │  build graph, play                                   │           │
```

---

## Key parameter conventions (keep both engines aligned)

| Parameter | Range / value | Where |
|-----------|---------------|-------|
| EQ bands  | lowshelf 200 Hz, peaking 1 kHz (Q 1.4), highshelf 8 kHz | frontend `createFilters`, mixer `apply_eq` |
| Pan       | −1 (L) .. +1 (R), equal-power | both engines |
| Depth     | 0 .. 1 (reverb send) | frontend reverb, mixer `depth` |
| Volume    | 0 .. 2 (UI), stored gain; playback scales by 0.5 | `useAudioEngine` |
| Tuning    | 400–580 Hz, 6 Hz snap, presets 432/440/528 | `TuningControl` + SoundTouch |
| Binaural  | 200/208 Hz default, gain 0.15, 10 presets | `useAudioEngine` |
| Loop      | search 3 s or 30 % of the clip, crossfade 1.5 s or 20 % | `looping.py` |
| Clip      | bed 4 s, event 2 s, texture/music the atmosphere length | `config.py` |
| Events    | rare 30-90 s, occasional 8-25 s, frequent 3-8 s | `config.py` |
| Scheduler | 100 ms tick, 0.25 s lookahead (2 s hidden), 2 voices | `eventScheduler.ts` |
| Export    | 30 / 60 / 120 / 300 s, seeded per element | `useAudioEngine` |
| Poll      | 1.5 s interval, 20 s stuck-pending guard, 10 min timeout | `atmospheres.ts` |
| Generator | 300 s request timeout | `services/generator.py` |
| Progress  | 10 / 30 / 70 / 90 / 100 per stage | `services/pipeline.py` |

There are **two mixing implementations** (Python at generation time, browser for
live/export). They must stay conceptually aligned. Divergence between them is a
known correctness risk (see AUDIT).

---

## Trust boundaries

- Browser ↔ API: bearer token in `Authorization`, hashed at rest. Every
  atmosphere/element query is scoped to the owning user, audio included.
- API ↔ LLM: the user's own credentials, decrypted per run and never returned by
  any endpoint.
- API ↔ generator: `GENERATOR_URL` only (no auth by default — run it on a
  private network or add your own).
- Never expose the generator publicly without protection.
