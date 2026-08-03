# Manual — Halcyon

How to set up, run, and operate the whole stack locally. For architecture and
contribution rules see [CLAUDE.md](CLAUDE.md) and [`.claude/docs/`](.claude/docs/).

---

## 1. What you are running

Two services cooperate:

| Service   | Port (default) | Command |
|-----------|----------------|---------|
| API       | 8001           | `uvicorn api.app.main:app --port 8001` |
| Generator | 9000 (yours)   | your own; ready-made hosts in `generators/` |

The API owns accounts, persistence, generation, audio serving, and — when
`frontend/dist` exists — the UI itself.

For frontend work you also run the Vite dev server on 5173. It proxies `/api` to
the API, so the browser only ever talks to one origin and CORS never enters the
picture. For a custom dev domain (Herd/Valet), set `VITE_DEV_HOST`. See
[SELF_HOSTING.md](SELF_HOSTING.md) to run your own instance.

---

## 2. Prerequisites

- Python 3.11+ (a virtualenv is recommended)
- Node.js 20+ and npm
- A decomposer: an API key for any cloud LLM, **or** Ollama running locally
- A generator: pick a host from [generators/](generators/README.md) — Colab
  (free, needs a Google account), Modal, or Hugging Face — or any service of
  your own that exposes the `POST /generate` contract

---

## 3. First-time setup

### 3.1 Environment file

One file, at the repo root (`api/app/config.py` points there):

```bash
cp .env.example .env
```

Key variables:

| Variable | Meaning |
|----------|---------|
| `DECOMPOSER_PROVIDER` | `gemini`, `ollama`, or `openai` (any OpenAI-compatible endpoint) |
| `DECOMPOSER_MODEL` | model id; blank uses the provider's default |
| `DECOMPOSER_BASE_URL` | endpoint; blank uses the provider's default |
| `DECOMPOSER_API_KEY` | key for the provider; unnecessary for local servers |
| `GENERATOR_URL` | base URL of your generator (legacy alias: `COLAB_URL`) |
| `DATA_DIR` | database, generated audio, and the encryption key |
| `SECRET_KEY` | encrypts stored API keys; auto-generated if blank |
| `ALLOW_REGISTRATION` | set `false` to close signups |

These are only defaults. Each user can override the decomposer and generator
from the in-app account panel.

### 3.2 Install dependencies

```bash
# the repo is one Python workspace: the root project (api) depends on ./mixer
python -m venv .venv && source .venv/bin/activate
pip install -e ./mixer -e '.[dev]'
# with uv, the workspace resolves itself: uv sync

# frontend
cd frontend && npm install && cd ..
```

Installing the mixer pulls `numpy`, `scipy`, `soundfile`, and `librosa`. The code
still falls back to a NumPy-only path if `librosa` is ever absent, at reduced
quality.

### 3.3 Database

None. The SQLite file is created under `DATA_DIR` on first boot.

---

## 4. Running the stack

To run the whole thing in a container instead of the steps below — the closest
thing to how a self-hosted instance runs — see
[SELF_HOSTING.md](SELF_HOSTING.md#running-it-with-docker):

```bash
docker compose up -d      # http://localhost:8001
```

The rest of this section is the from-source workflow you want for development,
where the Vite dev server gives you HMR.


```bash
# 1. Generator: pick a host from generators/README.md — the quickest is to run
#    all cells in generators/colab/halcyon_generator.ipynb — and put the URL
#    it prints in GENERATOR_URL in .env

# 2. API
source .venv/bin/activate
uvicorn api.app.main:app --reload --port 8001

# 3. Frontend (dev only — production is served by the API)
cd frontend && npm run dev
```

Open the Vite URL, register an account, type a scene, and generate.

To run the way a self-hosted instance does, build the UI instead and open
<http://localhost:8001>:

```bash
cd frontend && npm run build && cd ..
uvicorn api.app.main:app --port 8001
```

---

## 5. Using the app

1. **Register / log in** (bearer token, stored in localStorage).
2. **Enter a prompt** — a scene, a mood, or a single sound ("rainy Kyoto garden
   at dusk", "cold and lonely", "a distant foghorn"). Abstract/emotional prompts
   are supported and translated to sonic qualities, not literal objects.
3. **Wait for generation** — the progress view polls until ready. This is the
   slow step (LLM + GPU audio generation).
4. **Mix live on the dashboard**:
   - Per-track **volume**, **EQ** (low/mid/high shelves at 200/1k/8k Hz),
     **pan** (−1..1), **depth** (reverb send, 0..1).
   - **Tuning** — global pitch shift (400–580 Hz, snaps every 6 Hz, presets
     432/440/528).
   - **Binaural beats** — overlaid sine pair (defaults 200/208 Hz, 10 presets).
   - **Animate** — slow autonomous drift of pan/volume/depth for a living mix.
   - **Export** — offline render of the current mix to a downloadable WAV.
5. **History** — reopen any previous atmosphere; edits persist server-side.
6. **Account** — save your generators and switch between them, and pick your LLM.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Generation fails after ~minutes | Stale or unreachable generator | Hit **Test** on it in the account page; for Colab, paste the new session URL |
| Generation fails immediately with a key error | No API key for the chosen provider | Add one in the account panel, or switch to a local Ollama model |
| Atmosphere failed with "interrupted by a server restart" | The API restarted mid-generation | Generate again; nothing is left stranded |
| Decomposition 422 | Model returned malformed/empty elements | Check model availability; try a clearer prompt or another model |
| 401 on every call | Token expired or revoked | Sign in again |
| Blank page at `:8001` | No `frontend/dist` build | `cd frontend && npm run build`, or use the dev server |
| No audio in browser | Autoplay blocked / worklet not served | Interact with the page first; ensure `public/soundtouch-processor.js` exists (`npm run copy-worklets`) |

---

## 7. Tests and quality

- **Python**: `pytest` from the repo root runs both suites (`api/tests`,
  `mixer/tests`); narrow with `pytest api/tests` or `pytest mixer/tests`
- **Frontend**: `cd frontend && npm run lint` and `npx tsc --noEmit`
- **Image**: `docker build -t halcyon .` — CI also boots it and checks `/health`
- **DSP**: see the [`mixer`](.claude/skills/mixer/SKILL.md) skill before changing
  anything under `mixer/mixer/`

CI runs all three on every push and pull request
(`.github/workflows/ci.yml`).

---

## 8. Experiments (thesis)

All research code lives under `experiments/`, one directory per experiment, with
run instructions in [`experiments/README.md`](experiments/README.md).

- `experiments/llm_eval/` — LLM decomposition benchmark (`run.py`, `score.py`,
  and its own `requirements.txt`).
- `experiments/spatial_model/` — learned spatial placement experiment
  (documented negative result; the shipped mixer uses the heuristic in
  `mixer/mixer/effects/spatial.py`).
