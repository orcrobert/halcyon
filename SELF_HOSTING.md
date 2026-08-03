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
| API        | 8001 | FastAPI: accounts, persistence, generation, and the built UI | yes |
| Generator  | 9000 | Audio synthesis (AudioGen/MusicGen or equivalent) | yes — your own |
| Decomposer | — | Any local or cloud LLM (see below) | pick one |

One process serves everything the browser needs. The generator is separate
because it wants a GPU and may live on another host entirely.

During development the Vite dev server runs on 5173 and proxies `/api` to the
API, so dev and production behave identically and neither needs CORS.

---

## Prerequisites

- Docker and Docker Compose — **or**, to run from source, Python 3.11+ and
  Node.js 24+ with npm (the latter only to build the UI)
- A **decomposer**: an API key for any cloud LLM, or Ollama running locally
- A **generator**: a machine that can run Meta's AudioCraft (a CUDA GPU is
  strongly recommended) or any service that implements the generator contract

---

## Configuration

One env file at the repo root. Copy `.env.example` to `.env` and fill it in.
**OS environment variables always override the file**, which is what container
runtimes rely on.

| Variable | Purpose |
|----------|---------|
| `DECOMPOSER_PROVIDER` | `gemini`, `ollama`, or `openai` |
| `DECOMPOSER_MODEL` | model id; blank uses the provider's default |
| `DECOMPOSER_BASE_URL` | endpoint; blank uses the provider's default |
| `DECOMPOSER_API_KEY` | key for the provider (not needed for local servers) |
| `GENERATOR_URL` | base URL of your generator (legacy alias: `COLAB_URL`) |
| `DATA_DIR` | SQLite database, generated audio, and the encryption key |
| `SECRET_KEY` | encrypts stored API keys; auto-generated if blank |
| `ALLOW_REGISTRATION` | set `false` to close signups once your users exist |
| `FRONTEND_ORIGIN` | only for running the dev server against a remote API |

Every decomposer value is an **instance default**. Each user can override the
provider, model, base URL, and API key from their account page, so one instance
can serve people using different models.

`GENERATOR_URL` is a fallback rather than a setting most users will touch. Each
user saves their own generators in the account page and switches between them
there; the instance value is only used by users who have saved none.

### Choosing a decomposer

| Provider | Use it for | Needs a key |
|----------|-----------|-------------|
| `gemini` | Google's API | yes |
| `ollama` | any local Ollama host | no |
| `openai` | any OpenAI-compatible `/chat/completions` endpoint — OpenAI, Groq, OpenRouter, Together, DeepSeek, vLLM, LM Studio, llama.cpp | usually |

For a fully offline install, run Ollama and set `DECOMPOSER_PROVIDER=ollama`.

### Secrets

Per-user API keys are encrypted at rest with `SECRET_KEY`. Leave it blank and
one is generated into `DATA_DIR/secret.key` on first boot. Set it explicitly if
you want the same key across rebuilt containers:

```bash
openssl rand -hex 32
```

Losing the key does not lose atmospheres — only stored API keys, which users can
re-enter.

---

## The generator contract

The API delegates all audio synthesis to whatever HTTP service `GENERATOR_URL`
points at. Implement this one endpoint and you can generate with anything — a
local AudioCraft server, a cloud GPU box, one of the hosts in `generators/`, or
a stub for testing.

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
- Keep the other element fields; the API reads them back.
- The API waits up to **300 s** per request. There is no auth between the API
  and the generator by default — run the generator on a private network or add
  your own.

### Ready-made hosts

`generators/` contains working implementations of this contract, all built on
one shared package (`generators/core`), so they behave identically:

| Host | Cost | Setup |
|------|------|-------|
| `generators/local/` | free | `halcyon-generator serve` on your own GPU |
| `generators/colab/` | free tier | run the notebook, copy the ngrok URL |
| `generators/modal/` | per-second GPU, scales to zero | `modal deploy` |
| `generators/huggingface/` | paid GPU hardware, always on | `git subtree push` |

