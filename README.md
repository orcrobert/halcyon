# Halcyon

**Describe a place. Hear it, forever.**

Type *"a rainy Kyoto garden at dusk"*, *"a lighthouse keeper's kitchen in a
storm"*, or just *"cold and lonely"*, and Halcyon turns it into an ambient
soundscape that plays without end and never audibly repeats its seams.

It works the way a sound designer would. A language model reads your
description and splits it into separate layers: a steady bed of rain, the
texture of wind in the trees, a slow piano line, a crow that calls now and then.
Each layer is generated on its own, then Halcyon listens to all of them and
mixes them itself, choosing how loud each one sits, how it is equalised, where
it is placed left to right and how far away it sounds. The result is calm and
soft by design: something to work, read or sleep to.

## What you can do with it

- **Remix it live.** Every layer has its own volume, EQ, stereo position and
  distance. Change them while it plays; your mix is saved as you go.
- **Fix what you don't like.** Delete a layer, or re-render one with a note like
  *"less hiss, more distant"*. Or roll a whole new take of the scene.
- **Check the layers first.** Optionally review and edit the layers the model
  proposes before anything is generated.
- **Steer the music.** Upload a few seconds of a song you like and the music
  layers follow its style.
- **Shape the whole room.** Retune the music to A = 432 Hz, add binaural beats,
  or let **animate** drift the mix slowly on its own.
- **Take it with you.** Export up to five minutes of the soundscape as a WAV file.
- **Trust the output.** Every clip is checked for silence, clipping, clicks and
  harsh frequencies, and anything suspect is flagged so you can re-render it.
- **Share the server.** Multiple accounts, each with their own models, keys and
  library. The first account to sign up is the administrator.

Twenty themes, too.

## Run it

Halcyon is one container and needs no configuration to start. Save this as
`compose.yaml` on your server, or paste it into Dockge, Portainer or whatever
manages your stacks:

```yaml
services:
  halcyon:
    image: ghcr.io/orcrobert/halcyon:${HALCYON_TAG:-latest}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${HALCYON_PORT:-8001}:8001"
    env_file:
      - path: .env
        required: false
    environment:
      GENERATOR_URL: ${GENERATOR_URL:-http://host.docker.internal:9000}
      DATA_DIR: /data
      FRONTEND_DIST: /app/frontend/dist
      GENERATORS_DIR: /app/generators
      HALCYON_TAG: ${HALCYON_TAG:-latest}
      DECOMPOSER_ALLOW_CLI: ${DECOMPOSER_ALLOW_CLI:-false}
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    volumes:
      - halcyon-data:/data
      - updater-token:/updater
    tmpfs:
      - /tmp
    read_only: true
    init: true
    security_opt:
      - no-new-privileges:true
    extra_hosts:
      - "host.docker.internal:host-gateway"

  updater:
    image: nickfedor/watchtower:1.23.1@sha256:3175c006eb20112f3a70f7002f82dbf4a4078c97e7033735a4d153668fc3dfb1
    profiles: [updates]
    restart: unless-stopped
    environment:
      WATCHTOWER_HTTP_API_ENDPOINTS: update,health
      WATCHTOWER_HTTP_API_TOKEN: /updater/token
      WATCHTOWER_LABEL_ENABLE: "true"
      WATCHTOWER_CLEANUP: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - updater-token:/updater:ro
    depends_on:
      halcyon:
        condition: service_healthy

volumes:
  halcyon-data:
  updater-token:
```

Then start it:

```bash
docker compose up -d
```

Or fetch the same file straight from the repo:

```bash
mkdir halcyon && cd halcyon
curl -fsSLO https://raw.githubusercontent.com/orcrobert/halcyon/main/compose.yaml
docker compose up -d
```

Open <http://localhost:8001> and create an account. The first one is the
administrator. Everything you make lives in the `halcyon-data` volume, so the
container can be removed and recreated freely.

To update to the latest release:

```bash
docker compose pull && docker compose up -d
```

Or add `COMPOSE_PROFILES=updates` to a `.env` next to `compose.yaml`, run
`docker compose up -d` once, and update from **Account → Updates** in the app,
by hand or automatically.

