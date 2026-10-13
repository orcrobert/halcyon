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
| `DECOMPOSER_PROVIDER` | `gemini`, `ollama`, `openai`, `claude_cli`, or `codex_cli` |
| `DECOMPOSER_ALLOW_CLI` | `true` offers the two CLI providers; off by default |
| `DECOMPOSER_MODEL` | model id; blank uses the provider's default |
| `DECOMPOSER_BASE_URL` | endpoint; blank uses the provider's default |
| `DECOMPOSER_API_KEY` | key for the provider (not needed for local servers) |
| `GENERATOR_URL` | base URL of your generator (legacy alias: `COLAB_URL`) |
| `DATA_DIR` | SQLite database, generated audio, and the encryption key |
| `SECRET_KEY` | encrypts stored API keys; auto-generated if blank |
| `ALLOW_REGISTRATION` | set `false` to close signups once your users exist |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the administrator account; see [Managing users](#managing-users) |
| `FRONTEND_ORIGIN` | only for running the dev server against a remote API |
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | optional instance Modal token for deploying from the account page |
| `GENERATORS_DIR` | where `generators/` lives; set to `/app/generators` in the image |

Every decomposer value is an **instance default**. Each user can override the
provider, model, base URL, API key, and system prompt from their account page,
so one instance can serve people using different models.

The system prompt shipped in `api/prompts/decomposer.txt` is the default for
everyone. A user who edits it in the account page stores their own copy;
clearing the editor restores the shipped prompt, including later changes to it.

`GENERATOR_URL` is a fallback rather than a setting most users will touch. Each
user saves their own generators in the account page and switches between them
there; the instance value is only used by users who have saved none.

### Choosing a decomposer

| Provider | Use it for | Needs a key |
|----------|-----------|-------------|
| `gemini` | Google's API | yes |
| `ollama` | any local Ollama host | no |
| `openai` | any OpenAI-compatible `/chat/completions` endpoint — OpenAI, Groq, OpenRouter, Together, DeepSeek, vLLM, LM Studio, llama.cpp | usually |

| `claude_cli` | Claude Code installed on the server, using its login | no |
| `codex_cli` | Codex CLI installed on the server, using its login | no |

For a fully offline install, run Ollama and set `DECOMPOSER_PROVIDER=ollama`.

### Decomposing through a local CLI

On a personal machine or server you can skip API keys and let Claude Code or
Codex do the decomposition under the subscription they are logged in with. The
API runs the CLI once per request, non-interactively, in an empty temporary
directory: Claude Code with every tool disabled and no settings or MCP servers
loaded, Codex in its read-only sandbox.

The CLI providers are hidden until `DECOMPOSER_ALLOW_CLI=true`. Every user of
the instance then runs on the server's login, so leave it off on a shared
instance; a subscription login is meant for its owner, not for serving others.

The model field is passed straight through as `--model`. For Claude Code that
is an alias (`sonnet`, `opus`, `haiku`) or a full model id, defaulting to
`sonnet`; for Codex any model your account can use, defaulting to whatever
`~/.codex/config.toml` sets. A model the account cannot use fails the
generation with the CLI's own message.

**Logging in from the account page**: with Claude Code selected, the key
field becomes *Login token*. Run `claude setup-token` on any machine with a
browser and paste the result; it is stored encrypted like an API key and handed
to the CLI as `CLAUDE_CODE_OAUTH_TOKEN`. With Codex selected, the field takes an
OpenAI API key, handed over as `CODEX_API_KEY`. Leave it empty to use whatever
login the server's CLI already has.

**Running the API directly** (`uvicorn`): install the CLI, log in once as the
user that runs the API (`claude`, then `/login`; or `codex login`), and set
`DECOMPOSER_ALLOW_CLI=true`.

**Running in Docker**: build the `runtime-cli` target, which adds Node, Claude
Code and Codex to the image, and pass a login in:

```bash
claude setup-token
```

```bash
# .env
HALCYON_TARGET=runtime-cli
DECOMPOSER_ALLOW_CLI=true
CLAUDE_CODE_OAUTH_TOKEN=<token from setup-token>
```

```bash
docker compose up -d --build
```

Codex has no token variable; copy an existing login onto the data volume
instead, where the image points `CODEX_HOME`:

```bash
docker compose cp ~/.codex/auth.json halcyon:/data/cli/codex/auth.json
```

### Secrets

Per-user API keys are encrypted at rest with `SECRET_KEY`. Leave it blank and
one is generated into `DATA_DIR/secret.key` on first boot. Set it explicitly if
you want the same key across rebuilt containers:

```bash
openssl rand -hex 32
```

Losing the key does not lose atmospheres — only stored API keys, which users can
re-enter.

### Managing users

An instance you run for other people usually wants one administrator who hands
out accounts, rather than open signups:

```bash
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-long-first-password
ALLOW_REGISTRATION=false
```

On boot the account with `ADMIN_EMAIL` is made an administrator. If it does not
exist yet it is created with `ADMIN_PASSWORD`, which is read only that once;
change it in the app afterwards. Leave `ADMIN_PASSWORD` blank to promote an
account that already exists.

Administrators get a **Users** section in the account page. From there they
create accounts, change a user's name, email or password (a new password signs
them out everywhere), grant or remove admin access, and delete an account with
all of its soundscapes. Opening an account also shows its decomposer settings,
API key, Modal token and generators, so you can set someone up completely before
they first sign in. Stored keys stay write-only there too. An administrator
cannot remove their own admin access or delete their own account, so the
instance always keeps one.

