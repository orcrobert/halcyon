# AGENTS.md

Guidance for coding agents working in this repository: Claude Code, Codex,
Gemini CLI, Cursor, Aider or anything else that reads a context file. It is the
contract for how work is done here. `CLAUDE.md` imports this file.

For humans, start at [README.md](README.md) (using it),
[SELF_HOSTING.md](SELF_HOSTING.md) (running it for others) or
[MANUAL.md](MANUAL.md) (developing it). For deep detail, see
[`.claude/docs/`](.claude/docs/).

---

## What this project is

**Halcyon** turns a natural-language scene description into an infinite, mixable
ambient soundscape:

```
prompt → LLM decomposition → per-element audio generation → rule-based mixer → browser playback
```

The **mixer** (`mixer/`) is the core of the system: it assigns EQ, volume, and
spatial placement to every generated element from audio analysis alone. The LLM
never suggests mixing parameters.

**Core UX principle: this is ambient audio.** Calm, soft, immersive, never
aggressive. The decomposer prompt enforces this and every feature must respect it.

---

## Golden rules (non-negotiable)

1. **Never write comments in code.** No inline comments, no explanatory
   docstrings, in any language. Explain in the PR description or in
   `.claude/docs/`. The existing comments in `mixer/` are intentional domain
   citations: do not add new ones, do not strip them without reason.
2. **Branch, commit logically, push, open a PR.** Never commit to `main`.
3. **Never commit secrets.** `.env` files, API keys, `data/`, and Colab/ngrok
   URLs stay out of git. `.env.example` is the only tracked env file.
