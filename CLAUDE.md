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
2. **Commit logically.** One coherent change per commit, present-tense
   imperative subject (`Add binaural beat presets`, not `added stuff`). No author
   name, no AI attribution, no co-author trailer.
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
| `backend/`      | Laravel 12, PHP 8.2, Sanctum, SQLite | Auth, persistence, job queue, signed audio URLs |
| `ai/`           | FastAPI, Python 3.11      | Orchestration: decompose prompt → call generator → run mixer analysis |
| `mixer/`        | Python 3.11, NumPy, librosa | **Core IP.** Standalone package: auto-EQ, volume, spatial placement, looping |
| `colab/`        | Jupyter notebook          | GPU host for AudioGen/MusicGen, exposed to `ai/` via ngrok |
| `pan_model/`    | Python, scikit-learn      | Experiment: learned spatial model (negative result — see AUDIT) |
| `experiments/`  | data + scripts            | LLM decomposition benchmark (thesis experiment) |
| `scripts/`      | Python CLIs               | Training / evaluation / dataset-building utilities |
| `audiocraft/`   | vendored (gitignored)     | Meta's AudioCraft, used by the Colab notebook — not part of our source |

Untracked-by-design (gitignored): `output/`, `audiocraft/`, `frontend/dist/`,
`.env`, `data/`, `mixer/models/`, `thesis/`.

---

## Data flow (end to end)

1. **Frontend** `POST /api/atmospheres` with `{prompt}` → Laravel creates an
   `Atmosphere` (`status: pending`) + `GenerationJob`, dispatches
   `GenerateAtmosphereJob`, returns `202`.
2. Frontend **polls** `GET /api/atmospheres/{id}` (1.5 s interval) until status
   is `ready` or `failed`.
3. **Job** calls the AI service `POST /generate` with the prompt (auth via
   `X-AI-Service-Secret`).
4. **AI service** decomposes the prompt (Gemini by default, Ollama fallback) into
   typed elements, forwards them to the **Colab** generator, receives WAVs, runs
   the **mixer** `analyze()` to compute `eq_json` / `volume` / `pan` / `depth`,
   and returns base64 audio + params.
5. **Job** persists each `Element` (audio to Laravel storage; original mix params
   copied into `original_*` columns for reset), marks the atmosphere `ready`.
6. **Frontend** fetches audio via signed URLs, builds a Web Audio graph in
   `useAudioEngine.ts`, plays looped, and lets the user re-mix live (volume, EQ,
   pan, depth, tuning, binaural). Edits are debounced (250 ms) and patched back
   via `PATCH /api/elements/{id}`. Export renders offline to a WAV.

The definitive version is in
[`.claude/docs/architecture.md`](.claude/docs/architecture.md).

---

## Per-component quick reference

Full setup and run instructions are in [MANUAL.md](MANUAL.md). Short version:

- **frontend** — `cd frontend && npm install && npm run dev`. Lint with
  `npm run lint`. Types in `src/types/index.ts` are the source of truth for the
  API contract; keep them in sync with Laravel resources.
- **backend** — `cd backend && composer install && php artisan migrate`. Run the
  API with `php artisan serve` and a worker with `php artisan queue:work`
  (generation is queued — nothing happens without a running worker). Tests:
  `php artisan test`.
- **ai** — `cd ai && uvicorn ai.app.main:app --reload`. Config comes from the
  repo-root `.env` via `ai/app/config.py`. Requires `AI_SERVICE_SECRET` set to a
  non-null value or every request 500s.
- **mixer** — pure library, no server. Public API is `analyze()` and
  `mix_to_file()` in `mixer/mixer/core.py`. See the
  [`mixer`](.claude/skills/mixer/SKILL.md) skill before changing DSP.

---

## Conventions

- **No comments** (see golden rules).
- **Python**: 3.11, type hints on public functions, `snake_case`, small pure
  functions. The mixer keeps DSP constants as module-level UPPER_CASE and is
  written to degrade gracefully when `librosa` is absent — preserve that.
- **PHP**: Laravel conventions. Controllers thin, validation via
  `$request->validate`, API shapes via `Http/Resources`. Authorize ownership on
  every atmosphere/element route.
- **TypeScript**: functional components, hooks, `type`-only imports where
  possible. Audio-graph logic lives in `hooks/`, presentation in `components/`.
- Details per language in
  [`.claude/docs/conventions.md`](.claude/docs/conventions.md).

---

## Gotchas

- **The queue worker must be running** or atmospheres stay `pending` forever.
- **The generator is a bring-your-own HTTP service** (`GENERATOR_URL`, legacy
  alias `COLAB_URL`). The bundled Colab notebook is one reference implementation
  and a fragile link — the AI service times out (300 s) if the generator is down.
  The contract is documented in [SELF_HOSTING.md](SELF_HOSTING.md#the-generator-contract).
- **Decomposer defaults to Gemini** (`DECOMPOSER_MODEL=gemini`). Needs
  `GEMINI_API_KEY`. Set `DECOMPOSER_MODEL=llama` or `mistral` for the offline
  Ollama path.
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
