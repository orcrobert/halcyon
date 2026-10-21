# Manual — Halcyon

How to set up, run, use and develop the whole stack from a checkout. For running
an instance for others (Docker, tags, updates, backups) see
[SELF_HOSTING.md](SELF_HOSTING.md); for architecture and contribution rules see
[AGENTS.md](AGENTS.md) and [`.claude/docs/`](.claude/docs/).

---

## 1. What you are running

| Process | Port | Command | Needed for |
|---------|------|---------|-----------|
| API | 8001 | `uvicorn api.app.main:app --reload --port 8001` | always |
| Vite dev server | 5173 | `cd frontend && npm run dev` | frontend work, with hot reload |
| Generator | 9000 (yours) | see [generators/](generators/README.md) | generating audio |

The API owns accounts, persistence, the generation worker (a thread inside the
same process), audio serving, updates, and, when `frontend/dist` exists, the UI
itself.

The dev server proxies `/api` to the API, so the browser only ever talks to one
origin and CORS never enters the picture. Without the dev server, build the UI
once and open the API's own port.

---

## 2. Prerequisites

- **Python 3.11** (the workspace requires `>=3.11`; CI and the image use 3.11)
- **Node.js 22.12 or newer** with npm (Vite 8 needs it; CI and the image use 24)
- A **language model**: an API key for Gemini or any OpenAI-compatible service,
  Ollama running somewhere, or Claude Code / Codex logged in on this machine
