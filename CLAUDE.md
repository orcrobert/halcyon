# CLAUDE.md

Guidance for AI coding agents (Claude Code and others) working in this repository.
Read this file first. It is the contract for how work is done here.

For humans, see [MANUAL.md](MANUAL.md). For deep detail, see [`.claude/docs/`](.claude/docs/).

---

## What this project is

**Halcyon** turns a natural-language scene description into an infinite, mixable
ambient soundscape. The pipeline is:

```
prompt → LLM decomposition → per-element audio generation → rule-based mixer → browser playback
```

The repo is a monorepo. The **mixer** (`mixer/`) is the core of the system: it
assigns EQ, volume, and spatial placement to each generated element
automatically, from audio analysis alone — the LLM never suggests mixing
parameters.

**Core UX principle: this is ambient audio.** Calm, soft, immersive. Never
aggressive. The decomposer prompt enforces this and any feature must respect it.

---

## Golden rules (non-negotiable)

1. **Never write comments in code.** No inline comments, no docstrings added for
   explanation, nowhere, in any language. Explain in the PR description or in
   `.claude/docs/` instead. (Existing comments in `mixer/` are intentional domain
   citations — do not add new ones, do not strip existing ones without reason.)
2. **Follow the Git workflow below for every change.** Branch, logical commits,
   push, open a PR. Never commit straight to `main`.
3. **Never put "Claude", "AI", "Anthropic", "generated with", or a co-author
   trailer in commit messages or PR descriptions.** Write them as a human
   engineer would.
4. **Never commit secrets.** `.env` files, API keys, and Colab/ngrok URLs stay
   out of git. `.env.example` is the only env file that is tracked.
5. **Match the surrounding code.** Idiom, naming, and structure of the file you
   are editing win over personal preference.

---

## Git workflow (do this for every feature/fix/chore)

When the user asks for a change:

1. **Branch from `main`.** Always start clean:
   ```
   git checkout main && git pull
   git checkout -b <type>/<short-kebab-description>
   ```
   `<type>` is one of `feat`, `fix`, `chore`, `refactor`, `docs`, `test`.
2. **Commit logically.** One coherent change per commit, subject in the form
   `<type>: <imperative summary>` (`feat: Add binaural beat presets`, not
   `added stuff`). Types are `feat`, `fix`, `chore`, `refactor`, `docs`, `test` —
   the same set as the branch prefixes, chosen per commit rather than per branch.
   No author name, no AI attribution, no co-author trailer.
3. **Push and open a PR when the work is complete and verified:**
   ```
   git push -u origin <branch>
   gh pr create --base main --title "<subject>" --body "<what and why>"
   ```
   The PR body describes what changed and why, reviewer-facing. No AI mentions.