With `ALLOW_REGISTRATION=false` the sign-in page drops its sign-up link and tells
visitors to ask their administrator.

---

## The generator contract

The API delegates all audio synthesis to whatever HTTP service `GENERATOR_URL`
points at. Implement this one endpoint and you can generate with anything — a
local AudioCraft server, a cloud GPU box, one of the hosts in `generators/`, or
a stub for testing.

**Request** — `POST {GENERATOR_URL}/generate`

```json
{
  "duration": 30,
  "elements": [
    { "index": 0, "label": "wind", "type": "sound", "prompt": "low desert wind, distant, soft", "duration": 4 },
    { "index": 1, "label": "drone", "type": "music", "prompt": "ambient drone, warm low sustained tone", "duration": 30 }
  ]
}
```

- `type` is `"sound"` (synthesize with AudioGen) or `"music"` (MusicGen).
- `prompt` is the text to generate from.
- `index` is the element's position in the request. Echo it back and the API
  matches your reply to the right layer no matter what order you answer in.
- The per-element `duration` is the seconds to generate for that element. Beds —
  stationary, noise-like material the browser loops — ask for a few seconds;
  one-shot events ask for about two; evolving layers ask for the length the user
  chose next to the prompt box. An event prompt describes a single occurrence
  ("single owl hoot, distant, soft"); the browser retriggers it, so do not
  generate a repeating version of it.
- The top-level `duration` is that user-chosen length (5–120) and is the
  fallback for elements that carry none.
- A generator that ignores both `duration` fields still works — it just always
  produces its own configured length.
- When the user attached a style clip, every `"music"` element also carries
  `style_b64`: a base64 mono WAV of 1.5–4.5 s. Generate that element with
  MusicGen-Style (`facebook/musicgen-style`) so it takes on the clip's sound.
  The excerpt is a reference, not a part of the output. A generator without a
  style model ignores the field and generates from the prompt alone.

**Response** — echo each element back with base64-encoded WAV bytes added:

```json
{
  "elements": [
    { "index": 0, "label": "wind", "type": "sound", "prompt": "...", "audio_b64": "<base64 WAV>" },
    { "index": 1, "label": "drone", "type": "music", "prompt": "...", "audio_b64": "<base64 WAV>" }
  ]
}
```

- `audio_b64` must be the base64 encoding of a complete WAV file.
- Do not echo `style_b64` back; it is only an input.
- Keep `index` (or at least `label`); the API matches replies by `index`, then
  by `label`, then by position. Elements that come back without `audio_b64` are
  dropped and the rest of the mix goes ahead.
- Batching by length pays off: generating four elements at 4 s costs far less
  than four at 30 s on an autoregressive model.
- A top-level `options` object may carry tuning for this request:
  `style_eval_q` (1–6) and `style_cfg_beta` for styled music. Ignore what you do
  not support.
- The API waits up to **300 s** per request, so a generator that honours long
  durations should still fit a whole batch inside that budget.
- There is no auth between the API and the generator by default — run the
  generator on a private network or add your own.

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
