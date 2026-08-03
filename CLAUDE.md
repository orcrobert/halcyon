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
- **`generators/` holds three hosts over one package.** Generation logic belongs
  in `generators/core`; `colab/`, `huggingface/` and `modal/` install it from git
  and should stay thin. Do not fix a generation bug in one host — fix `core` and
  they all inherit it. Its tests run without AudioCraft or a GPU
  (`cd generators/core && pytest`).
- **The decomposer is any LLM.** `DECOMPOSER_PROVIDER` is `gemini`, `ollama`, or
  `openai` (any OpenAI-compatible endpoint). Providers live in
  `api/app/services/providers.py`; add one there and it appears in the account
  panel automatically. Every setting is a per-user override of the `.env`
  default, resolved by `services/runconfig.py`.
- **Per-user API keys are encrypted at rest** and must never be returned by the
  API — expose `decomposer_api_key_set: bool`, never the value.
- **Mixing params are computed from audio, never from the LLM.** Do not add
  LLM-suggested EQ/volume/pan — that path was tried and removed (thesis ch4).
- **Two mixing engines exist**: the Python `mixer` (used at generation time) and
  the browser `useAudioEngine` (used for live playback/export). Keep their
  parameter conventions aligned (EQ bands 200/1k/8k, pan −1..1, depth 0..1).
- **Known issues and cleanup targets** are catalogued in
  [`.claude/AUDIT.md`](.claude/AUDIT.md). Read it before large refactors.

---

## Where to look next

- [MANUAL.md](MANUAL.md) — human setup + run guide for the whole stack.
- [SELF_HOSTING.md](SELF_HOSTING.md) — self-host config, generator contract, containerization map.
- [`.claude/docs/architecture.md`](.claude/docs/architecture.md) — deep architecture.
- [`.claude/docs/conventions.md`](.claude/docs/conventions.md) — coding standards.
- [`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md) — branch/commit/PR policy.
- [`.claude/AUDIT.md`](.claude/AUDIT.md) — known issues and refactor backlog.
- [`.claude/skills/`](.claude/skills/) — automatable workflows for this repo.