- A **generator**: a host from [generators/](generators/README.md) (Modal,
  Colab, your own CUDA GPU, Hugging Face) or any service implementing the
  [contract](SELF_HOSTING.md#the-generator-contract)
- Optional: Docker, to run the stack the way a self-hosted instance does
- Optional: `gh`, for the PR workflow

You can start the API and UI with neither a model nor a generator; generation
fails with a clear message until both are set.

---

## 3. First-time setup

### 3.1 Install

```bash
git clone https://github.com/orcrobert/halcyon.git && cd halcyon

python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ./mixer -e '.[dev]'

cd frontend && npm install && cd ..
```

The repo is one Python workspace: the root project (`api`) depends on `./mixer`.
With uv, `uv sync` resolves the same thing. Installing the mixer pulls `numpy`,
`scipy`, `soundfile` and `librosa`; the mixer still falls back to a NumPy-only
path if `librosa` is absent, at reduced quality.

For the generator's own tests (no GPU or AudioCraft needed):

```bash
pip install -e './generators/core[dev]'
```

### 3.2 Environment file (optional)

```bash
cp .env.example .env
```

One file, at the repo root; `api/app/config.py` reads it from there whatever the
working directory. Every value is an instance-wide default, and each user can
override the language model and generator in the app, so for a single developer
the account page is usually simpler than editing `.env`. The full list of
variables is in [SELF_HOSTING.md](SELF_HOSTING.md#configuration). The ones you
are most likely to set while developing:

| Variable | Meaning |
|----------|---------|
| `DECOMPOSER_PROVIDER` | `gemini`, `ollama`, `openai`, `claude_cli` or `codex_cli` |
| `DECOMPOSER_MODEL` | model id; blank uses the provider's default |
| `DECOMPOSER_API_KEY` | key for the provider |
| `DECOMPOSER_ALLOW_CLI` | `true` to offer the Claude Code and Codex providers |
| `GENERATOR_URL` | fallback generator for accounts that saved none |
| `DATA_DIR` | database, audio and the encryption key; `data/` by default |

`data/` is gitignored and holds real state. The database, audio and
`secret.key` there belong to your local instance only; a Docker instance keeps
its own in the `/data` volume.

### 3.3 Frontend environment (optional)

`frontend/.env.example` documents three Vite variables; copy it to
`frontend/.env.local` to set them:

| Variable | Default | Use |
|----------|---------|-----|
| `VITE_DEV_API_TARGET` | `http://localhost:8001` | where the dev server proxies `/api` |
| `VITE_DEV_HOST` | `localhost` | a custom dev domain behind a TLS proxy (Herd, Valet) |
| `VITE_API_URL` | same origin | only when the built UI is hosted apart from the API (then set `FRONTEND_ORIGIN` on the API) |

### 3.4 Database

None to set up. The SQLite file is created at `DATA_DIR/halcyon.db` on first
boot, and new nullable columns are added to an existing database on every boot.
To start from scratch, stop the API and delete `data/`.

---

## 4. Running the stack

### 4.1 Development, with hot reload

```bash
# terminal 1: the API
source .venv/bin/activate
uvicorn api.app.main:app --reload --port 8001

# terminal 2: the UI
cd frontend && npm run dev
```

Open <http://localhost:5173>, register (the first account is the
administrator), set a language model and a generator in **Account**, and
generate. `curl localhost:8001/health` answers
`{"status":"ok","version":"dev"}` when the API is up.

The quickest generator to try is the
[Colab notebook](generators/colab/README.md); for real use,
[Modal](generators/modal/README.md), deployable from the account page.

### 4.2 Production-like, from source

Build the UI once and let the API serve it:

```bash
cd frontend && npm run build && cd ..
uvicorn api.app.main:app --port 8001
```

Open <http://localhost:8001>. Rebuild after every frontend change.

### 4.3 In Docker

The closest thing to how a self-hosted instance runs:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build  # this checkout
docker compose up -d                                                # the published image
```

Both serve <http://localhost:8001> and keep their state in the `halcyon-data`
volume, not in `data/`. Compose reads the repo-root `.env` too, so a `DATA_DIR`
or `FRONTEND_DIST` there is ignored (compose pins the image's paths) but
`DECOMPOSER_*` and `ALLOW_REGISTRATION` apply. So does `GENERATOR_URL`: the
`.env.example` value `http://localhost:9000` points at the container itself, so
comment it out or set `http://host.docker.internal:9000` before using Docker.
Details in
[SELF_HOSTING.md](SELF_HOSTING.md#running-it-with-docker).

---

## 5. Using the app

### 5.1 Creating a soundscape

1. **Register / log in.** The session is a bearer token kept in `localStorage`.
2. **Describe a scene**: a place, a mood or a single sound ("rainy Kyoto garden
   at dusk", "cold and lonely", "a distant foghorn"). Abstract prompts are
   translated into sonic qualities, not literal objects.
3. **Options next to the prompt box:**
   - **Length**: 10, 20, 30 or 60 s. It is how long the evolving layers and
     music are generated; beds are generated at 4 s and events at 2 s whatever
     you pick, and everything loops or repeats forever.
   - **Events**: allow or forbid one-shot sounds (an owl, a bell) that recur at
     random intervals.
   - **Style clip**: upload a song and crop 1.5–4.5 s; music layers follow its
     sound through MusicGen-Style.
   - **Takes per evolving layer** (Account → Language model → Workflow, 1–3,
     default 2): evolving layers and music are rendered that many times and
     playback crossfades between the versions in random order, so the loop is
     harder to hear. Beds and events are rendered once. More takes mean a longer
     wait. A layer's details show it, for example "10s loop · 2 takes".
4. **Review layers** (if turned on in Account → Language model → Workflow): before anything is
   generated, edit the proposed layers by hand or ask the model to revise them
   with a note. Closing the review discards the soundscape.
5. **Wait.** The loading screen names each stage: decomposing, waking the
   generator (a Modal cold start takes a minute or two), generating, mixing,
   saving.

### 5.2 Mixing it

On the dashboard every layer is a strip:

- **Volume**, **EQ** (low shelf 200 Hz, peak 1 kHz, high shelf 8 kHz on top of
  the automatic corrective EQ), **pan** (−1..1) and **depth** (reverb send,
  0..1). Edits save themselves.
- **Density** on event layers: how often the one-shot recurs.
- **Regenerate** (↻): say what you did not like and the layer is rewritten and
  generated again; leave the note empty to roll the same prompt again. It runs
  in the background and the strip comes back when it is done.
- **Delete** (trash, click twice): permanent, the row and its WAV are gone. The
  last layer cannot be deleted.

For the whole scene:

- **Tuning**: global pitch shift, 400–580 Hz, pulled gently onto the presets
  432/440/528 within 6 Hz of them. Events are not retuned.
- **Binaural beats**: a sine pair under the mix (default 200/208 Hz, ten
  presets).
- **Animate**: slow autonomous drift of pan, volume and depth.
- **Export**: render 30 s, 1, 2 or 5 minutes of the current mix to a WAV. The
  same length always renders the same file.
- **Take another**: generate the scene again as a *new* soundscape from the
  layers you have now, leaving this one untouched.
- **Quality warnings**: clips flagged for clipping, bursts, dropouts, harshness
  or a loop-seam jump are listed; re-render them or keep them.

**History** reopens any previous soundscape; edits persist server-side.

### 5.3 Account

| Section | What it holds |
|---------|---------------|
| Language model | provider, model, key or login token, base URL, the decomposer system prompt (editable; clearing it restores the shipped one), and the review-layers switch |
| Audio generator | saved generators, the active one, **Test**, Modal deploys and their options |
| Appearance | twenty themes, reduce blur |
| Account | profile and sign out |
| Users | administrators only: create, edit, promote and delete accounts, and set up their models and generators |
| Updates | administrators only: version, release notes, the update button and automatic updates |

---

## 6. Scripts

| Command | What it does |
|---------|--------------|
| `python -m scripts.check_clips <folder> [--role bed\|texture\|event]` | runs the clip quality check over a folder of WAVs; use it to calibrate the `QUALITY_*` thresholds in `mixer/mixer/effects/quality.py` |
| `halcyon-generator check <url>` | prints what a generator reports on `GET /` (after installing `generators/core`) |

`scripts/generate_cli.py` is out of date with the pipeline and does not run;
see [`.claude/AUDIT.md`](.claude/AUDIT.md).

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Stuck at *waking* for two minutes, then fails | generator down, asleep or wrong URL | **Test** it in Account → Audio generator; for Colab, paste the new session URL |
| Generation fails after several minutes | the generator took longer than the 300 s request budget | shorter length, fewer layers, or a faster GPU |
| Fails immediately with a key error | no key for the chosen provider | add one in Account → Language model, or switch to Ollama |
| *… is disabled on this server* / *… needs the `claude` command* | CLI provider without `DECOMPOSER_ALLOW_CLI=true`, or no CLI installed | [CLI setup](SELF_HOSTING.md#language-models-through-a-cli) |
| Failed with "interrupted by a server restart" | the API restarted mid-generation | generate again; nothing is left stranded |
| Fails at *decomposing* with a message about the layers | the model returned malformed or empty layers | try a clearer prompt or a larger model |
| Creating fails with 422 | the style clip is too short, too long, too large or not audio | crop 1.5–4.5 s and try again |
| Every generation fails at the mix stage in Docker | `/tmp` not writable | run with `--tmpfs /tmp` (compose already does) |
| 401 on every call | token expired or revoked | sign in again |
| Blank page at `:8001` | no `frontend/dist` build | `cd frontend && npm run build`, or use the dev server |
| No audio in the browser | autoplay blocked, or the pitch worklet missing | interact with the page first; `npm run copy-worklets` restores `public/soundtouch-processor.js` |
| Dev server refuses to start | port 5173 taken (`strictPort`) | stop the other process |
| `pytest api/tests/test_settings.py` fails locally but not in CI | your `.env` sets `DECOMPOSER_ALLOW_CLI=true` | known issue, see AUDIT; unset it while testing |

---

## 8. Tests and quality

| Area | Command |
|------|---------|
| API + mixer | `pytest` from the repo root; narrow with `pytest api/tests` or `pytest mixer/tests` |
| Generator | `cd generators/core && pytest` (no AudioCraft or GPU needed) |
| Python lint | `ruff check .` |
| Frontend | `cd frontend && npm run lint && npx tsc --noEmit && npm test` |
| Frontend build | `cd frontend && npm run build` |
| Image | `docker build -t halcyon .`; CI also boots it read-only and runs a mix inside it |

CI (`.github/workflows/ci.yml`) runs all of these on every push to `main`. Pull
requests do not run CI, so run the checks for what you touched before opening
one. Read [`.claude/rules/mixer.md`](.claude/rules/mixer.md) before changing
anything under `mixer/`: audible changes need listening, not only tests.

---

## 9. Contributing and releasing

Branch, commit as `<type>: <Imperative summary>`, open a PR against `main`. The
commit types decide the next version: after a merge passes CI, any `feat:`
releases a minor version, any `fix:` a patch, a `!` or `BREAKING CHANGE:` a
major, and the rest nothing. The release workflow tags, publishes the images and
writes the release notes; nobody tags by hand. Policy in
[git-workflow.md](.claude/docs/git-workflow.md), what a release publishes in
[SELF_HOSTING.md](SELF_HOSTING.md#versions-tags-and-releases).

Working with a coding agent (Claude Code, Codex, Gemini CLI, …) is covered in
[AGENTS.md](AGENTS.md).

---

## 10. Experiments

All research code lives under `experiments/`, one directory per experiment, with
run instructions in [`experiments/README.md`](experiments/README.md).

- `experiments/llm_eval/`: LLM decomposition benchmark (`run.py`, `score.py`,
  and its own `requirements.txt`).
- `experiments/spatial_model/`: learned spatial placement experiment
  (documented negative result; the shipped mixer uses the heuristic in
  `mixer/mixer/effects/spatial.py`).
