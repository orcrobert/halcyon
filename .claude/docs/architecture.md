# Architecture

Definitive reference for how the system fits together. Skim
[AGENTS.md](../../AGENTS.md) first for the summary.

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
  corrective EQ → 3-band slider EQ → gain → panner → dry/wet sends →
  analyser → limiter → destination`), and exposes imperative setters
  (`setVolume`, `setEQ`, `setPan`, `setDepth`, `setTuning`), an autonomous
  `startAnimate` drift loop, binaural oscillators, and an offline `exportMix`.
  Every wet send feeds one shared convolver per context rather than one per
  track. Decoded buffers are cached by `audio_url` (it carries the element
  version), so a reload only fetches layers that changed. A released track is
  disconnected once its fade-out ends. The SoundTouch processor never returns
  `false` from `process()`, so a released track that stays connected keeps
  rendering for the life of the page.
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
  argon2 via `pwdlib`. `deps.py` exposes the `CurrentUser` dependency, plus
  `CurrentAdmin`, `ManagedUser` and `AccountOwner` for the admin routes.
- **Admin** (`routers/admin.py`, `services/accounts.py`): `User.is_admin` marks
  an administrator: the first account to register, or the oldest account,
  promoted on boot when there is none.
  `/api/admin/users` lists, creates, edits and deletes accounts. The settings
  and generator routers have no prefix of their own and are mounted twice in
  `main.py`: at `/api/settings` and `/api/generators`, and under
  `/api/admin/users/{user_id}/`. Their handlers take `AccountOwner`, which is
  the caller on the first mount and, on the second, the account named by
  `user_id` once the caller is checked to be an admin.
- **Domain** (`models/tables.py`): `User` has many `Atmosphere`, each with many
  `Element` ordered by `position`. Status, progress, current stage and the
  requested `duration_s` (the loop length asked of the generator) live on the
  atmosphere itself, alongside `timings_json` (seconds per pipeline stage);
  `Element.status`/`error`/`version` track a single layer being regenerated.
  `Element.playback`/`clip_s`/`interval_min_s`/`interval_max_s` describe how a
  layer repeats, and `source`/`source_json` where its audio came from.
  `quality_json` holds the issues the quality check found in the clip and
  `quality_dismissed` whether the user chose to keep it. `original_*` columns on `Element` store the mixer's computed
  defaults so the UI can reset. `UserSettings` holds per-user provider config.
- **Updates** (`routers/updates.py`, `services/updates.py`): the image carries
  its release in `HALCYON_VERSION` (a build arg the release sets). `/api/admin/updates`
  compares it with GitHub's latest release (cached six hours) inside the line
  `HALCYON_TAG` allows, and starts an update by posting to the optional
  Watchtower sidecar at `UPDATER_URL` with the token Halcyon writes to
  `/updater/token` on boot. The post runs on its own thread because Watchtower
  replaces this container mid-request. `AutoUpdater` is a daemon thread that
  does the same every six hours when `InstanceSettings.auto_update` is on,
  skipping majors and waiting out generations and deploys.
- **Routers**: `auth.py`, `admin.py`, `settings.py`, `generators.py`,
  `updates.py`, `atmospheres.py`, `elements.py`. Every
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
  prompt behind per-layer regeneration and the reviser prompt behind layer
  review are shipped only, not user-editable.
- **Layer review**: with `UserSettings.review_decomposition` on, `run_generation`
  stops after a fresh decomposition, stores it in `decomposed_json` and parks
  the atmosphere at `status="awaiting_review"` (`current_stage="reviewing"`),
  freeing the worker. `AtmosphereOut.decomposition` exposes the layers only in
  that state. `PUT /{id}/decomposition` takes the edited list, runs it through
  `normalize_elements` (role → playback and event intervals) and queues the job
  again; the stored decomposition then skips the LLM. `POST
  /{id}/decomposition/revise` sends the draft and a note to the reviser prompt
  synchronously and stores the answer, still awaiting review. Discarding is a
  plain `DELETE`. A paused atmosphere is not reclaimed on restart, and a new
  take never pauses because it already carries a decomposition.
- **Quality check** (`services/quality.py`): `check_results` sits between
  `generate` and `analyze` in both `run_generation` and `regenerate_element`.
  It decodes each reply, runs `inspect_clip`, drops silent or unreadable clips
  and tags the rest with their issues. It never re-renders anything itself.
  The browser asks first, and a re-render is an ordinary element regeneration.
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
  so every clip loops seamlessly (infinite playback). `pad_for_looping` adds
  `LOOP_PAD_S` of each end past the loop points before the API stores a loop
  clip, so the browser's resampler never starves at the seam.
- **`events.py`**: one-shots. `trim_to_envelope` cuts a clip to its audible
  part; `place_events` sets each event `EVENT_OFFSET_DB` under the loudest loop
  layer (or `EVENT_FALLBACK_ANCHOR_DB` with no loop layer), centred, at
  `EVENT_DEPTH`.
- **`quality.py`**: `inspect_clip(wav, sr, role, playback, looped)` checks a
  raw generated clip. All clips get silent peak and flat-top clipping. Loops
  also get a 50 ms frame-level burst over the median (bed 15 dB, texture
  24 dB), a dropout run (beds only), a 2–5 kHz energy share, and the level and
  spectral-shape step between the end of the loop and the point where its
  crossfade settles. It returns a list of `{check, value, limit}`, empty when
  clean. It reads only and never changes the clip. Not called by `analyze`.

### `generators/` — bring-your-own generator
Runs AudioGen (sound), MusicGen (music) and, for styled requests,
MusicGen-Style from Meta's AudioCraft behind `GET /` (readiness) and
`POST /generate`. The logic is one package, `generators/core`
(`halcyon_generator`: `engine.py` batches elements by `(type, seconds)`,
`app.py` serves them, `cli.py` runs it). Four thin hosts install it from git:
`local/` (own CUDA GPU), `colab/` (notebook over ngrok), `modal/` (`deploy.py`,
per-second GPU that scales to zero, deployable from the API) and
`huggingface/` (a paid Space). The `api/` service treats any generator as a
black box behind the user's active `GeneratorProfile`, falling back to
`GENERATOR_URL` (legacy alias `COLAB_URL`). See
[`generators/README.md`](../../generators/README.md) and
[SELF_HOSTING.md](../../SELF_HOSTING.md#the-generator-contract).

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
   │                         │ (review on: status=awaiting_review, stop;  │
   │  PUT /{id}/decomposition│  confirm re-queues, LLM skipped)           │
   │                         │ ── POST /generate ────────────────────▶│
   │                         │ ◀─ wavs (b64) ─────────────────────────┤
   │                         │ quality check (drop silent)│           │
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
