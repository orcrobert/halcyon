---
paths:
  - "api/**"
  - "scripts/**"
---

# API rules

Applies to `api/` and `scripts/`. The cross-cutting rules in `AGENTS.md` still hold.

## Shape

- Routers stay thin: validate → delegate to `services/` → return a schema from
  `models/schemas.py`. Never return a table row. Keep the `Envelope` / `Page`
  wrappers; the frontend depends on them.
- Scope every atmosphere/element query to the current user. Someone else's row is
  a 404, not a 403.
- The database is created on first boot. There is no migration step: on every
  boot `db.py` `_add_missing_columns` adds new columns to existing tables, and
  it only adds nullable ones. A new column on an existing table must be
  nullable (`Optional`, default `None`) or it never reaches a live database.
- Tests: `pytest api/tests`. The autouse `awake_generator` fixture stubs the
  generator readiness probe.

## The worker

- **Generation runs on one in-process worker thread**, started in the FastAPI
  lifespan. It is not a separate process. Anything left `generating` when the
  server restarts is reclaimed and marked `failed` on the next boot.
- **The pipeline narrates itself through `Atmosphere.stage_detail`.** Every
  `_set_stage` call carries a human sentence built in `services/stages.py` from
  the `RunConfig` (provider, model, generator host) and the decomposition, and
  the loading screen shows it verbatim. Before `POST /generate` the worker sits
  in a `waking` stage, polling the generator's `GET /` (`wait_until_ready`)
  until it answers with `loaded: true` or `WAKE_TIMEOUT_S` passes, ticking the
  elapsed seconds into the detail. That is how a Modal cold start or a
  still-loading Colab shows up as such instead of as a long silent `generating`.
- The API times out (300 s) on a generator that is down.

## Run configuration

- **Generators are per-user rows, not a setting.** `GeneratorProfile` holds the
  saved hosts and exactly one is active; `resolve_config()` prefers it over
  `user_settings.generator_url` (legacy, still honoured) and then the instance
  `GENERATOR_URL`.
- **The decomposer is any LLM.** `DECOMPOSER_PROVIDER` is `gemini`, `ollama`,
  `openai` (any OpenAI-compatible endpoint), or `claude_cli`/`codex_cli`, which
  shell out to a logged-in CLI on the server. Providers live in
  `services/providers.py`; add one there and it appears in the account panel
  automatically. Every setting is a per-user override of the `.env` default,
  resolved by `services/runconfig.py`. CLI providers (`local_cli`) are filtered
  out by `available_providers()` unless `DECOMPOSER_ALLOW_CLI` is set, since
  they run every user on the server's own login.
- **The decomposer system prompt is per-user too.** `api/prompts/decomposer.txt`
  is the shipped default; `UserSettings.decomposer_prompt` overrides it and the
  account page edits it. Read it through `RunConfig.decomposer_prompt`.
- **Generator options are declared once, in `services/generator_options.py`.**
  Each `OptionSpec` has a scope. `deploy` options (GPU, models, style preload,
  fallback length, loudness, idle shutdown) only apply to Modal and become env
  vars for `modal deploy`. `request` options (style closeness, prompt weight)
  travel as `options` on every `POST /generate` through
  `RunConfig.generator_options`. The account page renders whatever specs the
  API lists, so a new option needs only a spec plus the code that reads it.
  `GeneratorProfile.options_json` holds the user's values and `deployed_json`
  the deploy options at the last successful deploy; `pending_changes` is the
  diff, and a missing `deployed_json` counts as the defaults.
- **Modal deploys run from the API.** `services/modal_deploy.py` runs
  `python -m modal deploy generators/modal/deploy.py` on its own thread per
  generator (never on the generation worker), with the user's encrypted Modal
  token or the instance `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`, streams the log
  onto the row, and takes the `*.modal.run` URL from the output. The Docker
  image ships `generators/core` and `deploy.py` under `GENERATORS_DIR`. A deploy
  left `deploying` at boot is marked failed.

## Accounts

- **Administrators manage other accounts through the same routers.** The first
  account to register is the admin, and `ensure_admin` promotes the oldest
  account on boot when none is. With `ALLOW_REGISTRATION=false` the first
  account can still register (`registration_open`). The settings and generator
  routers are mounted at `/api/settings`, `/api/generators` and again under
  `/api/admin/users/{user_id}/`; their handlers take `AccountOwner`, never
  `CurrentUser`, so one code path serves both. A new settings or generator route
  gets the admin variant for free, and must scope by that `user`. An admin
  cannot demote or delete themselves.
- **Per-user API keys are encrypted at rest** and never returned: expose
  `decomposer_api_key_set: bool`, never the value.

## Updates

- **Self-updates go through the Watchtower sidecar, never the Docker socket.**
  `services/updates.py` reads the latest GitHub release, compares it with
  `settings.halcyon_version` inside the `HALCYON_TAG` line, and posts to
  `UPDATER_URL/v1/update` with the token from `/updater/token`. The post runs on
  its own thread and the route returns `202`, since the container is replaced
  mid-request. Updates are refused (409) while anything is generating,
  regenerating or deploying. Instance-wide switches live in the single-row
  `InstanceSettings` table, not in `.env`.

## Layers and generation

