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
      - "${HALCYON_PORT:-8001}:8001"
    env_file:
      - path: .env
        required: false
    environment:
      GENERATOR_URL: ${GENERATOR_URL:-http://host.docker.internal:9000}
      DATA_DIR: /data
      FRONTEND_DIST: /app/frontend/dist
      GENERATORS_DIR: /app/generators
    volumes:
      - halcyon-data:/data
    tmpfs:
      - /tmp
    read_only: true
    init: true
    security_opt:
      - no-new-privileges:true
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  halcyon-data:
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

Server-wide settings, such as closing registration or pinning a version, go in
a `.env` file next to `compose.yaml`. None are required; see
[SELF_HOSTING.md](SELF_HOSTING.md#running-it-with-docker).

<details>
<summary>With plain Docker instead</summary>

```bash
docker run -d --name halcyon \
  -p 8001:8001 \
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

Needs Python 3.11 and Node 22 or newer.

```bash
git clone https://github.com/orcrobert/halcyon.git
cd halcyon
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ./mixer -e '.[dev]'
cd frontend && npm install && npm run build && cd ..
uvicorn api.app.main:app --port 8001
```

Then open <http://localhost:8001>.
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
| **OpenAI-compatible API** | A base URL and key for OpenAI or any service that speaks its API. |

Keys are encrypted before they are stored and are never sent back to the
browser.

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

**Your own machine.** If you have an NVIDIA GPU with CUDA:

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

## More

- **[SELF_HOSTING.md](SELF_HOSTING.md)**: server-wide defaults, user
  management, published images and the contract any generator must follow.
- **[MANUAL.md](MANUAL.md)**: running and developing every part of the stack.
- **[AGENTS.md](AGENTS.md)**: how the code is organised and the rules for
  contributing.

## License

[MIT](LICENSE)