If you have a CUDA GPU, run it locally — it is the fastest and costs nothing.
Otherwise Modal is the sensible default for real use, and Colab is the quickest
way to see it working. [generators/README.md](generators/README.md) has a
quickstart for each.

---

## Running it from source

For development, or if you would rather not use containers. To run it with
Docker instead, skip to [Running it with Docker](#running-it-with-docker).

```bash
# 1. Config
cp .env.example .env
# fill in DECOMPOSER_* and GENERATOR_URL

# 2. Python: mixer (brings numpy/scipy/soundfile/librosa) + API deps
python -m venv .venv && source .venv/bin/activate
pip install -e ./mixer -e .

# 3. Build the UI
cd frontend && npm install && npm run build && cd ..

# 4. Run
uvicorn api.app.main:app --port 8001    # from the repo root
```

Open <http://localhost:8001>, register, and you are running. Plus your generator
on `GENERATOR_URL`.

The API imports the mixer from the repo tree, so keep `mixer/` alongside `api/`.
It serves `frontend/dist` at the root when that build exists; without it you get
the API only.

The database is created on first boot. There is no migration step and no queue
worker to remember.

---

## Running it with Docker

The shortest path to a running instance. You still need a generator and a
decomposer — the image contains neither.

```bash
cp .env.example .env
# fill in DECOMPOSER_* and GENERATOR_URL

docker compose up -d
```

Open <http://localhost:8001>. `docker compose logs -f` follows the API,
`docker compose down` stops it, and `docker compose up -d --build` rebuilds
after a code change.

### What you get

One container. A Node stage builds `frontend/dist`, a Python stage installs the
workspace into a venv, and the runtime stage carries only that venv, the built
UI, and `libsndfile1` — about 220 MB. It runs as an unprivileged user and
reports readiness on `/health`, so `docker compose ps` tells you the truth.

### Configuration

Compose reads the repo-root `.env` and passes each variable through, so the
table in [Configuration](#configuration) applies unchanged. Anything set in your
shell wins over `.env`, and both win over the image defaults.

Two variables are fixed by the image and should not be overridden:
`DATA_DIR=/data` and `FRONTEND_DIST=/app/frontend/dist`.

`HALCYON_PORT` (default `8001`) changes the host port only.

### State

Everything that must survive a rebuild lives in the `halcyon-data` volume
mounted at `/data`: the SQLite database, all generated audio, and `secret.key`.

Set `SECRET_KEY` explicitly if you want stored API keys to survive losing that
volume — otherwise a new key is generated on first boot and the old encrypted
keys become unreadable. Atmospheres are unaffected either way.

```bash
docker compose exec halcyon ls /data          # inspect
docker volume rm app_halcyon-data             # destroy, after `down`
```

### Reaching your generator

`GENERATOR_URL` defaults to `http://host.docker.internal:9000`, which resolves
to the host from inside the container — right for a generator running on the
same machine. For a generator elsewhere (a Colab/ngrok URL, another box), set
the URL and the value is used as-is.

The generator is deliberately not in the compose file: it wants a GPU, it is
often on another host, and it is yours to run. See
[The generator contract](#the-generator-contract).

### Without compose

```bash
docker build -t halcyon .
docker run -d --name halcyon \
  -p 8001:8001 \
  -v halcyon-data:/data \
  --read-only --tmpfs /tmp \
  -e GENERATOR_URL=http://your-generator:9000 \
  -e DECOMPOSER_PROVIDER=gemini \
  -e DECOMPOSER_API_KEY=... \
  halcyon
```

**`/tmp` must be writable.** The mixer's analysis goes through librosa, whose
numba-compiled helpers refuse to run when they cannot write a cache — the image
points `NUMBA_CACHE_DIR` at `/tmp/numba-cache` for this. Running `--read-only`
without a tmpfs at `/tmp` leaves the API healthy but fails every generation at
the mix stage.

### The generator container

Not shipped, for the reasons above. If you build one, it is the only GPU
container and the only piece that may live on a different host:

| Container | Base | Ports | Volumes | Wire-up |
|-----------|------|-------|---------|---------|
| generator | CUDA + python | 9000 | model weights cache | `GENERATOR_URL` |