4. **Match the surrounding code.** The file you are editing wins over preference.
5. **Keep the docs true.** A change that alters behaviour, configuration, a
   command or a contract updates the document that owns it in the same PR (see
   [Where things are documented](#where-things-are-documented)).

---

## Using an agent other than Claude Code

Claude Code reads `CLAUDE.md`, loads the matching `.claude/rules/*.md` file by
path, and runs the hooks in `.claude/hooks/` on every edit. Other agents get
none of that automatically, so do by hand what the hooks would do:

- **Before editing an area, read its rule file:** `api/` and `scripts/` →
  `.claude/rules/api.md`, `frontend/` → `frontend.md`, `mixer/` → `mixer.md`,
  `generators/` → `generators.md`, `.github/`, `Dockerfile`, compose files and
  `pyproject.toml` files → `release.md`.
- **Do not edit** `.env*` (except `.env.example`), `*.pem`, `*.key`, `data/`,
  `frontend/dist/`, `audiocraft/`, `output/`, `frontend/package-lock.json`,
  `uv.lock` or `frontend/public/soundtouch-processor.js`. They are secrets,
  runtime state, build output or generated files.
- **After editing, lint what you touched:** `ruff check <file>` for Python,
  `cd frontend && npx eslint <file>` for TypeScript, then the checks in
  [Commands](#commands).
- **Check your diff for comments** before committing. The hook that rejects them
  does not run for you.

Codex and Cursor read `AGENTS.md` on their own. Aider needs it passed in
(`--read AGENTS.md`, or `read: AGENTS.md` in `.aider.conf.yml`). Gemini CLI
reads `GEMINI.md` by default; point its context file name at `AGENTS.md` in its
settings rather than adding a copy.

---

## Git workflow

Branch from an up-to-date `main` as `<type>/<short-kebab-description>`, commit
as `<type>: <Imperative summary>`, push, and open a PR against `main` with a
What / Why / Notes body. Types: `feat`, `fix`, `chore`, `refactor`, `docs`,
`test`, chosen per commit.

**Commit types set the version number.** After CI passes on `main`, the
`Release` workflow bumps minor for `feat:`, patch for `fix:`, major for any
`<type>!:` or a `BREAKING CHANGE:` footer, and releases nothing for the rest.
Choose the type honestly. Never create `v*` tags by hand: the workflow owns them.

The full policy is [`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md);
how tags become images and releases is in
[SELF_HOSTING.md](SELF_HOSTING.md#versions-tags-and-releases).

---

## Repository map

| Path            | Stack                     | Role |
|-----------------|---------------------------|------|
| `frontend/`     | React 19, TS, Vite, Tailwind, Web Audio API | UI + the browser audio engine (playback, live mixing, export) |
| `api/`          | FastAPI, Python 3.11, SQLModel, SQLite | Accounts, persistence, generation pipeline, audio serving, updates, and the built UI |
| `mixer/`        | Python 3.11, NumPy, librosa | **Core.** Standalone package: auto-EQ, volume, spatial placement, looping, clip quality |
| `generators/`   | Python package + per-host adapters | GPU audio synthesis. `core/` is the shared FastAPI server; `colab/`, `local/`, `huggingface/`, `modal/` are thin hosts for it |
| `experiments/`  | Python, scikit-learn      | Research code: LLM decomposition benchmark, learned spatial model (a negative result) |
| `scripts/`      | Python CLIs               | Operational utilities (`check_clips` calibrates the quality thresholds) |
| `.github/`      | GitHub Actions            | CI, the release workflow, Dependabot, the `@claude` workflow |
| `.claude/`      | Agent tooling             | Rules, docs, hooks, skills, plans and the audit backlog |
| `audiocraft/`   | vendored (gitignored)     | Meta's AudioCraft, used by the generators, not our source |

The `Dockerfile` builds the whole stack as one container, in two targets:
`runtime` and `runtime-cli` (adds Node, Claude Code and Codex). `compose.yaml`
runs the published image and is the file self-hosters copy, so it must never
need the repo; `compose.build.yaml` layers a local build on top of it.

Python is one workspace: the root `pyproject.toml` is the `api` distribution and
takes `mixer/` as a path dependency. Application code never touches `sys.path`;
`api/tests/conftest.py` is the one exception.

Gitignored by design: `output/`, `audiocraft/`, `frontend/dist/`, `.env`,
`data/`, `mixer/models/`, `thesis/`, `.claude/settings.local.json`.

---

## Data flow

1. The browser `POST /api/atmospheres` with `{prompt, duration_s}` (and an
   optional style clip). The API creates an `Atmosphere` (`pending`), hands its
   id to the in-process worker thread and returns `202`. The browser polls
   `GET /api/atmospheres/{id}` every 1.5 s.
2. The worker runs `api/app/services/pipeline.py`: decompose → (optional layer
   review pause) → wake the generator → generate → quality check → mix →
   persist, writing `status`, `progress`, `current_stage` and `stage_detail` as
   it goes.
3. **Decompose** calls the user's LLM. **Generate** posts the elements to their
   generator and gets WAVs back. The **mixer** `analyze()` computes `eq_json`,
   `volume`, `pan` and `depth` and makes each clip loopable.
4. **Persist** writes WAVs to `DATA_DIR/audio/{atmosphere}/`, inserts `Element`
   rows and copies the mix into `original_*` columns for reset.
5. The browser fetches `/api/elements/{id}/audio`, builds a Web Audio graph in
   `useAudioEngine.ts`, plays it looped, and patches live edits back (debounced
   250 ms) through `PATCH /api/elements/{id}`. Export renders offline to WAV.

The definitive version, with every endpoint, is
[`.claude/docs/architecture.md`](.claude/docs/architecture.md).

---

## Commands

Prerequisites: Python 3.11, Node.js 22.12 or newer (CI and the image use 24).
Install once from the repo root: `pip install -e ./mixer -e '.[dev]'` (or
`uv sync`) and `cd frontend && npm install`. Full setup is in [MANUAL.md](MANUAL.md).

| What | Command |
|------|---------|
| API (dev) | `uvicorn api.app.main:app --reload --port 8001` from the repo root |
| Frontend (dev) | `cd frontend && npm run dev` (port 5173, proxies `/api` to 8001) |
| Whole stack in Docker | `docker compose -f compose.yaml -f compose.build.yaml up -d --build` |
| API + mixer tests | `pytest` from the repo root |
| Generator tests | `cd generators/core && pip install -e '.[dev]' && pytest` |
| Python lint | `ruff check .` |
| Frontend checks | `cd frontend && npm run lint && npx tsc --noEmit && npm test` |
| Frontend build | `cd frontend && npm run build` (the API serves `frontend/dist`) |
| Image build | `docker build -t halcyon .` (add `--target runtime-cli` for the CLI image) |

CI runs the tests, lint, build and an image boot on every push to `main`. Pull
requests do not run CI, so run the checks for what you touched before pushing.

---

## Conventions

- Python 3.11, type hints on public functions, `snake_case`, small pure
  functions. FastAPI routers stay thin, schemas in `api/app/models/schemas.py`,
  tables in `api/app/models/tables.py`. Scope every query to the current user.
- TypeScript: functional components and hooks, `import type` where possible.
  Audio-graph logic in `hooks/`, presentation in `components/`.
  `frontend/src/types/index.ts` mirrors `schemas.py`: change both together.
- Colour and type come only from `frontend/src/theme.css` tokens.
- Detail per language: [`.claude/docs/conventions.md`](.claude/docs/conventions.md).

---

## Cross-cutting rules

These apply wherever you are working. Rules for a single area live in
`.claude/rules/` (`api.md`, `frontend.md`, `mixer.md`, `generators.md`,
`release.md`). **Read the one for the area you are about to change.** Claude
Code loads them automatically by path; other agents must open them.

- **Mixing params are computed from audio, never from the LLM.** LLM-suggested
  EQ/volume/pan was tried and removed. Do not bring it back.
- **Two mixing engines exist and must agree.** The Python `mixer` runs at
  generation time and `useAudioEngine` runs in the browser. Pan is −1..1, depth
  0..1, and both use the RBJ cookbook filters that Web Audio implements.
- **`eq_json` is a full band list, never three sliders.** The browser builds
  every band. The sliders own only the 200/1k/8k bands and carry the rest
  through.
- **Resolve run settings through `resolve_config`.** Generator URL, decomposer
  provider and decomposer prompt are per-user overrides of the instance `.env`.
  Never read `settings.generator_url` or `api/prompts/decomposer.txt` directly.
- **Per-user secrets are encrypted at rest and write-only.** The API exposes
  `*_set: bool`, never the value.
- **The generator is a bring-your-own HTTP service** and the fragile link. The
  contract is in [SELF_HOSTING.md](SELF_HOSTING.md#the-generator-contract);
  fix generation bugs in `generators/core`, never in one host.
- **Versions live in git tags only.** Never bump a `pyproject.toml` `version`
  by hand: the release stamps it.
- **Zero-config by default.** Infer behaviour from existing state (the first
  account is the admin, a missing `SECRET_KEY` is generated) before adding an
  environment variable. A new variable goes in `.env.example` and the
  configuration table in `SELF_HOSTING.md`.

Known issues and the cleanup backlog are in [`.claude/AUDIT.md`](.claude/AUDIT.md).
Read it before large refactors.

---

## Where things are documented

Each fact has one home. Update that file; link to it from elsewhere instead of
restating it.

| Topic | Owner |
|-------|-------|
| What Halcyon is, quick start, first-run setup | [README.md](README.md) |
| Every environment variable, Docker, image tags, updates, releases, backups, CLI language models, the generator contract | [SELF_HOSTING.md](SELF_HOSTING.md) |
| Developing from source, using the app, troubleshooting, tests | [MANUAL.md](MANUAL.md) |
| Generator hosts and their configuration | [generators/README.md](generators/README.md) and each host's README |
| Architecture, endpoints, parameter table | [`.claude/docs/architecture.md`](.claude/docs/architecture.md) |
| Coding standards | [`.claude/docs/conventions.md`](.claude/docs/conventions.md) |
| Colour and type tokens | [`.claude/docs/design-tokens.md`](.claude/docs/design-tokens.md) |
| Branches, commits, PRs, version bumps | [`.claude/docs/git-workflow.md`](.claude/docs/git-workflow.md) |
| Per-area rules | [`.claude/rules/`](.claude/rules/) |
| Approved plans with open work | [`.claude/plans/`](.claude/plans/) |
| Known issues | [`.claude/AUDIT.md`](.claude/AUDIT.md) |
| Experiments | [experiments/README.md](experiments/README.md) |
| Instance-wide defaults with comments | [`.env.example`](.env.example) |

Skills in [`.claude/skills/`](.claude/skills/): `feature-workflow` (branch → PR)
and `run-stack` (bring it up). Agents without skill support can read them as
plain checklists.