Server-wide settings, such as closing registration, go in that same `.env`. None
are required; every variable is listed in
[SELF_HOSTING.md](SELF_HOSTING.md#configuration).

### Choosing a version

`HALCYON_TAG` in `.env` picks the image. Release `vX.Y.Z` publishes these tags:

| Tag | Follows |
|-----|---------|
| `latest` | every release |
| `X.Y` | patches of one minor line only |
| `X.Y.Z` | one exact release, never moves |
| `latest-cli`, `X.Y-cli`, `X.Y.Z-cli` | the same, plus Claude Code and Codex for [CLI language models](SELF_HOSTING.md#language-models-through-a-cli) |

Releases and their notes are on the
[releases page](https://github.com/orcrobert/halcyon/releases). Rolling back is
the same as moving forward: set the older tag and
`docker compose pull && docker compose up -d`. Details in
[SELF_HOSTING.md](SELF_HOSTING.md#versions-tags-and-releases).

<details>
<summary>With plain Docker instead</summary>

```bash
docker run -d --name halcyon \
  -p 127.0.0.1:8001:8001 \
  -v halcyon-data:/data \
  --read-only --tmpfs /tmp \
  --add-host host.docker.internal:host-gateway \
  --restart unless-stopped \
  ghcr.io/orcrobert/halcyon:latest
```

To update, `docker pull ghcr.io/orcrobert/halcyon:latest`, then
`docker rm -f halcyon` and run the same command again.
</details>

<details>
<summary>From source, without Docker</summary>

Needs Python 3.11 and Node.js 22.12 or newer.

```bash
git clone https://github.com/orcrobert/halcyon.git
cd halcyon
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ./mixer -e '.[dev]'
cd frontend && npm ci && npm run build && cd ..
uvicorn api.app.main:app --port 8001
```

Then open <http://localhost:8001>. Add `git checkout vX.Y.Z` after cloning,
with a tag from `git tag -l 'v*'`, to run a release instead of `main`. Developing it, with hot reload, is covered in
[MANUAL.md](MANUAL.md).
</details>

## Set it up

Halcyon itself is light. The two heavy lifts happen elsewhere, and you point it
at them from your account page once you are signed in. No files to edit, no
restart.

### 1. A language model

Open **Account → Language model** and pick one:

| Provider | What you need |
|---|---|
| **Google Gemini** | A free API key from [Google AI Studio](https://aistudio.google.com/apikey). The easiest start. |
| **Ollama** | [Ollama](https://ollama.com) running somewhere Halcyon can reach, with a model pulled (`ollama pull mistral`). No key. |
| **OpenAI-compatible API** | A base URL and key for OpenAI or any service that speaks its API (Groq, OpenRouter, DeepSeek, LM Studio, vLLM, …). |
| **Claude Code or Codex CLI** | The CLI on the server, under your subscription login. Personal instances only: run a `-cli` image tag and set `DECOMPOSER_ALLOW_CLI=true`. Setup in [SELF_HOSTING.md](SELF_HOSTING.md#language-models-through-a-cli). |

Keys and tokens are encrypted before they are stored and are never sent back to
the browser.

### 2. An audio generator

The sound itself is made by Meta's AudioGen and MusicGen, which need a GPU.
Open **Account → Audio generator** and choose where that runs:

**Modal (recommended).** A GPU in the cloud that starts when you press
generate and shuts down when you stop, so you pay per second of use. Create a
token at [modal.com/settings/tokens](https://modal.com/settings/tokens), then in
Halcyon pick **Modal → Deploy**, paste the token, and press **Create and
deploy**. Halcyon deploys it for you and fills in the address. The first
generation after a quiet spell takes a minute or two while the GPU wakes up.

**Google Colab (free).** Open the
[generator notebook](https://colab.research.google.com/github/orcrobert/halcyon/blob/main/generators/colab/halcyon_generator.ipynb),
set **Runtime → Change runtime type → T4 GPU**, paste a free
[ngrok token](https://dashboard.ngrok.com/get-started/your-authtoken) into the
config cell and choose **Runtime → Run all**. Copy the URL it prints and add it
in Halcyon as a **Google Colab** generator. The URL lasts as long as the Colab
session.

**Your own machine.** If you have an NVIDIA GPU with CUDA, in a Python 3.10 or
3.11 environment:

```bash
pip install "halcyon-generator[audiocraft] @ git+https://github.com/orcrobert/halcyon@main#subdirectory=generators/core"
pip install --no-deps git+https://github.com/facebookresearch/audiocraft.git
halcyon-generator serve --port 9000
```

Add it in Halcyon as a **Local machine** generator at `http://localhost:9000`.
If Halcyon runs in Docker on the same computer, use
`http://host.docker.internal:9000` instead.

A **Hugging Face Space** on a paid GPU works too. Every option is covered in
[generators/README.md](generators/README.md).

### 3. Make something

Go back to the main screen, describe a scene, pick how long the loop should be,
and press generate. You can watch each step as it happens.

## Documentation

| Read | For |
|------|-----|
| [SELF_HOSTING.md](SELF_HOSTING.md) | every setting, Docker, image tags, updates, backups, CLI language models, the generator contract |
| [generators/README.md](generators/README.md) | running a generator on Modal, Colab, your own GPU or Hugging Face |
| [MANUAL.md](MANUAL.md) | developing from source, using every control, troubleshooting, tests |
| [AGENTS.md](AGENTS.md) | how the code is organised and the rules for contributing, by hand or with a coding agent |

## License

[MIT](LICENSE)
