# Self-hosting Halcyon

The reference for running Halcyon yourself: configuration, Docker, image tags
and versions, updates, backups, language models through a CLI, and the contract
a generator must follow. For the short version see [README.md](README.md); for
development from source see [MANUAL.md](MANUAL.md); for architecture see
[.claude/docs/architecture.md](.claude/docs/architecture.md).

- [Components and ports](#components-and-ports)
- [First run](#first-run)
- [Configuration](#configuration)
- [Language models through a CLI](#language-models-through-a-cli)
- [Running it with Docker](#running-it-with-docker)
- [Versions, tags and releases](#versions-tags-and-releases)
- [Updates](#updates)
- [Backups](#backups)
- [Running it from source](#running-it-from-source)
- [The generator contract](#the-generator-contract)

The heavy, GPU-bound part, audio generation, is **not** bundled. You bring your
own generator (see [The generator contract](#the-generator-contract)).
Everything else runs comfortably on a normal machine, `linux/amd64` or
`linux/arm64`.

---

## Components and ports

| Service    | Default port | What it is | You must run it |
|------------|--------------|-----------|-----------------|
| API        | 8001 | FastAPI: accounts, persistence, generation, updates, and the built UI | yes |
| Generator  | 9000 | Audio synthesis (AudioGen/MusicGen or equivalent) | yes, your own |
| Decomposer | — | Any cloud or local LLM, or a CLI on the server | pick one |
| Updater    | 8080 (internal) | Optional Watchtower sidecar for one-click updates | no |

One process serves everything the browser needs. Generation runs on a worker
thread inside it; there is no queue or second process. The generator is
separate because it wants a GPU and may live on another host entirely.

During development the Vite dev server runs on 5173 and proxies `/api` to the
API, so dev and production behave identically and neither needs CORS.

---

## First run

1. **Start Halcyon.** `docker compose up -d` with the
   [`compose.yaml`](compose.yaml) from this repo (details in
   [Running it with Docker](#running-it-with-docker)), or
   [from source](#running-it-from-source).
2. **Create the first account** at <http://localhost:8001>. It becomes the
   administrator. On a public server, do this before the domain resolves (see
   [On a public server](#on-a-public-server)).
3. **Pick a language model** under **Account → Language model**: a Gemini key,
   an Ollama host, any OpenAI-compatible API, or a
   [CLI](#language-models-through-a-cli).
4. **Add a generator** under **Account → Audio generator**: deploy one to Modal
   from that page, paste a Colab URL, or point it at your own GPU. Press
   **Test** to confirm it answers.
5. **Generate.** Describe a scene on the main screen. The loading screen says
   what each stage is doing; a cold generator shows up as *waking*.

No step needs a file edit or restart. Everything in
[Configuration](#configuration) only sets instance-wide defaults and limits.

---

## Configuration

All configuration is environment variables. From source, the API reads the
repo-root `.env` (copy [`.env.example`](.env.example)); in Docker, compose reads
the `.env` next to `compose.yaml`. **Real environment variables always override
the file.** None are required.

### API variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DECOMPOSER_PROVIDER` | `gemini` | `gemini`, `ollama`, `openai`, `claude_cli` or `codex_cli` |
| `DECOMPOSER_MODEL` | provider's default | model id; see [Choosing a decomposer](#choosing-a-decomposer) |
| `DECOMPOSER_BASE_URL` | provider's default | endpoint for `ollama` and `openai` |
| `DECOMPOSER_API_KEY` | — | key for the provider (legacy alias `GEMINI_API_KEY`) |
| `DECOMPOSER_ALLOW_CLI` | `false` | `true` offers `claude_cli` and `codex_cli`; see [Language models through a CLI](#language-models-through-a-cli) |
| `GENERATOR_URL` | `http://localhost:9000` (`http://host.docker.internal:9000` in compose) | fallback generator for users who saved none (legacy alias `COLAB_URL`) |
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | — | instance Modal token, so users without their own can deploy Modal generators |
| `DATA_DIR` | `data` (`/data` in the image) | SQLite database, generated audio, style clips, `secret.key`, CLI logins |
| `SECRET_KEY` | generated into `DATA_DIR/secret.key` | encrypts stored API keys and tokens; see [Secrets](#secrets) |
| `ALLOW_REGISTRATION` | `true` | `false` closes signups; see [Managing users](#managing-users) |
| `FRONTEND_DIST` | `frontend/dist` (`/app/frontend/dist` in the image) | built UI served at `/`; without one the API serves only `/api` |
| `FRONTEND_ORIGIN` | — | only for running the dev server against a remote API (enables CORS for that origin) |
| `GENERATORS_DIR` | `generators` (`/app/generators` in the image) | where `modal/deploy.py` lives, for deploys from the account page |
| `HALCYON_TAG` | `latest` | the image tag this instance tracks; decides which releases the updater offers |
| `HALCYON_VERSION` | `dev` | set by the image build; never set it yourself. `dev` never offers updates |
| `UPDATER_URL` | `http://updater:8080` | where the updater sidecar listens |
| `UPDATER_TOKEN_FILE` | `/updater/token` | token shared with the updater; Halcyon writes it on boot |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | instance-wide Claude Code login, read by the CLI itself (Docker) |
| `CODEX_API_KEY` | — | instance-wide Codex key, read by the CLI itself (Docker) |

In the image, `DATA_DIR`, `FRONTEND_DIST` and `GENERATORS_DIR` are fixed by
`compose.yaml`, so a `.env` copied from a source checkout cannot move them.

An old `.env` with `DECOMPOSER_MODEL=gemini`, `llama` or `mistral` (provider
names, from before providers existed) is still read: it is migrated on boot to
the matching provider with a warning in the log.

### Compose variables

Read by `docker compose` itself, from the `.env` next to `compose.yaml`:

| Variable | Default | Effect |
|----------|---------|--------|
| `HALCYON_TAG` | `latest` | which published image to run; see [Image tags](#image-tags) |
| `HALCYON_PORT` | `8001` | host port, bound to `127.0.0.1` only |
| `HALCYON_TARGET` | `runtime` | Dockerfile target `compose.build.yaml` builds (`runtime-cli` for the CLI image) |
| `COMPOSE_PROFILES` | — | `updates` also starts the updater sidecar |

### Generator variables

Read by the generator, never by the API: `AUDIOGEN_MODEL`, `MUSICGEN_MODEL`,
`STYLE_MODEL`, `GENERATION_DURATION` and friends, plus `HALCYON_MODAL_GPU` and
`HALCYON_MODAL_SCALEDOWN` for `modal deploy`. They are listed in
[generators/README.md](generators/README.md#configuration). `.env.example`
carries the Modal ones because `generators/modal/deploy.py` reads the repo-root
`.env` when deployed from a terminal.

### Instance defaults and per-user settings

Every decomposer value is an **instance default**. Each user can override the
provider, model, base URL, API key and system prompt from their account page, so
one instance can serve people using different models. Switching provider drops
the instance key, so one provider's key is never sent to another.

The system prompt shipped in `api/prompts/decomposer.txt` is the default for
everyone. A user who edits it in the account page stores their own copy;
clearing the editor restores the shipped prompt, including later changes to it.

`GENERATOR_URL` is a fallback rather than a setting most users touch. Each user
saves their own generators in the account page and switches between them there;
the instance value is only used by users who have saved none.

### Choosing a decomposer

| Provider | Use it for | Default model | Needs a key |
|----------|-----------|---------------|-------------|
| `gemini` | Google's API ([free key](https://aistudio.google.com/apikey)) | `gemini-2.5-flash-lite` | yes |
| `ollama` | any Ollama host (`http://localhost:11434`) | `mistral` | no |
| `openai` | any OpenAI-compatible `/chat/completions` endpoint: OpenAI, Groq, OpenRouter, Together, DeepSeek, vLLM, LM Studio, llama.cpp | `gpt-4o-mini` | usually |
| `claude_cli` | Claude Code on the server, under its login | `sonnet` | no |
| `codex_cli` | Codex CLI on the server, under its login | the CLI's own default | no |

For a fully offline install, run Ollama and set `DECOMPOSER_PROVIDER=ollama`.
In Docker, an Ollama on the same host is `http://host.docker.internal:11434`.
Small models break the output schema more often; the comparison is in
[experiments/llm_eval](experiments/README.md).

### Secrets

Per-user API keys, CLI tokens and Modal tokens are encrypted at rest with
`SECRET_KEY` and never returned by the API. Leave it blank and one is generated
into `DATA_DIR/secret.key` on first boot. Set it explicitly to keep the same key
across lost volumes or moved databases:

```bash
openssl rand -hex 32
```

Losing the key does not lose soundscapes, only stored keys, which users can
re-enter.

### Managing users

The first account created on a server is its administrator. On a server that
already has accounts, the oldest one is made administrator on the next boot if
none exists yet. To hand out accounts yourself instead of leaving signups open,
set `ALLOW_REGISTRATION=false`: the very first account can still register, so a
fresh server is never locked out, and everyone after that is created by an
administrator.

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

## Language models through a CLI

Instead of an API key, Halcyon can decompose prompts with **Claude Code** or the
**Codex CLI** installed on the server, under the subscription or key they are
logged in with. It suits a personal instance where you already pay for one of
them.

### What runs

The API runs the CLI once per prompt, non-interactively, in an empty temporary
directory. Claude Code gets the system prompt as `--system-prompt` and the scene
on stdin; Codex gets both on stdin:

| Provider | Command |
|----------|---------|
| `claude_cli` | `claude -p --model <model> --system-prompt <prompt> --tools "" --output-format json --no-session-persistence --setting-sources "" --strict-mcp-config` |
| `codex_cli` | `codex exec --skip-git-repo-check --sandbox read-only --color never [--model <model>] --output-last-message <file> -` |

Claude Code runs with every tool disabled and no settings, sessions or MCP
servers loaded; Codex runs in its read-only sandbox. A call that takes longer
than 240 s fails the generation. Layer regeneration with a note and the LLM
revision in layer review go through the same command.

### Who it runs as

**Every user of the instance runs on the server's login**, unless they paste
their own token on the account page. That is why the CLI providers are hidden
until `DECOMPOSER_ALLOW_CLI=true`. Leave it off on a shared instance: a
subscription login is meant for its owner, not for serving others.

### Set it up in Docker

The standard image has no Node and no CLIs. Run the `-cli` variant of the same
release (see [Image tags](#image-tags)), which adds Node, Claude Code and Codex
and keeps their state on the data volume (`/data/cli/claude`,
`/data/cli/codex`).

1. In the `.env` next to `compose.yaml`:

   ```bash
   HALCYON_TAG=latest-cli
   DECOMPOSER_ALLOW_CLI=true
   ```

2. Give it a login, either instance-wide here or per user later (see
   [Logging in](#logging-in)). For Claude Code, on any machine with a browser:

   ```bash
   claude setup-token
   ```

   ```bash
   # .env
   CLAUDE_CODE_OAUTH_TOKEN=<token from setup-token>
   ```

3. Recreate the container and check the CLIs are there and logged in:

   ```bash
   docker compose up -d
   docker compose exec halcyon claude --version
   docker compose exec halcyon codex --version
   docker compose exec halcyon claude -p "Reply with OK"
   ```

4. In the app, **Account → Language model**, choose **Claude Code (local CLI)**
   or **Codex (local CLI)**. To make it the default for every user instead, set
   `DECOMPOSER_PROVIDER=claude_cli` (or `codex_cli`) in `.env`.

To build the CLI image from a checkout instead, set `HALCYON_TARGET=runtime-cli`
and use [`compose.build.yaml`](#building-the-image).

### Set it up from source

1. Install the CLI with npm for the user that runs the API:

   ```bash
   npm install -g @anthropic-ai/claude-code
   npm install -g @openai/codex
   ```

2. Log it in as that user, once: `claude` then `/login`, or `codex login`.
3. Set `DECOMPOSER_ALLOW_CLI=true` in the repo-root `.env` and restart the API.
4. Pick the provider in **Account → Language model**.

The repo-root `.env` is read by the API's settings, not exported to the
processes it starts, so `CLAUDE_CODE_OAUTH_TOKEN` or `CODEX_API_KEY` written
there does not reach the CLI. Export it in the shell that starts `uvicorn`, log
the CLI in, paste the token on the account page, or put it in
`DECOMPOSER_API_KEY` (see [Logging in](#logging-in)).

### Logging in

| CLI | Per user (account page) | Instance-wide | Server's own login |
|-----|-------------------------|---------------|--------------------|
| Claude Code | **Login token** field: paste the output of `claude setup-token` | `CLAUDE_CODE_OAUTH_TOKEN` in the environment | `claude` → `/login` as the API user |
| Codex | key field: an OpenAI API key | `CODEX_API_KEY` in the environment | `codex login` as the API user, or a copied `auth.json` |

A key pasted on the account page is stored encrypted like any API key and set
as `CLAUDE_CODE_OAUTH_TOKEN` or `CODEX_API_KEY` for that user's runs only. Left
empty, the CLI falls back to the instance variable or its own stored login.

`DECOMPOSER_API_KEY` counts as a pasted key. With `DECOMPOSER_PROVIDER` set to a
CLI provider, the instance key is handed to the CLI the same way for every user
who has not chosen another provider, which makes it a second way to set an
instance-wide token, from source as well as in Docker. A leftover key for
another provider (a Gemini key, say) is sent as the login and every run fails;
clear it when you switch.

Codex has no token command for a ChatGPT subscription login. To use one in
Docker, copy an existing login onto the data volume through the container, so
the file belongs to the container's user:

```bash
docker compose exec -T halcyon sh -c 'cat > "$CODEX_HOME/auth.json" && chmod 600 "$CODEX_HOME/auth.json"' < ~/.codex/auth.json
```

Do not use `docker compose cp` for this: it writes the file as root with your
local permissions, and the unprivileged container user cannot read it.

### Models

The model field is passed straight through as `--model`.

- **Claude Code:** an alias (`sonnet`, `opus`, `haiku`, `fable`) or a full
  model id. Blank means `sonnet`.
- **Codex:** any model the account can use. Blank leaves the flag out, so the
  CLI's own default (or `model` in its `config.toml`) applies.

A model the account cannot use fails the generation with the CLI's own message.

### When it fails

The failed atmosphere carries the reason:

| Message | Fix |
|---------|-----|
| *… is disabled on this server. Set DECOMPOSER_ALLOW_CLI=true …* | set it and recreate the container or restart the API |
| *… needs the `claude` (or `codex`) command on the server's PATH* | you run the standard image; switch `HALCYON_TAG` to a `-cli` tag. From source, install the CLI for the API's user |
| *… did not answer within 240s* | the CLI hung or is rate-limited; try a faster model |
| *… failed: <CLI output>* | read the CLI's message: usually an expired login or a model the account cannot use |

---

## Running it with Docker

The shortest path to a running instance. [`compose.yaml`](compose.yaml) runs the
published image and needs nothing else from the repo, so it can be copied onto
any server or pasted into a stack manager such as Dockge or Portainer:

```bash
mkdir halcyon && cd halcyon
curl -fsSLO https://raw.githubusercontent.com/orcrobert/halcyon/main/compose.yaml
docker compose up -d
```

Open <http://localhost:8001> and register; the first account is the
administrator.

| Task | Command |
|------|---------|
| Status and health | `docker compose ps` |
| Follow the logs | `docker compose logs -f halcyon` |
| Running version | `curl -s localhost:8001/health` → `{"status":"ok","version":"X.Y.Z"}` |
| Update to the newest release in your tag | `docker compose pull && docker compose up -d` |
| Start the updater | `COMPOSE_PROFILES=updates` in `.env`, then `docker compose up -d` |
| Apply a changed `.env` | `docker compose up -d` (recreates the container) |
| Shell inside | `docker compose exec halcyon sh` |
| Stop | `docker compose down` (keeps the volumes) |

Put any variable from [Configuration](#configuration) in a `.env` next to
`compose.yaml` (in Dockge, the stack's env editor). The container reads it on
the next `docker compose up -d`; without one it runs on the image defaults.
`docker compose restart` does not re-read it.

### What you get

One container. A Node stage builds `frontend/dist`, a Python stage installs the
workspace into a venv, and the runtime stage carries only that venv, the built
UI, `libsndfile1`, `generators/core` and `generators/modal/deploy.py` (so the
API can run `modal deploy`). The `-cli` target adds Node, Claude Code and Codex.

It runs as an unprivileged user (uid 1000) on a read-only root filesystem with
`no-new-privileges`, and reports readiness on `/health`, so `docker compose ps`
tells you the truth.

### State

Everything that must survive a rebuild lives in the `halcyon-data` volume
mounted at `/data`:

| Path | Contents |
|------|----------|
| `/data/halcyon.db` | the SQLite database: accounts, settings, soundscapes, mixes |
| `/data/audio/<atmosphere>/` | generated layers as WAV |
| `/data/styles/` | style clips attached to soundscapes |
| `/data/secret.key` | the generated encryption key, unless `SECRET_KEY` is set |
| `/data/cli/` | Claude Code and Codex state, in the `-cli` image |

The small `updater-token` volume holds only the updater's token. Compose names
volumes after the project folder, so on disk they are
`<folder>_halcyon-data` and `<folder>_updater-token`
(`docker volume ls | grep halcyon`). See [Backups](#backups).

### Reaching your generator

`GENERATOR_URL` defaults to `http://host.docker.internal:9000`, which resolves
to the host from inside the container. That is right for a generator running on
the same machine, and the address to give a **Local machine** generator on the
account page. `localhost` inside the container is the container itself, so a
`GENERATOR_URL=http://localhost:9000` line in `.env` (left over from running
from source) breaks the fallback; remove it. For a generator elsewhere (Modal, Colab/ngrok, another box), use its URL as-is.

The generator is deliberately not in the compose file: it wants a GPU, it is
often on another host, and it is yours to run.

### Building the image

From a checkout, [`compose.build.yaml`](compose.build.yaml) adds a local build
on top of `compose.yaml`. Use it to run unreleased code:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
HALCYON_TARGET=runtime-cli docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

A local build reports version `dev` and never offers updates. Pass
`--build-arg HALCYON_VERSION=<x.y.z>` to `docker build` to stamp one.

### On a public server

The API speaks plain HTTP and sends a bearer token on every request, so it
needs TLS in front of it. Keep the loopback binding and run a reverse proxy on
the host. With Caddy, which fetches the certificate itself:

```
halcyon.example.com {
    reverse_proxy 127.0.0.1:8001
}
```

Do not publish the port on `0.0.0.0` instead: Docker writes its own firewall
rules, so a published port is open even when `ufw` says it is not.

Register your own account before the domain resolves, or over an SSH tunnel
(`ssh -L 8001:127.0.0.1:8001 your-server`), because the first account becomes
the administrator. Then set `ALLOW_REGISTRATION=false` and create the other
accounts from the Users section; see [Managing users](#managing-users).

The interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are not served.

### Without compose

```bash
docker run -d --name halcyon \
  -p 127.0.0.1:8001:8001 \
  -v halcyon-data:/data \
  --read-only --tmpfs /tmp \
  --add-host host.docker.internal:host-gateway \
  -e GENERATOR_URL=http://host.docker.internal:9000 \
  --restart unless-stopped \
  ghcr.io/orcrobert/halcyon:latest
```

Pass instance defaults with `-e`, for example `-e ALLOW_REGISTRATION=false`, and
set `-e HALCYON_TAG=<tag>` to the tag you run so the app compares against the
right line. The updater needs compose. To update, `docker pull` the tag,
`docker rm -f halcyon` and run the same command again.

**`/tmp` must be writable.** The mixer's analysis goes through librosa, whose
numba-compiled helpers refuse to run when they cannot write a cache; the image
points `NUMBA_CACHE_DIR` at `/tmp/numba-cache` for this. Running `--read-only`
without a tmpfs at `/tmp` leaves the API healthy but fails every generation at
the mix stage.

---

## Versions, tags and releases

Halcyon uses semantic versions (`MAJOR.MINOR.PATCH`), and a version exists only
as a git tag. Each `vX.Y.Z` tag on `main` is a release: a GitHub release with
notes, two images and the mixer wheel. The list is on the
[releases page](https://github.com/orcrobert/halcyon/releases), or:

```bash
gh release list -R orcrobert/halcyon
git ls-remote --tags https://github.com/orcrobert/halcyon 'v*'
```

### Image tags

Every release pushes `ghcr.io/orcrobert/halcyon` for `linux/amd64` and
`linux/arm64`. Release `vX.Y.Z` gets these tags:

| Tag | Standard image | CLI image | Moves when |
|-----|----------------|-----------|-----------|
| latest | `latest` | `latest-cli` | any new release, including a new major |
| minor line | `X.Y` | `X.Y-cli` | a new `X.Y.*` patch |
| exact | `X.Y.Z` | `X.Y.Z-cli` | never |

There is no major-only tag (`X`), no `v` prefix on image tags, and no image for
unreleased commits on `main`; build those yourself
([Building the image](#building-the-image)). All tags are on the
[package page](https://github.com/orcrobert/halcyon/pkgs/container/halcyon).

Set the tag with `HALCYON_TAG` in `.env`. It picks the image and also tells the
running app which line it is on, which decides what the updater offers:

| `HALCYON_TAG` | Use it when |
|---------------|-------------|
| `latest` | you want every release; automatic updates still stop before a new major |
| `X.Y` | you want the patches of this line and nothing newer; releases are cut only from `main` and never backported, so once the next minor ships, `X.Y` stops moving |
| `X.Y.Z` | the server must not change until you change this line |

Add `-cli` to any of them for the image with Claude Code and Codex.

### Moving to a version, or back

```bash
# .env, with any exact version from the releases page
HALCYON_TAG=X.Y.Z
```

```bash
docker compose pull && docker compose up -d
```

The same works forward. Database changes only ever add tables and nullable
columns, which an older image ignores, so going back a release keeps your data;
[take a backup](#backups) first anyway, and read the release notes of every
major version you cross.

From source, check out the tag instead: `git checkout vX.Y.Z`, then reinstall
and rebuild as in [Running it from source](#running-it-from-source). A source
install reports version `dev` and never offers updates.

### How releases are made

A merge to `main` releases itself once CI passes. The `Release` workflow reads
the messages of every commit since the last `v*` tag: a `!` after the type
(`feat!:`) or a `BREAKING CHANGE:` footer bumps the major version, any `feat:`
the minor, any `fix:` the patch. A merge with only `chore`, `docs`, `refactor`
or `test` commits releases nothing. The full commit policy is in
[git-workflow.md](.claude/docs/git-workflow.md).

A release tags the merge commit, builds both image targets with the version
baked in (`HALCYON_VERSION`), and creates a GitHub release with generated notes
and the `halcyon-mixer` wheel and sdist attached:

```bash
gh release download -R orcrobert/halcyon --pattern '*.whl'
pip install halcyon_mixer-*.whl
```

Put a tag after `download` (`gh release download vX.Y.Z …`) for a specific
release instead of the newest.

The release stamps the version into `mixer/pyproject.toml` for the wheel; the
other `pyproject.toml` files keep a placeholder version, and none is bumped by
hand. Tags are never created by hand either: the workflow owns them.

---

## Updates

A running container stays on the image it started from until it is replaced.
Every image knows its own version (`/health` reports it), and the administrator's
**Account → Updates** compares it with the newest GitHub release (checked every
six hours, or on demand), shows the release notes, and raises a notice in the
app when a newer one is out.

### By hand

```bash
docker compose pull && docker compose up -d
```

`pull` fetches the newest image for your `HALCYON_TAG`; an exact tag never
changes. It does not refresh `compose.yaml` itself. A server set up before a
compose change (such as the updater) needs the current file first:

```bash
curl -fsSLO https://raw.githubusercontent.com/orcrobert/halcyon/main/compose.yaml
```

### From the app

Turn on the optional updater in the `.env` next to `compose.yaml` and bring the
stack up again:

```bash
# .env
COMPOSE_PROFILES=updates
```

```bash
docker compose up -d
```

It is a [Watchtower](https://github.com/nicholas-fedor/watchtower) container,
the only one with the Docker socket. It never polls on its own and only touches
the container labelled for it. Halcyon writes a random token into the shared
`updater-token` volume on first boot and calls the updater with it, so there is
nothing to configure. With it running, Account → Updates gets an
**Update to X.Y.Z** button and an **Install updates automatically** switch.
`docker compose --profile updates up -d`, which the page suggests when the
updater is missing, does the same for one run; `COMPOSE_PROFILES` in `.env`
keeps it on for every later `docker compose up -d`.

Automatic updates check ten minutes after boot and then every six hours, wait
while a soundscape is generating or a generator is deploying, and never cross a
major version. The **Update** button is refused for the same busy reasons.

Updates follow `HALCYON_TAG`: `latest` moves to any newer release, `X.Y` only
to newer `X.Y.*` patches, and an exact `X.Y.Z` tag never moves; the app
says so when a newer release exists outside your tag. A `-cli` tag stays on the
CLI image. Without the updater, the page shows the
`docker compose pull && docker compose up -d` command instead.

---

## Backups

Back up the `halcyon-data` volume. Stop the container first so the SQLite file
is consistent:

```bash
docker compose stop halcyon
docker compose cp halcyon:/data ./halcyon-backup
docker compose start halcyon
```

To restore, with `<folder>` the directory holding `compose.yaml`:

```bash
docker compose down
docker compose create
docker run --rm -v <folder>_halcyon-data:/data -v "$PWD/halcyon-backup:/backup:ro" alpine \
  sh -c 'cp -a /backup/. /data/ && chown -R 1000:1000 /data'
docker compose up -d
```

`docker compose create` makes the container and its volumes without starting
them. The `chown` matters: the container runs as uid 1000 and cannot write files
owned by root. Keep `secret.key` with the backup, or set `SECRET_KEY`;
otherwise stored API keys cannot be decrypted after a restore.

From source, the same files are under `DATA_DIR` (`data/` by default).

---

## Running it from source

For development, or if you would rather not use containers. Needs Python 3.11
and Node.js 22.12 or newer (only to build the UI). The development workflow,
with hot reload, is in [MANUAL.md](MANUAL.md).

```bash
git clone https://github.com/orcrobert/halcyon.git && cd halcyon
git checkout vX.Y.Z                 # optional: a release instead of main

cp .env.example .env                # optional: instance defaults

python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ./mixer -e .

cd frontend && npm ci && npm run build && cd ..

uvicorn api.app.main:app --host 127.0.0.1 --port 8001
```

Open <http://localhost:8001> and register. The database is created under
`DATA_DIR` on first boot; there is no migration step and no queue worker to
remember. The API serves `frontend/dist` at the root when that build exists;
without it you get the API only. Run it from the repo root, so relative paths in
`.env` resolve against the checkout.

Keep it behind a reverse proxy as in [On a public server](#on-a-public-server),
and under a process manager (systemd, supervisord) if it should survive a
reboot.

---

## The generator contract

The API delegates all audio synthesis to whatever HTTP service the user's active
generator (or `GENERATOR_URL`) points at. Implement these two endpoints and you
can generate with anything: a local AudioCraft server, a cloud GPU box, one of
the hosts in `generators/`, or a stub for testing.

### `GET /`: readiness

Before every batch the API polls `GET {url}/` every 3 s, for up to 120 s, until
it answers `200` with a JSON object whose `loaded` is not `false`:

```json
{ "status": "ok", "loaded": true }
```

Optional fields are shown on the account page's **Test**: `audiogen_model`,
`musicgen_model`, `style_model`, `duration`, `max_duration`, `gpu`. A redirect
reads as "starting" (a Modal cold start). Anything else, such as a 404 or a
non-JSON body, makes the API wait the full 120 s and then post anyway, so
implement this endpoint even in a stub. **Test** waits 10 s, so it reports a
cold host as unreachable; warm it and test again.

### `POST /generate`

**Request**

```json
{
  "duration": 30,
  "elements": [
    { "index": 0, "label": "wind", "type": "sound", "prompt": "low desert wind, distant, soft", "duration": 4 },
    { "index": 1, "label": "drone", "type": "music", "prompt": "ambient drone, warm low sustained tone", "duration": 30 }
  ],
  "options": { "style_eval_q": 3, "style_cfg_beta": 5.0 }
}
```

- `type` is `"sound"` (synthesize with AudioGen) or `"music"` (MusicGen).
- `prompt` is the text to generate from.
- `index` is the element's position in the request. Echo it back and the API
  matches your reply to the right layer no matter what order you answer in.
- An evolving layer can appear more than once, with the same label and prompt
  but its own `index`. Those are extra takes of one layer, which the browser
  crossfades between, so generate each one independently (sampled, never from a
  fixed seed) and echo each `index`. How many is a per-user setting.
- The per-element `duration` is the seconds to generate for that element. Beds,
  stationary noise-like material the browser loops, ask for 4 s; one-shot events
  ask for 2 s; evolving layers and music ask for the length the user chose next
  to the prompt box. An event prompt describes a single occurrence ("single owl
  hoot, distant, soft"); the browser retriggers it, so do not generate a
  repeating version of it.
- The top-level `duration` is that user-chosen length (5–120) and is the
  fallback for elements that carry none.
- A generator that ignores both `duration` fields still works; it just always
  produces its own configured length.
- When the user attached a style clip, every `"music"` element also carries
  `style_b64`: a base64 mono WAV of 1.5–4.5 s. Generate that element with
  MusicGen-Style (`facebook/musicgen-style`) so it takes on the clip's sound.
  The excerpt is a reference, not a part of the output. A generator without a
  style model ignores the field and generates from the prompt alone.
- A top-level `options` object may carry tuning for this request:
  `style_eval_q` (1–6) and `style_cfg_beta` for styled music. Ignore what you do
  not support.

**Response:** echo each element back with base64-encoded WAV bytes added:

```json
{
  "elements": [
    { "index": 0, "label": "wind", "type": "sound", "prompt": "...", "audio_b64": "<base64 WAV>" },
    { "index": 1, "label": "drone", "type": "music", "prompt": "...", "audio_b64": "<base64 WAV>" }
  ]
}
```

- `audio_b64` must be the base64 encoding of a complete WAV file, at any sample
  rate, mono or stereo.
- Do not echo `style_b64` back; it is only an input.
- Keep `index` (or at least `label`); the API matches replies by `index`, then
  by `label`, then by position. Elements that come back without `audio_b64` are
  dropped and the rest of the mix goes ahead; if none come back, the run fails.
- Every clip is checked before mixing. Silent or unreadable clips are dropped;
  clipping, bursts, dropouts, harshness and loop-seam jumps are flagged for the
  user to re-render.
- Batching by length pays off: generating four elements at 4 s costs far less
  than four at 30 s on an autoregressive model.
- The API waits up to **300 s** per request, so a generator that honours long
  durations should still fit a whole batch inside that budget. Following
  redirects is fine; the API's client does.
- There is no auth between the API and the generator. Run the generator on a
  private network, or behind a proxy that checks a secret in the URL path.

### Ready-made hosts

`generators/` contains working implementations of this contract, all built on
one shared package (`generators/core`), so they behave identically:

| Host | Cost | Setup |
|------|------|-------|
| `generators/local/` | free | `halcyon-generator serve` on your own CUDA GPU |
| `generators/colab/` | free tier | run the notebook, copy the ngrok URL |
| `generators/modal/` | per-second GPU, scales to zero | **Deploy** on the account page, or `modal deploy` |
| `generators/huggingface/` | paid GPU hardware, always on | `git subtree push` |

If you have a CUDA GPU, run it locally: it is the fastest and costs nothing.
Otherwise Modal is the sensible default for real use, and Colab is the quickest
way to see it working. [generators/README.md](generators/README.md) has a
quickstart for each.

If you containerise a generator yourself, it is the only GPU container and the
only piece that may live on a different host: CUDA base image, port of your
choice, a volume for the model weights cache (several GB), and its URL saved on
the account page.
