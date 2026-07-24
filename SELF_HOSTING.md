# Self-hosting Halcyon

Halcyon is designed to be run by whoever wants it, on their own hardware. This
document is the reference for standing it up yourself. For day-to-day dev
commands see [MANUAL.md](MANUAL.md); for architecture see
[.claude/docs/architecture.md](.claude/docs/architecture.md).

The heavy, GPU-bound part — audio generation — is **not** bundled as a hosted
service. You bring your own generator (see [The generator contract](#the-generator-contract)).
Everything else runs comfortably on a normal machine.

---

## Components and ports

| Service    | Default port | What it is | You must run it |
|------------|--------------|-----------|-----------------|
| Frontend   | 5173 | Vite/React UI | yes |
| Backend    | 8000 | Laravel API + queue worker | yes (two processes) |
| AI service | 8001 | FastAPI orchestration (decompose → generate → mix) | yes |
| Generator  | 9000 | Audio synthesis (AudioGen/MusicGen or equivalent) | yes — your own |
| Decomposer | — | Gemini API **or** local Ollama | pick one |

The four HTTP services talk to each other over these ports by default; every URL
is configurable via environment variables (below).

---

## Prerequisites

- PHP 8.2+ and Composer
- Node.js 20+ and npm
- Python 3.11+
- A **decomposer**: a Google Gemini API key (default), or Ollama running locally
  with `mistral` / `llama3.1:8b` pulled
- A **generator**: a machine that can run Meta's AudioCraft (a CUDA GPU is
  strongly recommended) or any service that implements the generator contract

---

## Configuration

Three env files, one per runtime. Copy each `*.example` and fill it in. **OS
environment variables always override these files**, which is what container
runtimes rely on.

### Root `.env` — AI service

| Variable | Purpose |
|----------|---------|
| `DECOMPOSER_MODEL` | `gemini` (default), `llama`, or `mistral` |
| `GEMINI_API_KEY` | required for the Gemini decomposer |
| `OLLAMA_URL` / `OLLAMA_MODEL` / `LLAMA_MODEL` | local Ollama fallback |
| `GENERATOR_URL` | base URL of your generator (legacy alias: `COLAB_URL`) |
| `AI_SERVICE_SECRET` | shared secret with the backend (must match) |
| `BACKEND_ORIGIN` | backend origin allowed by CORS (e.g. `http://localhost:8000`) |
| `OUTPUT_DIR` | writable dir for the audio cache |

### `backend/.env` — Laravel

Standard Laravel config plus:

| Variable | Purpose |
|----------|---------|
| `APP_KEY` | generate with `php artisan key:generate` |
| `DB_CONNECTION` | `sqlite` by default (self-contained) |
| `AI_SERVICE_URL` | base URL of the AI service (e.g. `http://localhost:8001`) |
| `AI_SERVICE_SECRET` | shared secret with the AI service (must match) |
| `SANCTUM_STATEFUL_DOMAINS` / `SESSION_DOMAIN` / `FRONTEND_URL` | the frontend origin, for cookie auth |
| `QUEUE_CONNECTION` | `database` by default — no Redis required |

### `frontend/.env.local` — Vite

| Variable | Purpose |
|----------|---------|
| `VITE_BACKEND_URL` | URL of the backend API (default `http://localhost:8000`) |
| `VITE_DEV_HOST` | optional custom dev-server host (e.g. behind a TLS proxy) |

### The shared secret

The backend authenticates to the AI service with a shared secret. Generate one
and put the **same** value in both `.env` (`AI_SERVICE_SECRET`) and
`backend/.env` (`AI_SERVICE_SECRET`):

```bash
openssl rand -hex 32
```

---

## The generator contract

The AI service delegates all audio synthesis to whatever HTTP service
`GENERATOR_URL` points at. Implement this one endpoint and you can generate with
anything — a local AudioCraft server, a cloud GPU box, the bundled Colab
notebook, or a stub for testing.

**Request** — `POST {GENERATOR_URL}/generate`

```json
{
  "elements": [
    { "label": "wind", "type": "sound", "prompt": "low desert wind, distant, soft" },
    { "label": "drone", "type": "music", "prompt": "ambient drone, warm low sustained tone" }
  ]
}
```

- `type` is `"sound"` (synthesize with AudioGen) or `"music"` (MusicGen).
- `prompt` is the text to generate from.

**Response** — echo each element back with base64-encoded WAV bytes added:

```json
{
  "elements": [
    { "label": "wind", "type": "sound", "prompt": "...", "audio_b64": "<base64 WAV>" },
    { "label": "drone", "type": "music", "prompt": "...", "audio_b64": "<base64 WAV>" }
  ]
}
```

- `audio_b64` must be the base64 encoding of a complete WAV file.
- Keep the other element fields; the AI service reads them back.
- The AI service waits up to **300 s** per request. There is no auth between the
  AI service and the generator by default — run the generator on a private
  network or add your own.

`colab/soundscape_generator.ipynb` is a working reference implementation
(AudioCraft on a Colab GPU, exposed via ngrok).

---

## Running it

```bash
# 1. Config
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# fill in GEMINI_API_KEY, GENERATOR_URL, and a shared AI_SERVICE_SECRET

# 2. Python: mixer (brings numpy/scipy/soundfile/librosa) + AI service deps
python -m venv .venv && source .venv/bin/activate
pip install -e ./mixer
pip install -e ./ai

# 3. Backend
cd backend && composer install && php artisan key:generate && php artisan migrate && cd ..

# 4. Frontend
cd frontend && npm install && cd ..
```

Then start the four services (the AI service and generator should be up before
you submit a prompt):

```bash
uvicorn ai.app.main:app --port 8001          # from the repo root
cd backend && php artisan serve               # :8000
cd backend && php artisan queue:work          # separate process — required
cd frontend && npm run dev                    # :5173
# plus your generator on GENERATOR_URL
```

The AI service imports the mixer from the repo tree, so keep `mixer/` alongside
`ai/`.

---

## Preparing to containerize

Everything above is arranged so containerization is a fill-in-the-blanks step.
Dockerfiles and compose are intentionally **not** included yet; this is the map
for when they are:

| Container | Base | Build/run | Ports | Volumes / state | Key env |
|-----------|------|-----------|-------|-----------------|---------|
| frontend | node → static | `npm run build`, serve `dist/` | 5173/80 | — | `VITE_BACKEND_URL` |
| backend  | php-fpm + nginx | `composer install`, `artisan migrate` | 8000 | `database/` (sqlite), `storage/` | `APP_KEY`, `AI_SERVICE_*`, sanctum domains |
| worker   | same image as backend | `artisan queue:work` | — | shares backend storage/db | same as backend |
| ai       | python:3.11-slim | `pip install ./mixer ./ai`, `uvicorn ai.app.main:app` | 8001 | `OUTPUT_DIR` (writable) | `GENERATOR_URL`, `AI_SERVICE_SECRET`, `BACKEND_ORIGIN`, decomposer vars |
| generator| CUDA + python | your AudioCraft server | 9000 | model weights cache | — |

Notes for that phase:
- The **worker is a separate container** from the API, sharing the same image,
  database, and storage volume.
- SQLite keeps state in a file — mount `backend/database` and `backend/storage`
  as volumes, or switch `DB_CONNECTION` to Postgres/MySQL.
- The AI service container must include **both** `ai/` and `mixer/`.
- `OUTPUT_DIR` is written on every generation — back it with a writable volume or
  make it ephemeral.
- The generator is the only GPU container and the only piece that may live on a
  different host; wire it in via `GENERATOR_URL`.
- Startup order / healthchecks: generator and AI service ready before the worker
  processes a job; backend migrated before it accepts traffic.