The full policy, including commit-message shape and PR-body template, lives in
[`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md). The
[`feature-workflow`](.claude/skills/feature-workflow/SKILL.md) skill automates it.

---

## Repository map

| Path            | Stack                     | Role |
|-----------------|---------------------------|------|
| `frontend/`     | React 19, TS, Vite, Tailwind, Web Audio API | UI + the browser audio engine (playback, live mixing, export) |
| `api/`          | FastAPI, Python 3.11, SQLModel, SQLite | Accounts, persistence, generation pipeline, audio serving, and the built UI |
| `mixer/`        | Python 3.11, NumPy, librosa | **Core IP.** Standalone package: auto-EQ, volume, spatial placement, looping |
| `generators/`   | Python package + per-host adapters | GPU audio synthesis. `core/` is the shared FastAPI server; `colab/`, `huggingface/`, `modal/` are thin hosts for it |
| `experiments/`  | Python, scikit-learn      | All research code: LLM decomposition benchmark, learned spatial model (negative result — see AUDIT) |
| `scripts/`      | Python CLIs               | Operational utilities for the shipped pipeline |
| `audiocraft/`   | vendored (gitignored)     | Meta's AudioCraft, used by the generators — not part of our source |

`Dockerfile` + `docker-compose.yml` build and run the whole stack as one
container (Node stage → `frontend/dist`, Python stage → venv, slim runtime).
The image installs non-editable, so `DATA_DIR` and `FRONTEND_DIST` are absolute
paths set in the Dockerfile rather than the repo-relative defaults.

Python is one workspace: the root `pyproject.toml` is the `api` distribution and
takes `mixer/` as a path dependency. Install with `pip install -e ./mixer -e
'.[dev]'` (or `uv sync`) and import `api.app.*` / `mixer.*` normally — nothing
manipulates `sys.path`.

Untracked-by-design (gitignored): `output/`, `audiocraft/`, `frontend/dist/`,
`.env`, `data/`, `mixer/models/`, `thesis/`.

---

## Data flow (end to end)

1. **Frontend** `POST /api/atmospheres` with `{prompt}` → the API creates an
   `Atmosphere` (`status: pending`), hands its id to the in-process worker
   thread, and returns `202`.
2. Frontend **polls** `GET /api/atmospheres/{id}` (1.5 s interval) until status
   is `ready` or `failed`.
3. **Worker** runs `services/pipeline.py`, writing `status` / `progress` /
   `current_stage` onto the atmosphere row as it goes: decompose → generate →
   mix → persist.
4. **Decompose** resolves the user's provider settings (falling back to the
   instance `.env`) and calls their LLM; **generate** posts the elements to
   `GENERATOR_URL` and gets WAVs back; the **mixer** `analyze()` computes
   `eq_json` / `volume` / `pan` / `depth` and makes each clip loopable.
5. **Persist** writes the processed WAVs to `DATA_DIR/audio/{atmosphere}/` and
   inserts `Element` rows, copying the mix params into `original_*` columns for
   reset. The atmosphere goes `ready`.
6. **Frontend** fetches audio from `/api/elements/{id}/audio` with its bearer
   token, builds a Web Audio graph in `useAudioEngine.ts`, plays looped, and lets
   the user re-mix live (volume, EQ, pan, depth, tuning, binaural). Edits are
   debounced (250 ms) and patched back via `PATCH /api/elements/{id}`. Export
   renders offline to a WAV.

The definitive version is in
[`.claude/docs/architecture.md`](.claude/docs/architecture.md).

---

## Per-component quick reference

Full setup and run instructions are in [MANUAL.md](MANUAL.md). Short version:

- **frontend** — `cd frontend && npm install && npm run dev`. Lint with
  `npm run lint`. Types in `src/types/index.ts` are the source of truth for the
  API contract; keep them in sync with `api/app/models/schemas.py`.
- **api** — `uvicorn api.app.main:app --reload --port 8001` from the repo root.
  Config comes from the repo-root `.env` via `api/app/config.py`. Tests:
  `pytest api/tests`. The database is created on first boot; there is
  no migration step.
- **mixer** — pure library, no server. Public API is `analyze()` and
  `mix_to_file()` in `mixer/mixer/core.py`. See the
  [`mixer`](.claude/skills/mixer/SKILL.md) skill before changing DSP.

---

## Conventions

- **No comments** (see golden rules).
- **Python**: 3.11, type hints on public functions, `snake_case`, small pure
  functions. The mixer keeps DSP constants as module-level UPPER_CASE and is
  written to degrade gracefully when `librosa` is absent — preserve that.
- **FastAPI**: routers thin, validation via Pydantic schemas in
  `api/app/models/schemas.py`, database models in `api/app/models/tables.py`.
  Scope every atmosphere/element query to the current user.
- **TypeScript**: functional components, hooks, `type`-only imports where
  possible. Audio-graph logic lives in `hooks/`, presentation in `components/`.
- **Colour and type come from `frontend/src/theme.css`.** No hex literals,
  no `rgb()`/`rgba()`, no Tailwind palette classes anywhere in `frontend/src/`
  — use a token (`bg-surface`, `text-ink-dim`, `var(--color-accent)`). See
  [`.claude/docs/design-tokens.md`](.claude/docs/design-tokens.md).
- Details per language in
  [`.claude/docs/conventions.md`](.claude/docs/conventions.md).

---

## Gotchas

- **Generation runs on one in-process worker thread**, started in the FastAPI
  lifespan. It is not a separate process. Anything left `generating` when the
  server restarts is reclaimed and marked `failed` on the next boot.
- **The generator is a bring-your-own HTTP service** (`GENERATOR_URL`, legacy
  alias `COLAB_URL`) and a fragile link — the API times out (300 s) if it is
  down. The contract is documented in
  [SELF_HOSTING.md](SELF_HOSTING.md#the-generator-contract).
- **The pipeline narrates itself through `Atmosphere.stage_detail`.** Every
  `_set_stage` call carries a human sentence built in
  `services/stages.py` from the `RunConfig` (provider, model, generator host)
  and the decomposition, and the loading screen shows it verbatim. Before
  `POST /generate` the worker sits in a `waking` stage, polling the
  generator's `GET /` (`wait_until_ready`) until it answers with
  `loaded: true` or `WAKE_TIMEOUT_S` passes, ticking the elapsed seconds into
  the detail — that is how a Modal cold start or a still-loading Colab shows
  up as such instead of as a long silent `generating`. Tests stub that probe
  through the autouse `awake_generator` fixture.
- **`generators/` holds four hosts over one package.** Generation logic belongs
  in `generators/core`; `colab/`, `local/`, `huggingface/` and `modal/` install
  it from git and should stay thin. Do not fix a generation bug in one host — fix
  `core` and they all inherit it. Its tests run without AudioCraft or a GPU
  (`cd generators/core && pytest`).
- **Generators are per-user rows, not a setting.** `GeneratorProfile` holds the
  saved hosts and exactly one is active; `resolve_config()` prefers it over
  `user_settings.generator_url` (legacy, still honoured) and then the instance
  `GENERATOR_URL`. Anything resolving a generator must go through
  `resolve_config`, never read `settings.generator_url` directly.
- **The decomposer is any LLM.** `DECOMPOSER_PROVIDER` is `gemini`, `ollama`,
  `openai` (any OpenAI-compatible endpoint), or `claude_cli`/`codex_cli`, which
  shell out to a logged-in CLI on the server. Providers live in
  `api/app/services/providers.py`; add one there and it appears in the account
  panel automatically. Every setting is a per-user override of the `.env`
  default, resolved by `services/runconfig.py`. CLI providers (`local_cli`) are
  filtered out by `available_providers()` unless `DECOMPOSER_ALLOW_CLI` is set,
  since they run every user on the server's own login.
- **The decomposer system prompt is per-user too.** `api/prompts/decomposer.txt`
  is the shipped default; `UserSettings.decomposer_prompt` overrides it and the
  account page edits it. Read it through `RunConfig.decomposer_prompt`, never by
  loading the file directly.
- **Per-user API keys are encrypted at rest** and must never be returned by the
  API — expose `decomposer_api_key_set: bool`, never the value.
- **Soundscape length is per atmosphere.** `Atmosphere.duration_s` is chosen in
  the prompt view (5–120 s, default 10) and travels to the generator as
  `duration` in the `POST /generate` body. It is the loop length of every
  generated layer, not a playback length — playback is still infinite. A
  generator that ignores the field falls back to its own configured duration.
- **The decomposer tags every layer with a `role`; code turns that into a clip
  length.** `bed` is stationary noise-like material, `texture` anything that
  evolves (music is always `texture` and never an `event`), `event` one short
  sound triggered now and then. `services/generator.py` `clip_length` maps role
  → seconds using `BED_CLIP_S`/`EVENT_CLIP_S` in `api/app/config.py` and sends
  it as a per-element `duration`; the result is stored on `Element.clip_s`.
  Tuning constants live in code, never in the user-editable prompt. A missing
  or unknown role falls back to `texture`, so custom decomposer prompts written
  before roles existed keep working.
- **Events are scheduled in the browser, never baked into a WAV.** An `event`
  element is one short clip; `playback` is `oneshot` and `interval_min_s`/
  `interval_max_s` (from the LLM's `frequency` through `ROLE_INTERVALS`) set how
  often it fires. `hooks/eventScheduler.ts` is pure and unit-tested; the lane
  scheduler in `useAudioEngine` runs on `ctx.currentTime` with a lookahead, so
  `ctx.suspend()` pauses it with no extra state. Events bypass the SoundTouch
  worklet — global tuning is for tonal layers. Export plans triggers from a
  seeded PRNG so the same length renders the same file.
- **One-shots do not compete in the mix.** `analyze` runs `assign_volumes` and
  `assign_spatial` over the loop layers only; a mostly-silent one-shot would
  otherwise win the loudness anchor and push every bed to the 0.15 floor.
  Events get `place_events` instead, sitting `EVENT_OFFSET_DB` under the
  loudest loop layer, or under `EVENT_FALLBACK_ANCHOR_DB` when a scene has no
  loop layer at all.
- **Generator replies are matched by `index`, then `label`, then position.**
  The reference generator batches by `(type, seconds)` and so answers out of
  order. Never zip the reply positionally.
- **Layers can be deleted and regenerated after the fact.** `DELETE
  /api/elements/{id}` is permanent — row plus WAV — and refuses the last layer.
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
- **Layer review is a pause, not a stage of the worker.** With the
  per-user `review_decomposition` flag on, a fresh decomposition parks the
  atmosphere at `status: awaiting_review` and the worker moves on. The browser
  shows `ReviewLayersModal` (edit by hand, or ask the LLM through the shipped
  `api/prompts/reviser.txt`), then `PUT /api/atmospheres/{id}/decomposition`
  re-queues it and the stored decomposition skips the LLM; closing the modal
  deletes the atmosphere. `awaiting_review` is a stop state for polling and is
  never reclaimed on restart. New takes carry a decomposition and never pause.
- **Themes are presets over the token ramps.** `frontend/src/themes.ts` holds
  twenty specs; `themeVariables()` expands each into the primitive layer in
  OKLab. Add a spec, never a hand-written ramp. The choice lives on
  `UserSettings.theme` and is mirrored to `localStorage` for first paint.
- **Reduce blur is a per-user flag applied through one root attribute.**
  `UserSettings.reduce_blur` is mirrored to `localStorage` like the theme, and
  `effects.ts` sets `data-reduce-blur` on `<html>`. `index.css` then drops every
  backdrop filter, makes `data-frosted` panels opaque and hides `data-glow`
  layers, and the canvases skip their shadow blur via `blurReduced()`. A new
  frosted panel needs `data-frosted`, and a new blur-only glow needs `data-glow`.
- **A style clip conditions music layers through MusicGen-Style.** The prompt
  view lets the user upload audio and crop a 1.5–4.5 s excerpt
  (`StyleClipModal`, maths in `hooks/styleClip.ts`); the browser renders it to a
  32 kHz mono WAV and sends it as `style` on `POST /api/atmospheres`. The API
  stores it at `DATA_DIR/styles/{atmosphere}.wav` (outside the audio folder,
  which `_persist` wipes) with metadata on `Atmosphere.style_json`, adds
  `STYLE_NOTE` to the decomposer prompt so the scene has a music layer, and
  attaches `style_b64` to every `music` element sent to the generator —
  including single-layer regenerations and new takes, which copy the clip. The
  generator loads `STYLE_MODEL` on the first styled request, or in
  `load()` when `STYLE_PRELOAD` is set (the Modal default, so the weights are
  committed to the cache volume), and falls back to plain MusicGen when it has
  none. Without a clip nothing changes.
- **Generator options are declared once, in `services/generator_options.py`.**
  Each `OptionSpec` has a scope. `deploy` options (GPU, models, style preload,
  fallback length, loudness, idle shutdown) only apply to Modal and become env
  vars for `modal deploy`. `request` options (style closeness, prompt weight)
  travel as `options` on every `POST /generate` through
  `RunConfig.generator_options`. The account page renders whatever specs the API
  lists, so a new option needs only a spec plus the code that reads it.
  `GeneratorProfile.options_json` holds the user's values and `deployed_json`
  the deploy options at the last successful deploy; `pending_changes` is the
  diff, and a missing `deployed_json` counts as the defaults.
- **Modal deploys run from the API.** `services/modal_deploy.py` runs
  `python -m modal deploy generators/modal/deploy.py` on its own thread per
  generator (never on the generation worker), with the user's encrypted Modal
  token or the instance `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`, streams the log
  onto the row, and takes the `*.modal.run` URL from the output. The Docker image
  ships `generators/core` and `deploy.py` under `GENERATORS_DIR`. A deploy left
  `deploying` at boot is marked failed. In the browser, `hooks/generatorStore.ts`
  is the one copy of the generator list; `DeployToast` stays on screen while a
  redeploy is pending, running or failed, and polls only while one runs. It sets
  `--deploy-toast-offset` so the page and the dashboard's error bar clear it.
- **Mixing params are computed from audio, never from the LLM.** Do not add
  LLM-suggested EQ/volume/pan — that path was tried and removed (thesis ch4).
- **Two mixing engines exist**: the Python `mixer` (used at generation time) and
  the browser `useAudioEngine` (used for live playback/export). Keep their
  parameter conventions aligned (pan −1..1, depth 0..1) and their filter maths
  identical — both are the RBJ cookbook, which is what Web Audio implements.
- **`eq_json` is a full band list, not three sliders.** `auto_eq` emits
  corrective bands at whatever frequency the analysis picked; the browser builds
  every one of them into a biquad chain. The three at 200/1k/8k are reserved for
  the user's sliders, which read and write only those and carry the rest
  through. Never collapse the list to three bands — that silently throws the
  auto-EQ away and reapplies its gains at the wrong frequencies. The sliders
  start at 0 because they are an offset on top of the mixer; the EQ panel draws
  the mixer's bands as a response curve and lists each with its `source`
  (`tone` or `masking`), which the PATCH schema keeps.
- **Masking cuts follow role and loudness.** `auto_eq` takes the draft
  volumes `analyze` computes before EQ and the element `role`, cuts only the
  less important layer of a colliding pair, and never lets an event cause a
  cut. Anything that calls `analyze` must pass `role` on every element,
  including stored layers during a regeneration.
- **Stored loop clips carry padding the player must skip.** A decoder
  resampling a clip to the device rate starves at the first and last sample, so
  a seam that is clean in the file arrives as a tick once per loop — worst on
  the 16 kHz `sound` layers, which need the most resampling and loop the
  shortest. `pad_for_looping` writes `LOOP_PAD_S` of each end past the loop
  points and `Element.duration_s` stays the *unpadded* length, so the browser
  derives the loop region as `(buffer.duration - duration_s) / 2` and plays the
  interior. A file with no padding falls back to looping the whole buffer, so
  clips written before this keep working. One-shots are never padded.
- **Released audio tracks must be disconnected.** The SoundTouch worklet
  never lets its processor go idle, so a track left connected after release
  keeps rendering, and each rebuild adds another one. `releaseTrack`
  disconnects the chain after its fade-out. Layers share one reverb convolver
  per context through their wet sends, so do not go back to a convolver per
  track.
- **Known issues and cleanup targets** are catalogued in
  [`.claude/AUDIT.md`](.claude/AUDIT.md). Read it before large refactors.

---

## Where to look next

- [MANUAL.md](MANUAL.md) — human setup + run guide for the whole stack.
- [SELF_HOSTING.md](SELF_HOSTING.md) — self-host config, generator contract, containerization map.
- [`.claude/docs/architecture.md`](.claude/docs/architecture.md) — deep architecture.
- [`.claude/docs/conventions.md`](.claude/docs/conventions.md) — coding standards.
- [`.claude/docs/design-tokens.md`](.claude/docs/design-tokens.md) — the frontend colour and type tokens.
- [`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md) — branch/commit/PR policy.
- [`.claude/AUDIT.md`](.claude/AUDIT.md) — known issues and refactor backlog.
- [`.claude/skills/`](.claude/skills/) — automatable workflows for this repo.
