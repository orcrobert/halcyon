# Manual — Halcyon

How to set up, run, and operate the whole stack locally. For architecture and
contribution rules see [CLAUDE.md](CLAUDE.md) and [`.claude/docs/`](.claude/docs/).

---

## 1. What you are running

Four services cooperate:

| Service   | Port (default) | Command |
|-----------|----------------|---------|
| Frontend  | 5173           | `npm run dev` (Vite) |
| Backend   | 8000           | `php artisan serve` + `php artisan queue:work` |
| AI service| 8001           | `uvicorn ai.app.main:app --port 8001` |
| Generator | 9000 (yours)   | your own; reference: `colab/soundscape_generator.ipynb` |

The AI service runs on a different port from the backend (8001 vs 8000). For a
custom dev domain (Herd/Valet), set `VITE_DEV_HOST` and the backend sanctum
domains accordingly. See [SELF_HOSTING.md](SELF_HOSTING.md) to run your own
instance.

---

## 2. Prerequisites

- Node.js 20+ and npm
- PHP 8.2+ and Composer
- Python 3.11+ (a virtualenv is recommended)
- A Google Gemini API key (default decomposer), **or** Ollama running locally
  with `mistral` / `llama3.1:8b` pulled (offline fallback)
- A Google account for Colab (GPU generator) — or any host that exposes the
  generator `POST /generate` contract

---

## 3. First-time setup

### 3.1 Environment file

Copy the example and fill it in. The AI service reads the **repo-root** `.env`
(`ai/app/config.py` points there):

```bash
cp .env.example .env
```

Key variables:

| Variable            | Meaning |
|---------------------|---------|
| `DECOMPOSER_MODEL`  | `gemini` (default), `llama`, or `mistral` |
| `GEMINI_API_KEY`    | required when `DECOMPOSER_MODEL=gemini` |
| `OLLAMA_URL` / `OLLAMA_MODEL` / `LLAMA_MODEL` | Ollama fallback config |
| `GENERATOR_URL`     | base URL of your generator (legacy alias: `COLAB_URL`) |
| `AI_SERVICE_SECRET` | shared secret between Laravel and the AI service (must be non-empty) |
| `BACKEND_ORIGIN`    | origin allowed by the AI service CORS policy |

The backend has its own `backend/.env` (Laravel). Set `AI_SERVICE_URL` and
`AI_SERVICE_SECRET` there to match (`config/services.php` reads them).

### 3.2 Install dependencies

```bash
# frontend
cd frontend && npm install && cd ..

# backend
cd backend && composer install && cp .env.example .env && php artisan key:generate && cd ..

# ai + mixer (editable installs into your venv; mixer first — ai imports it)
python -m venv .venv && source .venv/bin/activate
pip install -e ./mixer -e ./ai
```

Installing the mixer pulls `numpy`, `scipy`, `soundfile`, and `librosa`. The code
still falls back to a NumPy-only path if `librosa` is ever absent, at reduced
quality.

### 3.3 Database

Laravel uses SQLite by default (`backend/database/database.sqlite`):

```bash
cd backend
touch database/database.sqlite   # if missing
php artisan migrate
```

---

## 4. Running the stack

Open four terminals (order matters a little — the worker and AI service should be
up before you submit a prompt):

```bash
# 1. Generator: start your own (see SELF_HOSTING.md) or run all cells in
#    colab/soundscape_generator.ipynb and put its URL in GENERATOR_URL in .env

# 2. AI service
source .venv/bin/activate
uvicorn ai.app.main:app --reload --port 8001

# 3. Backend API + queue worker (two processes)
cd backend
php artisan serve            # terminal 3a
php artisan queue:work       # terminal 3b  ← generation does nothing without this

# 4. Frontend
cd frontend && npm run dev
```

Open the Vite URL, register an account, type a scene, and generate.

---

## 5. Using the app

1. **Register / log in** (Sanctum session auth).
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

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Atmosphere stuck on `pending` | No queue worker | Start `php artisan queue:work` |
| Generation fails after ~minutes | Stale/down `GENERATOR_URL` | Restart your generator, update `GENERATOR_URL`, restart AI service |
| Every AI request returns 500 | `AI_SERVICE_SECRET` unset | Set it in `.env` and `backend/.env` (must match) |
| AI request returns 401 | Secret mismatch | Align `AI_SERVICE_SECRET` on both sides |
| Decomposition 422 | Model returned malformed/empty elements | Check model availability; try a clearer prompt or switch `DECOMPOSER_MODEL` |
| CORS error in browser | `BACKEND_ORIGIN` / Sanctum `stateful` domains wrong | Match frontend origin in AI + Laravel config |
| No audio in browser | Autoplay blocked / worklet not served | Interact with the page first; ensure `public/soundtouch-processor.js` exists (`npm run copy-worklets`) |
| 419 on API calls | Missing CSRF cookie | The client auto-retries after `sanctum/csrf-cookie`; ensure cookies aren't blocked |

---

## 7. Tests and quality

- **Backend**: `cd backend && php artisan test`
- **Frontend**: `cd frontend && npm run lint`
- **Mixer**: `pytest` (see the [`mixer`](.claude/skills/mixer/SKILL.md) skill;
  coverage is a known gap tracked in [`.claude/AUDIT.md`](.claude/AUDIT.md))

---

## 8. Experiments (thesis)

- `experiments/llm_eval/` — LLM decomposition benchmark. See its `requirements.txt`
  and the `scripts/run_llm_eval.py` / `scripts/score_llm_eval.py` CLIs.
- `pan_model/` + `notebooks/train_spatial_model.ipynb` — learned spatial
  placement experiment (documented negative result; the shipped mixer uses the
  heuristic in `mixer/mixer/effects/spatial.py`).