- **Soundscape length is per atmosphere.** `Atmosphere.duration_s` is chosen in
  the prompt view (5–120 s, default 10) and travels to the generator as
  `duration` in the `POST /generate` body. It is the loop length of every
  generated layer, not a playback length. A generator that ignores the field
  falls back to its own configured duration.
- **The decomposer tags every layer with a `role`; code turns that into a clip
  length.** `bed` is stationary noise-like material, `texture` anything that
  evolves (music is always `texture` and never an `event`), `event` one short
  sound triggered now and then. `services/generator.py` `clip_length` maps role
  → seconds using `BED_CLIP_S`/`EVENT_CLIP_S` in `api/app/config.py` and sends
  it as a per-element `duration`; the result is stored on `Element.clip_s`.
  Tuning constants live in code, never in the user-editable prompt. A missing or
  unknown role falls back to `texture`.
- **Evolving layers come in takes.** `UserSettings.texture_takes` (1–3,
  default `DEFAULT_TEXTURE_TAKES` = 2, resolved into `RunConfig.texture_takes`)
  is how many independent clips a looping `texture` layer gets. Beds and events
  always get one (`generator.py` `take_count`). `generate` appends the extra
  takes to the same request with their own `index` and folds the replies back
  into `takes_audio` on their layer. `check_results` ranks every take of a
  layer by `quality_score`: the cleanest becomes the layer's clip, the others
  survive only if nothing flagged them. Spare takes skip `analyze`: the persist
  step runs them through the mixer's `match_take` against the analysed clip and
  stores them as `{position}_{label}_take{n}.wav` on `Element.takes_json`
  (`path`, `duration_s`), served at `GET /api/elements/{id}/audio?take={n}`.
  The layer's EQ, volume and placement apply to every take. Regenerating a
  layer replaces its takes and deleting it removes them.
- **Event frequency comes from the LLM, timing from code.** An `event` element
  gets `playback: oneshot` and `interval_min_s`/`interval_max_s` from its
  `frequency` through `ROLE_INTERVALS`. The browser schedules it.
- **Generator replies are matched by `index`, then `label`, then position.**
  The reference generator batches by `(type, seconds)` and so answers out of
  order. Never zip the reply positionally.
- **Every generated clip is checked, and re-rendering is the user's call.**
  `services/quality.py` `check_results` runs `mixer/mixer/effects/quality.py`
  `inspect_clip` over each reply before the mix. Silent or unreadable clips are
  dropped (all of them failing fails the run). Anything else is kept and stored
  on `Element.quality_json`. The worker never retries on its own. The user
  either re-renders flagged layers through the normal single-layer regenerate or
  keeps them (`POST /api/atmospheres/{id}/quality/dismiss` sets
  `quality_dismissed`). A regeneration re-checks its layer and clears the
  dismissal. To calibrate the `QUALITY_*` thresholds, run
  `python -m scripts.check_clips <folder>` over real clips.
- **Layers can be deleted and regenerated after the fact.** `DELETE
  /api/elements/{id}` is permanent (row plus WAV) and refuses the last layer.
  `POST /api/elements/{id}/regenerate` queues a background job on the same
  worker thread: with feedback the layer goes through `refine_element` (the
  shipped `api/prompts/refiner.txt`) first, without it the stored prompt is
  regenerated as-is and no LLM is called. `Element.status` drives the UI, and
  `Element.version` busts the browser's audio cache.
- **Regeneration re-runs the whole mix.** `analyze()` runs over every layer so
  the new clip is placed against its neighbours. Stored clips go back in marked
  `looped` so only the new one is trimmed to a loop point. Recomputed values
  always become `original_*`; live values follow only where the user had not
  moved that control by hand.
- **A new take follows the current layers, not the original decomposition.**
  `POST /api/atmospheres/{id}/regenerate` copies today's element rows onto a
  fresh atmosphere, so deleted and rewritten layers stay that way. Generation
  reuses a decomposition the atmosphere already carries instead of calling the
  LLM again. A new take keeps the source atmosphere's `duration_s`.
- **Layer review is a pause, not a stage of the worker.** With the per-user
  `review_decomposition` flag on, a fresh decomposition parks the atmosphere at
  `status: awaiting_review` and the worker moves on. The browser shows
  `ReviewLayersModal` (edit by hand, or ask the LLM through the shipped
  `api/prompts/reviser.txt`), then `PUT /api/atmospheres/{id}/decomposition`
  re-queues it and the stored decomposition skips the LLM; closing the modal
  deletes the atmosphere. `awaiting_review` is a stop state for polling and is
  never reclaimed on restart. New takes carry a decomposition and never pause.
- **A style clip conditions music layers through MusicGen-Style.** The browser
  sends a 32 kHz mono WAV as `style` on `POST /api/atmospheres`. The API stores
  it at `DATA_DIR/styles/{atmosphere}.wav` (outside the audio folder, which
  `_persist` wipes) with metadata on `Atmosphere.style_json`, adds `STYLE_NOTE`
  to the decomposer prompt so the scene has a music layer, and attaches
  `style_b64` to every `music` element sent to the generator, including
  single-layer regenerations and new takes, which copy the clip. Without a clip
  nothing changes.
- **Stored loop clips carry padding.** `_persist` writes loop layers through
  `pad_for_looping` (`LOOP_PAD_S` past each loop point) while
  `Element.duration_s` stays the unpadded length. One-shots are never padded.
