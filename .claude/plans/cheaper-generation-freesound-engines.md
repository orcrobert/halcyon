# Halcyon: cheaper generation, Freesound sources, pluggable engines

Status: WP0 (timings), WP1 (layer roles) and WP2 (one-shot events) have shipped.
WP3–WP7 (Freesound sourcing, manual Freesound search, the engine registry, Stable Audio
Open / TangoFlux, the backend benchmark) are open. Written against `main` at `9ec6d57`;
re-verify the codebase findings before starting an open WP.

## Context

Halcyon turns a prompt into an infinite ambient soundscape: LLM decomposition → per-element
text-to-audio generation (AudioCraft on the user's own GPU host) → rule-based Python mixer →
Web Audio playback. Today every element is generated as a full `duration_s` clip (10 s default)
and looped forever in the browser. That wastes GPU time in two ways:

- Sparse sounds (a dog bark, an owl hoot) are generated as 10 s of "continuous barking" and
  looped, which is both expensive and unnatural. They should be generated once as a 1–2 s
  one-shot and triggered at random intervals in the browser.
- Noise-like beds (crickets, rain, wind) are statistically stationary; 3–4 s looped is
  indistinguishable from 20 s. Only evolving textures and music need the full length.

Two further goals: let users opt in to real recordings from Freesound.org (chosen by the
decomposer or searched by hand from the dashboard), and decouple the self-hosted generator from
AudioCraft so other open models (Stable Audio Open, TangoFlux, AudioLDM 2) can run on the same
hosts (Modal is the one in use).

The thesis is already presented; this is continued development. Everything below is in scope.
The plan is split into independent work packages (WP0–WP7) so that each can be handed to an
implementing agent on its own. Each WP states its preconditions, exact changes, tests, and
acceptance criteria.

---

## How to use this file (read first if you are implementing a WP)

1. Read `CLAUDE.md` in the repo root. Non-negotiables: **no comments in code anywhere**, branch
   from `main` (`<type>/<kebab>`), logical commits `<type>: <Imperative summary>`, PR to `main`,
   **no AI/Claude/co-author mentions in commits or PRs**, never commit `.env`, match surrounding
   code style, theme tokens only in `frontend/src` (no hex, no rgb, no Tailwind palette classes).
2. Pick exactly one WP. Check its "Depends on" line. Do not start a WP whose dependency is not
   merged.
3. `api/app/models/schemas.py` and `frontend/src/types/index.ts` must change together.
   New DB columns must be nullable (`api/app/db.py` `_add_missing_columns` only adds nullable
   columns; nothing else migrates automatically).
4. Before touching `mixer/mixer/`, read `.claude/skills/mixer/SKILL.md`. Pin existing outputs
   with a test first, keep the librosa-absent fallback, keep the existing domain-citation
   comments, add no new comments.
5. Verification commands for the whole repo:
   ```
   pytest                       # api/tests + mixer/tests (from repo root, venv active)
   cd generators/core && pytest # generator server, no GPU needed
   cd frontend && npm run lint && npm run build
   ```
6. Documentation to update when a WP changes a contract: `SELF_HOSTING.md` (generator
   contract section, lines ~95–153), `.claude/docs/architecture.md`, and the parameter table
   there. Keep prose terse, no filler.

### Dependency graph

```
WP0 timing instrumentation ─┐
WP1 layer roles + short beds ─┼─► WP2 one-shot events ─► WP4 Freesound manual add (needs addTrack from WP2)
                             └─► WP3 Freesound pipeline sourcing ─► WP4
WP5 engine registry ─► WP6 Stable Audio + TangoFlux engines ─► WP7 backend benchmark
```
WP5–WP7 touch only `generators/` plus one whitelist in `api/app/services/generator.py`; they can
be done in parallel with WP1–WP4. WP0 is tiny and can be done first or folded into WP1.

Effort (focused engineer-days): WP0 0.5 · WP1 3–4 · WP2 4–5 · WP3 3 · WP4 3–4 · WP5 2 ·
WP6 3–4 · WP7 1–2. Total ≈ 20–25 days. Listening/tuning time is extra.

---

## External research findings

### Freesound API (verified against freesound.org/docs/api, Sept 2026)

- Credentials: apply at `freesound.org/apiv2/apply`. Plain `token` auth covers search, sound
  metadata, analysis descriptors, and **preview downloads**. OAuth2 is needed only for
  original-file download, upload, comment, rate, bookmark. We never need originals.
- Previews per sound: `preview-hq-mp3` (~128 kbps), `preview-lq-mp3`, `preview-hq-ogg`,
  `preview-lq-ogg`. Use `preview-hq-ogg`, fall back to `preview-hq-mp3`.
- Rate limits: 60 requests/min, 2000/day per key.
- Search: `GET /apiv2/search/text/?query=&filter=&sort=&fields=&page_size=` (`page_size` ≤ 150).
  Filter is Solr syntax, e.g. `duration:[1 TO 6]`, `license:("Creative Commons 0" OR "Attribution")`,
  `tag:field-recording`, `ac_loopable:true`, `ac_single_event:true`, `ac_loudness:[-30 TO -10]`.
- Similarity: `similar_to=<sound_id or vector>`, `similarity_space=laion_clap` (512-d). Not needed
  in v1.
- Audio Commons descriptors usable as filters: `ac_loopable` (bool), `ac_single_event` (bool),
  `ac_loudness` (LUFS), `ac_dynamic_range`, `ac_brightness/depth/hardness/roughness/boominess/
  warmth/sharpness` (0–100), `ac_temporal_centroid`, `ac_log_attack_time`. `ac_loopable` and
  `ac_single_event` map directly onto the loop-vs-event split.
- Useful sound fields: `id,name,tags,description,license,username,url,duration,samplerate,
  channels,filesize,type,avg_rating,num_ratings,previews`.
- Licences on sounds: CC0, CC-BY (3.0/4.0), CC-BY-NC, Sampling+. **Decision: CC0 + CC-BY
  only.** CC-BY requires crediting the uploader; the dashboard shows a credits list.
- API terms (`freesound.org/help/tos_api`): non-commercial only without a negotiated licence;
  "limited intermediate copies of Content only as necessary", delete when no longer needed; no
  redistribution outside the application; do not circumvent rate limits with several keys.
  Consequence: a fetched preview is stored only under the atmosphere that uses it (deleted with
  the atmosphere), never as a shared library.
- Client: `MTG/freesound-python` exists but is thin; a small client on `requests` (the HTTP
  library the API already uses everywhere) is preferable to a dependency.

### Text-to-audio models beyond AudioCraft (Sept 2026)

| Model | Params | Output | Max len | Speed (reported) | Licence | Runner |
|---|---|---|---|---|---|---|
| AudioGen medium (current) | 1.5B | 16 kHz mono | ~10 s practical | autoregressive, 50 tokens per s of audio; ≥16 GB VRAM | CC-BY-NC | audiocraft |
| Stable Audio Open 1.0 | 1.2B DiT + Oobleck AE + T5 | 44.1 kHz stereo | 47 s | 100–200 steps; fp16 fits ~8–12 GB | Stability Community (non-commercial free; gated HF download) | `diffusers.StableAudioPipeline`; `audio_end_in_s`, `negative_prompt`, `num_waveforms_per_prompt` with CLAP ranking |
| Stable Audio Open Small | 341M | 44.1 kHz stereo | 11 s | ~8 s for 11 s on ARM CPU; sub-second on GPU | Stability Community | stable-audio-tools |
| TangoFlux | ~515M | 44.1 kHz stereo | 30 s | 30 s of audio in ~3.7 s on A40 at 50 steps | Non-commercial research (Stability + WavCaps terms) | `pip install git+https://github.com/declare-lab/TangoFlux`; `TangoFluxInference(name=...).generate(prompt, steps=, duration=)` |
| AudioLDM 2 / large | 1.1B / 1.5B | 16 kHz mono | ~10 s | 200 steps default, slow | CC-BY-NC | `diffusers.AudioLDM2Pipeline`, `audio_length_in_s` |
| ElevenLabs SFX (hosted, paid) | n/a | 44.1 kHz | 0.5–30 s | seconds | ~40 credits/s | REST, has native `loop=true` |

Takeaways:
- All open models share the same shape: `(prompt, duration_s, steps, seed, negative_prompt) →
  waveform + sample rate`. That is the whole engine interface.
- Stable Audio Open was trained on Freesound + FMA specifically for sound effects and field
  recordings, exactly our content class. It is the strongest first alternative.
- TangoFlux is by far the fastest per second of audio and is duration-conditioned.
- AudioGen cost is linear in seconds (autoregressive). Diffusion/flow cost is dominated by steps
  and is flatter in clip length below ~10 s. Short clips save the most on the model we use now.
- AudioCraft pins torch 2.1.2 / transformers 4.40.2 / numpy<2. `diffusers` 0.40 wants torch ≥2.3.
  The two families cannot share one environment: separate extras and separate Modal images.
- Loopable generation via circular latent padding (LoopGen, arXiv 2504.04466; Stable Audio 3
  report) is training-free and could be added to a diffusers engine later. Not needed in v1; the
  mixer's loop-point search plus crossfade handles noise-like beds.

### Compute hosts

Modal stays the host (user decision). Existing `generators/{local,colab,huggingface,modal}` are
thin wrappers over `generators/core`; an engine added in core is inherited by all hosts. For the
record: Colab free is throttled by compute units, Kaggle ~30 GPU-h/week, HF ZeroGPU free ~5
min/day, Lightning ~80 GPU-h/month, Modal has a monthly free credit.

### Prior art for sparse event scheduling

Ambient tools (Ambient Mixer, myNoise) and game middleware (Wwise/FMOD random containers) all use
the same pattern: a pool of short one-shots, a random interval drawn from a range, small per-trigger
gain/pitch/pan jitter, and a cap on simultaneous voices. Copy this, do not invent.

---

## Codebase findings (verified, Sept 2026)

### The "everything loops forever" assumption lives in five places

1. **Decomposer prompt** `api/prompts/decomposer.txt` lines 90–91 forbid sparse biological sounds
   and transient sounds ("only loopable continuous textures"); RULE 6 (line 126) bans sharp
   transients. The parser `api/app/services/decomposer.py` (`_parse_result`, lines ~22–48)
   enforces exactly `{label, type: sound|music, prompt}`. No duration, no loop/event flag, no
   source. The prompt is per-user overridable (`UserSettings.decomposer_prompt`), so old custom
   prompts must keep working.
2. **Element schema** `api/app/models/tables.py` `Element` (lines ~129–162): `type` is model
   routing (sound → AudioGen, music → MusicGen) and nothing else. `duration_s` is per atmosphere
   (`Atmosphere.duration_s`), not per element.
3. **Mixer** `mixer/mixer/effects/looping.py`: absolute 3 s search window and 1.5 s crossfade.
   Clips under 4.5 s hit a degenerate branch (lines 64–69) that windows the whole clip to silence
   at both ends. A 5 s clip loses 30–70 % to the loop trim, 10 s loses 15–45 %. `core.py` line 47
   skips looping only when `element["looped"]` is set (only used for regeneration,
   `pipeline.py` `_stored_payload`). `volume.py` and `spatial.py` use whole-clip RMS and
   onset-density-per-clip-second, so a mostly-silent one-shot would rank as quiet and never be
   boosted (gain capped at 1.0), and a hot transient could become the loudness anchor and push
   every bed down by up to 18 dB.
4. **Persistence** `pipeline.py` `_persist` (lines ~46–97): one WAV per element, trimmed to its
   loop point, zipped **positionally** with generator output. The reference generator reorders
   (sounds first, then music, `engine.py` lines 56–64) and elements missing `audio_b64` are
   dropped silently, so the zip is already fragile.
5. **Browser** `frontend/src/hooks/useAudioEngine.ts` hardcodes `loop = true` (line ~273 live,
   ~586 export). No scheduling of any kind. Tracks keyed by `element.label`. `startFromDecoded`
   (~236–279) tears down all tracks on every load; `forget()` exists, no add-one path.
   `decodeElements` is all-or-nothing. Export length = longest buffer, graph built twice.

### Generation cost today

- Only measured datum: warm A10G on Modal, one 5 s element ≈ 18 s; cold boot + model load ≈ 150 s
  (`generators/modal/README.md` ~91–95).
- AudioGen is autoregressive at 50 tokens per second of audio: cost is linear in seconds. A
  6-layer scene at 10 s each is 60 s of audio. With two events at 2 s and two beds at 4 s it is
  32 s of audio, roughly halving GPU time, and the loop trim no longer discards 15–45 % per clip.
- No timing instrumentation exists anywhere (`pipeline.py` logs exceptions only; the frontend
  elapsed counter is never stored). WP0 adds it so the win can be measured.

### Generator server

- `generators/core/halcyon_generator/engine.py`: `AudioCraftEngine` is a concrete class, no
  Protocol. `app.py` `create_app(config, engine, eager)` already accepts an injected engine (Modal
  uses it). `POST /generate` takes `elements: list[dict[str, Any]]` untyped and the engine
  returns `{**elem, "audio_b64": ...}`, so unknown element keys round-trip with zero changes.
- `GET /` reports `audiogen_model, musicgen_model, duration, max_duration, loaded`; the API's
  `probe()` (`api/app/services/generator.py` ~31–42) whitelists exactly those keys.
- Sample rate is never normalised: AudioGen 16 kHz mono, MusicGen 32 kHz. The browser copes.
- `generators/core/pyproject.toml` `[audiocraft]` extra pins torch 2.1.2; AudioCraft itself is
  installed from git `main` with `--no-deps`. `generators/README.md` says all runtime deps live
  in that one file.
- Tests `generators/core/tests/test_app.py` use a duck-typed `StubEngine` and need no GPU.

### Patterns to copy

- `api/app/services/providers.py`: frozen `Provider` dataclass + `PROVIDERS` registry +
  `get_provider`; surfaces automatically in the account panel via `routers/settings.py`.
- `api/app/services/hosts.py` + `GeneratorProfile`: per-user, switchable, probe-able endpoints.
- `RunConfig` (`api/app/services/runconfig.py`): flat frozen dataclass, hand-merged fields;
  adding a credential = nullable `UserSettings` column + `RunConfig` field + merge rule +
  `SettingsOut`/`SettingsUpdate` + `frontend/src/types/index.ts`. `api/app/security.py`
  `encrypt_secret`/`decrypt_secret` (Fernet). Keys are exposed only as `*_set: bool`.
- `api/app/worker.py` `GenerationWorker`: one daemon thread, `submit(atmosphere_id)` and
  `submit_element(element_id)`; `reclaim_interrupted` fails anything left in flight on boot.
- Frontend: `HistoryPanel.tsx` (slide-over with search input and loading/empty/error states),
  `GeneratorsCard.tsx` (credentials/host card), `SpatialModal.tsx` (per-layer modal),
  `DashboardView.tsx` mixer grid (~315–344, 100 px auto-fit columns), header actions (~154–211),
  `PromptView.tsx` duration picker (`DURATION_CHOICES` 10/20/30/60, copy "Every layer loops
  forever"), `useDebouncedPatcher.ts` (250 ms PATCH coalescing), `App.tsx`
  `handleRegenerateElement`/`handleDeleteElement` (~230–265), `watchRegeneration` (~200–228),
  `loadAtmosphereIntoEngine` (~110–118). No frontend tests exist; `eslint` + `tsc -b` in CI.
- `experiments/README.md`: one directory per experiment with `run.py`, `score.py`, `results.md`.

### Practical checks done

- `soundfile 0.14.0` on `libsndfile 1.2.2` in the venv lists MP3 and OGG in
  `sf.available_formats()`; Freesound previews decode with the library already in the API image
  (Debian bookworm `libsndfile1` 1.2.0 also supports both). No ffmpeg needed.
- `thesis/` is not on disk. `experiments/` has two directories, nothing on generation cost.
- No `POST` endpoint creates an element or uploads audio; every element is born in `pipeline.py`.

---

## Architecture decisions (one answer each, apply across all WPs)

| # | Topic | Decision | Why |
|---|---|---|---|
| 1 | Element model | Additive nullable columns `playback`, `clip_s`, `interval_min_s`, `interval_max_s`, `source`, `source_json`. `type` stays sound/music (model routing). | Only nullable columns auto-migrate. `playback` is orthogonal behaviour, `source` is provenance. |
| 2 | LLM output | LLM emits a categorical `role: bed \| texture \| event` plus optional `frequency: rare \| occasional \| frequent` and optional `search`. Code derives `playback`, `clip_s`, intervals from constants. Missing `role` → `texture` → today's behaviour. | Small LLMs handle one word better than numbers (Llama broke the schema in `experiments/llm_eval`). Tuning constants stay in code, not in a user-editable prompt. |
| 3 | Generator contract | Add per-element `duration` and `index`. API matches replies by `index`, then `label`, then position. | Reference engine echoes unknown keys. Generators that ignore per-element `duration` still work. Fixes the positional zip. |
| 4 | Mixer | Crossfade and search window proportional to clip length, capped at today's values. One-shots skip looping, are envelope-trimmed, and get a fixed placement policy instead of competing in `assign_volumes`/`assign_spatial`. | A hot transient would otherwise become the loudness anchor. A static pan is meaningless for an event the browser jitters per trigger. |
| 5 | Browser | Lookahead scheduler on `ctx.currentTime` (100 ms tick, 250 ms lookahead), uniform interval in `[min, max]` with a floor of the clip length, polyphony 2, seeded PRNG for export, explicit export length. Tracks stay keyed by label. | `ctx.suspend()` freezes `currentTime`, so the scheduler is pause-safe with no extra state. Label uniqueness is already enforced server-side. |
| 6 | Freesound | `requests` client; `preview-hq-ogg` decoded by `soundfile`; CC0 + CC-BY only; a `sourcing` pipeline stage; manual add goes through the worker so the mixer runs. | Matches existing HTTP style. No new binary deps. Attribution solved by a credits list. |
| 7 | Engines | `Engine` Protocol + `BaseEngine` (batching, duration, loudness, resample, encode); engines implement one `synthesize()`. Registry keyed by `GENERATION_ENGINE`. Output normalised to 44.1 kHz. One Modal image per engine. | AudioCraft and diffusers torch pins conflict; separate extras/images is the only sane dependency story. |
| 8 | Scheduling location | Events are scheduled in the browser, not baked into a long WAV server-side. | Playback is infinite; a baked timeline would repeat. Export uses a seeded plan so files are reproducible. |

---

## WP0 — Timing instrumentation (0.5 day)

Depends on: nothing. Branch: `feat/generation-timings`.

Goal: record how long each stage takes so WP1/WP2 savings and WP7 benchmarks are measurable.

Changes:
- `api/app/models/tables.py` `Atmosphere`: add `timings_json: dict | None` (JSON column, nullable).
- `api/app/services/pipeline.py`: wrap each stage in `run_generation` with `time.perf_counter()`
  and write `{"decompose_s", "generate_s", "mix_s", "persist_s", "total_s", "audio_s":
  <sum of generated seconds>}` to `atmosphere.timings_json` before the final commit. Same for
  `regenerate_element` under a `"regenerate"` key on the atmosphere.
- `api/app/models/schemas.py` `AtmosphereOut`: add `timings: dict | None`. Mirror in
  `frontend/src/types/index.ts` `Atmosphere`.
- Optional UI: show `total_s` in `GeneratingView.tsx` final state or in the `HistoryPanel` row
  hover. Keep it minimal.

Tests: `api/tests/test_generation.py` asserts `timings_json` has the five keys after a run with
the fake generator from `conftest.py`.

Acceptance: `GET /api/atmospheres/{id}` returns `timings` after generation.

---

## WP1 — Layer roles, per-element duration, short loopable beds (3–4 days)

Depends on: nothing (WP0 recommended first). Branch: `feat/layer-roles-short-beds`.

Goal: the decomposer tags each element `bed` or `texture`; beds are generated at `BED_CLIP_S`
(4 s) and looped, textures/music keep `Atmosphere.duration_s`. Lay down the full schema so later
WPs never touch the DB again. Events are **not** emitted yet (WP2), so nothing plays a looped
2 s bark.

### 1. Data model (`api/app/models/tables.py`, all nullable)

```
Element.playback: str | None          "loop" | "oneshot"; None means loop
Element.clip_s: int | None            requested generation length; duration_s stays the measured length
Element.interval_min_s: float | None  one-shot cadence (WP2)
Element.interval_max_s: float | None
Element.source: str | None            "generated" | "freesound"; None means generated
Element.source_json: dict | None      provenance/licence/attribution (WP3)
```
Constants in `api/app/config.py`:
```
BED_CLIP_S = 4
EVENT_CLIP_S = 2
ROLE_INTERVALS = {"rare": (30.0, 90.0), "occasional": (8.0, 25.0), "frequent": (3.0, 8.0)}
```

### 2. Schemas (`api/app/models/schemas.py` + `frontend/src/types/index.ts`)

- `ElementOut` += `playback: Literal["loop", "oneshot"]` (default `"loop"` when column is
  null), `clip_s: int | None`, `interval_min_s`, `interval_max_s`, `source: str` (default
  `"generated"`), `source_json: dict | None`. Make `audio_url: str | None` (null when
  `audio_path` is empty; needed by WP4).
- `ElementMixUpdate` += `interval_min_s: float | None = Field(ge=1, le=300)`,
  `interval_max_s` same, model validator `max >= min` when both given.
- `frontend/src/types/index.ts`: mirror all of the above; add `'sourcing'` to `ElementStatus`
  (used by WP4; harmless now).
- `api/app/routers/elements.py` `serialize_element`: emit the new fields.
- `api/app/routers/atmospheres.py` `regenerate` ("Take another"): copy `playback`, `clip_s`,
  `interval_*`, `source`, `source_json` onto the new take's element specs.

### 3. Decomposer

`api/prompts/decomposer.txt`:
- Replace lines 90–91 (forbidden sparse/transient rules) with a **RULE 7 — LAYER ROLE**. Draft:
  > Every element carries a `"role"`. `"bed"` is stationary, noise-like material with no internal
  > structure: rain, wind, surf, cricket chorus, room tone, distant traffic, a running fridge. A
  > few seconds of a bed, looped, is indistinguishable from minutes of it. `"texture"` is anything
  > that evolves: all music, drones, pads, crowd murmur, shifting weather, anything with phrases.
  > Music is always `"texture"`. Never write "looping", "repeating", "continuous" or "occasional"
  > into a prompt; repetition is handled after generation.
- Output schema block (lines ~130–142) gains `"role": "bed|texture"`.
- Keep RULE 6 (calm, no harsh transients).

`api/app/services/decomposer.py` `_parse_result`:
- `_ROLE_PLAYBACK = {"bed": "loop", "texture": "loop", "event": "oneshot"}`.
- Unknown or missing `role` → `"texture"`. `type == "music"` forces `role = "texture"`.
- Keep `role` on the element dict; set `element["playback"]`.
- (WP2 extends this with `frequency`.)

`api/prompts/refiner.txt`: `layer` input includes `role`; add one sentence "keep `role` unless
the complaint is about how often or how long the sound happens". `refine_element` in
`pipeline.py` passes `role` through.

### 4. Generator contract (`api/app/services/generator.py`, `SELF_HOSTING.md`)

Request becomes:
```json
{"duration": 30,
 "elements": [
   {"index": 0, "label": "Rain", "type": "sound", "prompt": "...", "duration": 4},
   {"index": 1, "label": "Drone", "type": "music", "prompt": "...", "duration": 30}]}
```
- New `clip_length(element, duration_s) -> int`: `event → EVENT_CLIP_S`, `bed → BED_CLIP_S`,
  else `duration_s`. Store as `element["clip_s"]`.
- `generate()` sends only `index, label, type, prompt, duration` per element, then reassembles
  in request order: match by `index`, fall back to `label`, then position. Merge `audio` into the
  request-side dict so `role`, `playback`, `clip_s` (and later `search`, `source_json`) survive.
  Elements without `audio_b64` are logged with their label and dropped, order preserved.
- `regenerate_element`: the `spec` includes `role`, `playback`, `clip_s`; `_stored_payload`
  adds `playback` so the mixer can apply the event policy to stored layers (WP2).
- `SELF_HOSTING.md` contract section: document `index` and per-element `duration`, and that a
  generator ignoring per-element `duration` still works.

Reference engine `generators/core/halcyon_generator/engine.py`: group elements by
`(type, resolved seconds)` and run one `_generate_batch` per group; `resolve_duration` applied per
element with the batch `duration` as fallback. Test in `generators/core/tests/test_app.py`: the
stub records per-element durations and the response order equals request order or carries
`index`.

### 5. Mixer

`mixer/mixer/effects/looping.py`:
- Module constants `LOOP_CROSSFADE_S = 1.5`, `LOOP_SEARCH_WINDOW_S = 3.0`,
  `LOOP_CROSSFADE_FRACTION = 0.2`, `LOOP_SEARCH_FRACTION = 0.3`.
- `find_loop_point` and `make_loopable` compute
  `crossfade = min(LOOP_CROSSFADE_S, total_s * LOOP_CROSSFADE_FRACTION)` and
  `search = min(LOOP_SEARCH_WINDOW_S, total_s * LOOP_SEARCH_FRACTION)`. At 10 s the caps win, so
  output is bit-identical to today and the three existing invariant tests in
  `mixer/tests/test_core.py` (~186–205: never exceeds full scale, no swell at head, seam
  continuous) pass unchanged. A 4 s bed yields a ~2.0–3.2 s loop instead of the degenerate
  branch. Keep the degenerate branch as a guard for absurdly short input.

`mixer/mixer/core.py` `analyze`: unchanged in WP1 except that it reads `element.get("playback")`
and only calls `make_loopable` when it is not `"oneshot"` (full one-shot handling in WP2).

New tests: `test_make_loopable_short_bed_keeps_at_least_half` (4 s input → ≥ 2 s output, seam
continuous), `test_find_loop_point_scales_window_with_length`.

### 6. Pipeline persist

`pipeline.py` `_persist` and `regenerate_element`: copy `playback`, `clip_s`, `interval_*`,
`source`, `source_json` from the element dict onto the row. `decomposed_json` keeps `role`.

### 7. Frontend (small)

- `PromptView.tsx` line ~108 copy → "Beds loop from a few seconds of audio; this sets the length
  of the evolving layers." Title "Soundscape length" stays.
- `TrackStrip.tsx` hover tooltip: show `clip_s` next to the prompt (optional).

### Verification

- `pytest`, `cd generators/core && pytest`, `npm run lint && npm run build`.
- Run the stack against Modal (`.claude/skills/run-stack`): generate "rainy library at dusk";
  `GET /api/atmospheres/{id}` shows beds with `clip_s: 4` and `timings.generate_s` lower than a
  pre-WP1 run of the same prompt. Listen for audible periodicity in the rain bed; tune
  `BED_CLIP_S` between 4 and 6 by ear.

Risks: the LLM tags a pulsing sound (cricket chorus with a rhythm) as `bed` → audible period.
Mitigation is the prompt wording and `BED_CLIP_S`. AudioGen at 4 s is fine.

Acceptance: beds generate at 4 s and loop cleanly; textures unchanged; old custom decomposer
prompts without `role` still produce a working atmosphere.

---

## WP2 — One-shot events (4–5 days)

Depends on: WP1. Branch: `feat/oneshot-events`.

Goal: sparse sounds are generated once as ~2 s clips and triggered at random intervals in the
browser, with a density control and deterministic export of explicit length.

### 1. Decomposer

`api/prompts/decomposer.txt` RULE 7 gains `"event"`:
> `"event"` is one short sound that happens now and then: a single owl hoot, a distant dog bark,
> one bell strike, one creak, a drip. Describe ONE occurrence ("single owl hoot, distant, soft"),
> never "occasional hoots". At most 2 events per scene, only when the scene calls for them.
> Events carry `"frequency": "rare" | "occasional" | "frequent"`.

RULE 6 keeps hard impacts out (no thunderclaps, slams). Output schema block gains `frequency`.
Parser: `event → playback "oneshot"`, `frequency` → `interval_min_s/max_s` via `ROLE_INTERVALS`
(default `occasional`); music can never be `event`.

### 2. Mixer

New `mixer/mixer/effects/events.py` (pure NumPy, no librosa):
```
EVENT_SILENCE_DB = -45.0     threshold relative to peak for trimming
EVENT_FADE_IN_S = 0.01
EVENT_FADE_OUT_S = 0.05
EVENT_MAX_S = 4.0
EVENT_MIN_S = 0.15           shorter after trim → treat as failed generation
EVENT_OFFSET_DB = -6.0       event RMS sits this far under the loudest loop layer
EVENT_DEPTH = 0.35

trim_to_envelope(wav, sr) -> np.ndarray
place_events(event_wavs, anchor_rms_db) -> list[tuple[float, float, float]]   # (volume, pan=0.0, depth)
```
`core.py` `analyze`:
- `playback == "oneshot"` → `trim_to_envelope`; if shorter than `EVENT_MIN_S`, drop the element
  with a log line (the pipeline then marks nothing; the user can regenerate).
- `auto_eq` runs over all elements (masking cuts are cheap).
- `assign_volumes` and `assign_spatial` run over the loop subset only; one-shots get
  `place_events` with the anchor = loudest loop layer's post-EQ RMS. Volume clipped to the
  existing `[0.15, 1.0]`.
- `mix_to_file`: scatter one-shots with `np.random.default_rng(0)` at `interval_min_s` cadence
  instead of tiling (`_loop_to_length` would machine-gun a bark).

Tests: `test_analyze_trims_oneshots_and_never_crossfades_them`,
`test_events_do_not_move_the_volume_anchor` (bed volumes identical with and without a hot event),
`test_place_events_stays_in_range`, existing `test_analyze_annotates_every_element` still holds.

### 3. Browser engine

New pure module `frontend/src/hooks/eventScheduler.ts` (no React, unit-testable):
```ts
export const SCHEDULER_TICK_MS = 100
export const LOOKAHEAD_S = 0.25
export const LOOKAHEAD_HIDDEN_S = 2
export const EVENT_MAX_VOICES = 2
export const EVENT_GAIN_JITTER_DB = 2
export const EVENT_RATE_JITTER = 0.04
export const EVENT_PAN_JITTER = 0.3
export const EXPORT_SEED = 0x5eed

export function mulberry32(seed: number): () => number
export function nextInterval(rng: () => number, minS: number, maxS: number, floorS: number): number
export type Trigger = { at: number; gainDb: number; rate: number; panOffset: number }
export function planTriggers(rng, seconds, minS, maxS, floorS): Trigger[]
```
`useAudioEngine.ts`:
- Extract `buildTrackChain(ctx, el, buffer, params)` (filters → gain → panner → dry/wet →
  bus) used by `startFromDecoded`, `addTrack` (WP4) and `exportMix`. This removes the duplicated
  graph the AUDIT already flags.
- `TrackNode` gains `mode: 'loop' | 'oneshot'`, `buffer`, and for one-shots
  `lane: { nextAt: number; voices: Set<AudioBufferSourceNode>; rng: () => number }`; `source`
  becomes optional.
- One-shot lanes bypass the SoundTouch pitch worklet (events are non-tonal, global tuning is for
  tonal layers). Per trigger: new `AudioBufferSourceNode`, `playbackRate = 1 ± EVENT_RATE_JITTER`,
  → per-trigger `GainNode` (±2 dB) → the lane's first filter; lane `panner.pan.setValueAtTime(
  clamp(basePan + jitter, -1, 1), when)`; skip when `voices.size >= EVENT_MAX_VOICES`; delete
  from `voices` on `ended`.
- Scheduler: one `setInterval(SCHEDULER_TICK_MS)` per engine. Each tick, for each lane:
  `while (lane.nextAt < ctx.currentTime + lookahead) { trigger(lane, lane.nextAt); lane.nextAt
  += nextInterval(...) }`. First trigger at `currentTime + uniform(0.5, min)`. If `lane.nextAt <
  ctx.currentTime` (throttled hidden tab), reset to `currentTime + 0.1` and drop the backlog.
  `visibilitychange` swaps `LOOKAHEAD_S` ↔ `LOOKAHEAD_HIDDEN_S`.
- Pause/resume: nothing extra; `ctx.suspend()` freezes `currentTime`. `stop()`/`forget()` clear
  the interval and stop live voices.
- `setEventInterval(label, minS, maxS)` updates the lane; state ref `intervalStateRef`.
- Export: `exportMix(filename, seconds)` → `OfflineAudioContext(2, seconds * 44100, 44100)`.
  Loops start at 0 with `loop = true`. One-shots use
  `planTriggers(mulberry32(EXPORT_SEED ^ el.id), seconds, ...)` and `src.start(at)`. Seed
  `buildImpulseResponse` with the same PRNG in the offline context so exports are byte-stable.
- Public surface adds `setEventInterval`; `exportMix` signature changes.

### 4. UI

- `TrackStrip.tsx`: badge `event` for `playback === 'oneshot'` (add `--color-tag-event` to
  `theme.css` and a `tag` entry in each `themes.ts` spec, or reuse `--color-tag-sound`). Bottom row
  gains a third small button opening `DensityModal.tsx` (pattern `SpatialModal.tsx`): one slider
  `density 0..1` → `interval_min_s = lerp(45, 3, d)`, `interval_max_s = 2.5 * interval_min_s`;
  `onIntervalChange(label, min, max)`. Fader stays volume; SpatialModal stays base pan/depth.
- `DashboardView.tsx` Export button → small popover with 30 s / 1 min / 2 min / 5 min (default
  60 s), calls `onExport(seconds)`.
- `App.tsx`: `handleIntervalChange` enqueues `{interval_min_s, interval_max_s}` through
  `useDebouncedPatcher`; `loadAtmosphereIntoEngine` applies intervals.

### 5. Tests

- Add `vitest` as a devDependency (`npm i -D vitest`), script `"test": "vitest run"`, CI step in
  `.github/workflows/ci.yml` frontend job. Tests for `eventScheduler.ts`: intervals stay in
  `[max(min, floor), max]`; `planTriggers` is deterministic per seed and never exceeds `seconds`;
  `mulberry32` reproduces a known sequence.
- Manual: forest scene with an owl event; no bunching after hiding and returning to the tab;
  pause/resume keeps cadence; two exports of the same length are byte-identical; density slider
  changes cadence within one interval.

Risks: AudioGen at 2 s sometimes returns a truncated onset or silence → handled by `EVENT_MIN_S`
drop + regenerate. Shared lane panner means a second overlapping voice inherits the new pan
(accepted at polyphony 2).

Acceptance: a scene with an event layer plays it sparsely, the badge reads `event`, density is
adjustable and persisted, export length is user-chosen and reproducible.

---

## WP3 — Freesound pipeline sourcing + settings (3 days)

Depends on: WP1. Branch: `feat/freesound-sourcing`.

Goal: per-user opt-in. The decomposer marks elements better served by a recording; the pipeline
searches Freesound, fetches the preview, and runs it through the mixer like any other layer.
Credits are displayed.

### 1. Config and credentials

- `api/app/config.py` `Settings`: `freesound_api_key: str | None = None` (instance fallback),
  `.env.example` entry `FREESOUND_API_KEY=`.
- `api/app/models/tables.py` `UserSettings`: `freesound_api_key_enc: str | None`,
  `freesound_pipeline: bool | None`.
- `api/app/services/runconfig.py` `RunConfig`: `freesound_api_key: str | None`,
  `freesound_pipeline: bool`. Resolve like the decomposer key (`decrypt_secret`, fall back to
  instance key). `freesound_pipeline` is true only if a key resolves.
- `schemas.py`: `SettingsUpdate` += `freesound_api_key: str | None`, `freesound_pipeline: bool
  | None`; `SettingsOut` += `freesound_api_key_set: bool`, `freesound_pipeline: bool`.
  `routers/settings.py` encrypts like `decomposer_api_key`, never returns the key. Mirror in
  `frontend/src/types/index.ts` `Settings`/`SettingsUpdate`.
- Frontend `frontend/src/components/FreesoundCard.tsx` in `AccountView.tsx` (reuse the local
  `Card`, `Field`, `INPUT_CLASS` recipe and the key show/hide/remove behaviour from the Decomposer
  card): key field, toggle "Let the decomposer use real recordings", one-line note "CC0 and
  CC-BY recordings only; credits appear on the dashboard", link to `freesound.org/apiv2/apply`.

### 2. Client `api/app/services/freesound.py` (`requests`)

```
FREESOUND_API = "https://freesound.org/apiv2"
FREESOUND_TIMEOUT_S = 20
LICENSE_FILTER = 'license:("Creative Commons 0" OR "Attribution")'
FIELDS = "id,name,username,license,url,duration,previews,avg_rating,num_ratings"

search(api_key, query, kind: Literal["loop","event"], page_size=15) -> list[dict]
pick(hits, kind, target_s) -> dict | None
fetch_preview(api_key, hit) -> bytes           previews["preview-hq-ogg"], mp3 fallback
decode_preview(data: bytes) -> tuple[np.ndarray, int]   soundfile on BytesIO → (channels, samples) float32, sr
provenance(hit) -> dict   {"provider": "freesound", "id", "name", "username", "license", "url", "preview": "hq-ogg"}
```
Filters: `kind == "loop"` → `duration:[2 TO 12] ac_loopable:true`; `kind == "event"` →
`duration:[0.3 TO 4] ac_single_event:true`; both AND `LICENSE_FILTER`; `sort=score`.
Ranking in `pick`: top hits re-scored by `avg_rating * min(num_ratings, 10) / 10`, CC0 breaks ties,
then duration nearest `target_s`. If `ac_loopable`/`ac_single_event` filters return nothing,
retry once without the `ac_*` clause. Map HTTP 401 → a user-facing "Freesound key rejected",
429 → "Freesound rate limit", both raising `ValueError` the pipeline logs and falls back from.

### 3. Decomposer

When `config.freesound_pipeline` is true, `decompose()` appends the contents of a new
`api/prompts/decomposer_freesound.txt` to the system prompt (after the user's override so custom
prompts get it too):
> For elements that are recordings of a specific real thing (animal calls, bells, rain, traffic,
> water, machinery), add `"search": "<2 to 4 word query>"`. Never for music or abstract textures.
> The query names the thing, not the mood: "owl hoot night", not "lonely owl".
Parser accepts optional `search: str` (max 60 chars), keeps it on the element. Read the file via
the same `prompts.load` helper as the others.

### 4. Pipeline

- `STAGE_PROGRESS` becomes `{"decomposing": 10, "sourcing": 20, "generating": 30, "mixing": 70,
  "persisting": 90}`; frontend `GeneratingView.tsx` stage labels get "finding recordings".
- New `api/app/services/sources.py`: `resolve_sources(elements, config, scratch: Path) -> None`.
  For each element with `search` and `config.freesound_pipeline`: `search` → `pick` (kind from
  `playback`, target from `clip_s`) → `fetch_preview` → `decode_preview` → `sf.write(scratch /
  f"{index:02d}.wav")`, set `element["file"]`, `element["source"] = "freesound"`,
  `element["source_json"] = provenance(hit)`, `element["looped"] = playback == "loop" and
  hit.ac_loopable` (so the mixer still loops non-loopable picks). Any exception: log and leave the
  element to the generator.
- `run_generation`: open one `TemporaryDirectory` around sourcing + generation + mixing; call
  `generate()` with only unsourced elements; merge results back by `index`. If every element was
  sourced, skip the generator call entirely.
- `_persist` already copies `source`/`source_json` (WP1).
- "Take another" (`atmospheres.regenerate`) copies `source_json`; `resolve_sources` sees a
  `source_json.id` and re-fetches that exact sound without searching (one request,
  deterministic).
- `regenerate_element` with feedback on a Freesound layer: run the refiner, then `resolve_sources`
  on the single spec if `search` is present, else generate.

### 5. Credits UI

`DashboardView.tsx` footer: for elements with `source === 'freesound'`, one line per element
"*name* by *username* (licence) ↗" linking to `source_json.url`; a "Copy credits" button copies
plain text. `SELF_HOSTING.md` gains a "Freesound" section: how to get a key, licence policy, that
previews are stored per atmosphere and deleted with it.

### 6. Tests

`api/tests/test_freesound.py` with a monkeypatched `requests.get` (same style as
`conftest.FakeResponse`): filter string per kind always contains the licence clause; ranking
prefers rated CC0; `resolve_sources` sets `file`/`source`/`source_json`; a search failure leaves
the element for the generator; `run_generation` with all elements sourced never calls the
generator; `source_json` survives `_persist` and "Take another".

Acceptance: with a key and the toggle on, a "night forest" atmosphere sources at least the owl
and rain from Freesound (visible in `source`), the mix sounds coherent, credits show on the
dashboard, and deleting the atmosphere removes the files.

---

## WP4 — Freesound manual search and add-layer (3–4 days)

Depends on: WP2 (for `buildTrackChain`/`addTrack`) and WP3. Branch: `feat/freesound-manual-layer`.

Goal: from the dashboard the user searches Freesound, previews a hit, and adds it as a new
layer (loop or event) without restarting the other layers.

### 1. API

- `api/app/routers/freesound.py` (register in `main.py`):
  `GET /api/freesound/search?q=&kind=loop|event&page=1` → `Envelope[list[FreesoundHitOut]]`
  with `id, name, username, license, url, duration, preview_url, rating`. 409 when the user has
  no key; upstream 429 → 429; upstream 401 → 409 with "key rejected". Uses `freesound.search`.
- `POST /api/atmospheres/{id}/elements` (in `routers/atmospheres.py`) body
  `{"freesound_id": int, "playback": "loop" | "oneshot", "label": str | None}` → 202 with the new
  `ElementOut`. Creates `Element(position=max+1, label=_unique_label(...), type="sound",
  prompt=hit name, audio_path="", status="sourcing", playback, interval_* from
  ROLE_INTERVALS["occasional"] when oneshot, source="freesound", source_json=provenance)` and
  calls `worker.submit_source(element.id)`. Scope to the current user. Reject if the atmosphere is
  not `ready`.
- `api/app/worker.py`: third handler `source_handler` (same pattern as `element_handler`);
  `reclaim_interrupted` also fails rows left in `sourcing`.
- `pipeline.add_sourced_element(element_id)`: fetch/decode the preview → `analyze` over all
  layers (stored ones via `_stored_payload` with `playback`) → write WAV via
  `storage.write_element_audio` → `_apply_mix(regenerated=True)` for the new row → `status =
  "ready"`. On failure `status = "failed"`, `error` set, keep the row so the user can delete it.
- `serialize_element`: `audio_url = None` when `audio_path` is empty (done in WP1 schema).

### 2. Frontend

- `frontend/src/api/freesound.ts`: `searchFreesound(q, kind)`, `addFreesoundElement(atmosphereId,
  body)`.
- `frontend/src/components/FreesoundPanel.tsx`: slide-over cloned from `HistoryPanel.tsx`
  (search input with icon, skeleton/empty/error states): query field, loop/event toggle, result
  rows with a native `<audio controls src={preview_url}>` preview, licence chip, "Add" button.
  Opened by an "Add layer" header button in `DashboardView.tsx` (same button recipe as Export)
  and by a trailing dashed "+" tile after the `TrackStrip` map in the mixer grid.
- `useAudioEngine.ts` `addTrack(el)`: decode one element, `buildTrackChain`, push to
  `decodedRef`/`tracksRef`, start (loop) or register a lane (oneshot). `decodeElements` skips
  elements with `audio_url === null` instead of throwing.
- `App.tsx` `handleAddFreesound`: optimistic row with `status: 'sourcing'` → `watchRegeneration`
  (busy check includes `'sourcing'`). When done, instead of `loadAtmosphereIntoEngine` (which
  restarts everything): apply the server's recomputed `volume/pan/depth/eq_json` to existing
  tracks via `setVolume/setPan/setDepth/setEQ`, then `addTrack` the new element. Use the same
  diff path for single-element regeneration (replace only the changed track).
- `TrackStrip.tsx`: `status === 'sourcing'` shows the existing overlay with text "fetching".

### 3. Tests

`api/tests/test_freesound.py` extended: 404 for another user's atmosphere, 409 without key,
`submit_source` receives the id, label uniqueness, `add_sourced_element` sets `ready` and
`audio_path`, failure path sets `failed`.

Acceptance: search "church bell", preview, add as event → new strip appears with `event` badge
while other layers keep playing uninterrupted; credits list updates.

---

## WP5 — Engine registry in the generator (2 days)

Depends on: nothing. Branch: `refactor/generator-engine-registry`.

Goal: `generators/core` exposes an `Engine` Protocol and a registry; AudioCraft becomes one
engine among several; output is normalised to one sample rate; `GET /` reports engine and models
generically. Behaviour for AudioCraft users is unchanged.

### 1. Package layout

```
generators/core/halcyon_generator/
  engines/__init__.py      ENGINES registry (lazy import paths), build_engine(config)
  engines/base.py          Engine Protocol, BaseEngine
  engines/audiocraft.py    AudioCraftEngine (moved from engine.py)
  engine.py                re-exports AudioCraftEngine, MIN/MAX_DURATION_S for backwards compat
```
```python
class Engine(Protocol):
    name: str
    config: GeneratorConfig
    loaded: bool
    def load(self) -> None: ...
    def models(self) -> dict[str, str]: ...        # {"sound": "...", "music": "..."}
    def generate(self, elements: list[dict[str, Any]], duration: int | None = None) -> list[dict[str, Any]]: ...

class BaseEngine(ABC):
    def synthesize(self, prompts: list[str], kind: str, seconds: int) -> tuple["torch.Tensor", int]: ...   # [B, C, T], sr
```
`BaseEngine.generate`: resolve per-element duration (batch `duration` as fallback, clamp 1–120),
group by `(kind, seconds)`, call `synthesize`, then `_normalize_loudness` (torchaudio
`transforms.Loudness` + gain to `config.loudness_lufs`, tanh soft-clip; replaces audiocraft's
`audio_write`), `torchaudio.functional.resample` to `config.sample_rate` (keep native channel
count), encode WAV with `soundfile`, return `{**elem, "audio_b64"}` in input order.

### 2. Config and CLI

`config.py`: `engine` (`GENERATION_ENGINE`, default `audiocraft`), `model` (`GENERATION_MODEL`,
single-model engines), `steps` (`GENERATION_STEPS`, default 100), `sample_rate`
(`GENERATION_SAMPLE_RATE`, default 44100). `cli.py serve` adds `--engine --model --steps`.

### 3. HTTP surface

`app.py` `GET /` → `{"status", "loaded", "engine", "models", "sample_rate", "duration",
"max_duration"}`, plus legacy `audiogen_model`/`musicgen_model` when engine is audiocraft (keeps
`test_home_reports_the_configured_models`).
`api/app/services/generator.py` `probe` whitelist += `engine`, `models`, `sample_rate`.
`frontend/src/types/index.ts` `GeneratorReport` += those; `GeneratorsCard.tsx` `reportOf` shows
`engine` and `models` when present, falling back to the legacy keys.

### 4. Tests

`generators/core/tests/`: `StubEngine` implements the Protocol; a `FakeSynthEngine(BaseEngine)`
whose `synthesize` returns a sine at 16 kHz is used to test grouping by duration, resampling to
44.1 kHz, loudness within ±1 LU of target, unknown keys echoed, input order preserved. `torch`
and `torchaudio` become test dependencies of `generators/core` (CPU wheels are fine) or the
BaseEngine numeric path is written in NumPy so tests stay torch-free. Prefer NumPy for
resample/loudness (scipy `resample_poly`, a simple K-weighted RMS) to keep the test env light.

Docs: `generators/README.md` engine section; `SELF_HOSTING.md` `GET /` fields.

Acceptance: `halcyon-generator serve` with no env behaves exactly as before; `GET /` shows
`engine: audiocraft`; the API probe still renders the report.

---

## WP6 — Stable Audio Open and TangoFlux engines + Modal per-engine images (3–4 days)

Depends on: WP5. Branch: `feat/diffusion-engines`.

### 1. Engines

- `engines/stable_audio.py`: `diffusers.StableAudioPipeline.from_pretrained(config.model or
  "stabilityai/stable-audio-open-1.0", torch_dtype=float16)`; gated repo → needs `HF_TOKEN` env.
  `synthesize`: `audio_end_in_s=min(seconds, 47)`, `num_inference_steps=config.steps`,
  `negative_prompt="low quality, distorted, harsh"`, batch prompts. `music` uses the same model
  (the decomposer's music template is already a music prompt).
- `engines/tangoflux.py`: `TangoFluxInference(name=config.model or "declare-lab/TangoFlux")`,
  `generate(prompt, steps=config.steps, duration=min(seconds, 30))` one prompt at a time; output
  44.1 kHz stereo.
- `engines/audioldm2.py`: `diffusers.AudioLDM2Pipeline`, `audio_length_in_s`, 16 kHz. Stretch;
  include only if cheap.
- `models()` returns `{"sound": model_id, "music": model_id}`.

### 2. Dependencies (`generators/core/pyproject.toml`)

Keep `[audiocraft]`. Add:
```
diffusion = ["torch>=2.3", "torchaudio>=2.3", "diffusers>=0.30", "transformers>=4.44", "accelerate", "soundfile", "huggingface_hub"]
tangoflux = ["torch>=2.3", "torchaudio>=2.3", "tangoflux @ git+https://github.com/declare-lab/TangoFlux.git"]
```
Note in `generators/README.md` that extras are mutually exclusive per environment and that both
Stability and TangoFlux weights are non-commercial licences.

### 3. Modal (`generators/modal/deploy.py`)

- `ENGINE = os.getenv("HALCYON_ENGINE", "audiocraft")`; `_image_for(engine)` returns a distinct
  `modal.Image` per engine (different torch pins); app name `halcyon-generator-{engine}` so
  several can be deployed side by side and appear as separate `GeneratorProfile`s in the account
  page; `modal.Secret.from_name("huggingface")` mounted for gated weights; `GENERATION_ENGINE`,
  `GENERATION_MODEL`, `GENERATION_STEPS` baked into the image env; model cache volume keyed per
  engine.
- `.env.example` documents `HALCYON_ENGINE`, `GENERATION_MODEL`, `GENERATION_STEPS`,
  `HF_TOKEN`. `generators/modal/README.md` and `SELF_HOSTING.md` updated, including measured
  cold/warm numbers per engine once deployed.

Verification: deploy `HALCYON_ENGINE=stable_audio`, add it as a profile in the account page,
probe shows `engine: stable_audio`, generate a scene, WAVs are 44.1 kHz. Repeat for tangoflux.

Acceptance: switching the active generator profile between the AudioCraft and Stable Audio
deployments requires no API or frontend change.

---

## WP7 — Generation backend benchmark (1–2 days)

Depends on: WP6 (at least one alternative engine deployed). Branch: `feat/backend-benchmark`.

`experiments/generation_backends/`:
- `prompts.json`: 12 prompts (4 beds at 4 s, 4 events at 2 s, 4 textures/music at 10 s) taken
  from real decompositions.
- `run.py --url <generator> --engine <name>`: posts each prompt individually and as one batch,
  records wall time, bytes, sample rate, channels, and the generator's `GET /` report →
  `runs/<engine>.json`.
- `score.py`: writes `results.md` with seconds of audio per wall second, per role, per engine;
  optional `--clap` computes a `laion_clap` text–audio similarity (extra dependency, only when
  asked).
- Row in `experiments/README.md`. Reference the WP0 `timings_json` numbers from real runs as a
  second data source.

Acceptance: `results.md` has one row per engine with cost per second of audio and, for AudioCraft,
a before/after WP1+WP2 comparison of total GPU seconds for the same prompt.

---

## Honest assessment

- **Not too optimistic in scope, but heavy in time.** Roughly 20–25 focused days across seven
  packages. Each WP ships as its own PR and leaves the app working, so progress is incremental.
- **Cheapest, surest win:** WP1 + WP2. Roughly halves GPU seconds on AudioGen for a typical scene
  and makes sparse sounds natural. The mixer changes are small and covered by existing invariant
  tests. The browser scheduler is the largest single piece of new frontend code and the first
  code there with unit tests.
- **Freesound (WP3 + WP4)** is product value more than research value and is the most
  "integration-shaped" work: credentials, a new pipeline stage, a new worker job, a new endpoint,
  a search panel, credits. It is bounded because previews decode with `soundfile` and the client is
  tiny. Licence policy fixed at CC0 + CC-BY.
- **Engines (WP5 + WP6)** are mostly dependency and deployment work; the abstraction itself is
  two days. Expect Modal image builds and gated weights to eat time. Quality parity with AudioGen
  on ambient beds is likely better with Stable Audio Open (trained on Freesound), not worse.
- **Cut order if time is short:** AudioLDM2 engine, CLAP scoring in WP7, WP4 manual panel, then
  WP3.
- **Things deliberately not planned:** re-keying browser tracks by id (label uniqueness is already
  enforced server-side), loopable diffusion via circular latents (revisit if short beds sound
  periodic on diffusion engines), OAuth original downloads from Freesound (previews are enough),
  retries in the worker (still an open AUDIT item, separate PR).
