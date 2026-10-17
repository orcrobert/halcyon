# Generators

The GPU half of Halcyon. The API delegates all audio synthesis to whatever HTTP
service it is pointed at, so a generator is anything implementing
`POST /generate`. The contract is defined once, in
[SELF_HOSTING.md](../SELF_HOSTING.md#the-generator-contract).

Nothing in `api/` knows which host is answering.

## Pick one

| Host | Cost | Setup | Best for |
|------|------|-------|----------|
| [**Local**](local/README.md) | free | two pip installs | you have a CUDA GPU — **fastest** |
| [**Colab**](colab/README.md) | free | ngrok token, tab stays open | trying it out — **quickest start** |
| [**Modal**](modal/README.md) | per-second GPU, scales to zero | **Deploy** on the account page, or `modal deploy` | real use without a GPU — **recommended** |
| [**Hugging Face**](huggingface/README.md) | paid GPU, always on | `git subtree push` | a public always-on instance |

Free Hugging Face Spaces are CPU-only and cannot generate inside the API's 300 s
timeout. That route means paid hardware.

## Fastest possible start

Own GPU, in a Python 3.10 or 3.11 environment (AudioCraft's pinned torch has
no wheels for newer Pythons), from a checkout of this repository:

```bash
pip install -e "./generators/core[audiocraft]"
pip install --no-deps git+https://github.com/facebookresearch/audiocraft.git
halcyon-generator serve --port 9000
```

Without a checkout, swap the first line for the git URL:
`pip install "halcyon-generator[audiocraft] @ git+https://github.com/orcrobert/halcyon@main#subdirectory=generators/core"`

No GPU: open [the Colab notebook](https://colab.research.google.com/github/orcrobert/halcyon/blob/main/generators/colab/halcyon_generator.ipynb),
set a T4 runtime, run all cells.

Either way, paste the printed URL into **Account → Audio generator** and add
it. Halcyon in Docker on the same machine reaches a local generator at
`http://host.docker.internal:9000`, not `localhost`.

## Switching between them

Save as many as you like in the account page and switch with one click — the
active one is used for your next generation. Each entry keeps its own URL, so
moving between a Colab session and a Modal deployment does not mean hunting down
links again.

**Test** probes a generator and shows whether it is reachable and which models it
is running. Colab entries get an inline URL box, because that URL changes every
session.

Generators are per-user. The instance's `GENERATOR_URL` is only the fallback for
users who have not saved one.

## Layout

| Path | What it is |
|------|-----------|
| `core/` | `halcyon-generator` — the server, the engine, the CLI |
| `colab/` | notebook, ngrok |
| `local/` | running `core` on your own machine |
| `huggingface/` | Docker Space on port 7860 |
| `modal/` | Modal ASGI deployment |

Every host is a thin adapter over `create_app()`. Fix a generation bug in
`core/` and all of them inherit it — never patch one host in isolation.

## The package

```python
from halcyon_generator import create_app

app = create_app()
```

`create_app()` loads AudioGen and MusicGen and exposes `GET /` (readiness and
the models it runs, which the API polls before every batch), `GET /health` and
`POST /generate`. Pass `eager=False` with a pre-loaded `AudioCraftEngine`
when the host loads models itself, as `modal/` does.

The CLI wraps the same thing:

```bash
halcyon-generator serve --port 9000 --device cuda
halcyon-generator check https://your-generator.example.com
```

`serve` listens on port 8000 unless told otherwise; the examples pass
`--port 9000` because that is where Halcyon looks by default.

## Configuration

Environment variables, identical on every host. On Modal they are deploy
options, set from the account page or the shell; see
[modal/README.md](modal/README.md#configuration).

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` | model for `type: sound` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` | model for `type: music` |
| `STYLE_MODEL` | `facebook/musicgen-style` | model for music with a style clip; blank disables style clips |
| `STYLE_PRELOAD` | off (`1` on Modal) | load the style model at startup instead of on the first styled request |
| `STYLE_EVAL_Q` | `3` | default style closeness (1–6); a request's `options` overrides it |
| `STYLE_CFG_BETA` | `5.0` | default prompt weight for styled music; a request's `options` overrides it |
| `GENERATION_DURATION` | `10` | seconds per element when a request carries no duration |
| `GENERATION_LOUDNESS_LUFS` | `-20` | loudness every clip is normalised to |
| `GENERATION_DEVICE` | `cuda` | torch device (`cuda`, `cpu`, `mps`) |
| `PORT` | `8000` | port for `serve` |

`serve` flags override the matching variables: `--audiogen`, `--musicgen`,
`--duration`, `--device`, `--port`, and `--host` (default `0.0.0.0`).

`core` depends on FastAPI and Pydantic only. AudioCraft and torch are imported
lazily, so the package installs and its tests run without a GPU.

### The dependency list lives in one place

Everything AudioCraft needs at runtime is the `[audiocraft]` extra in
`generators/core/pyproject.toml`. Modal and the Hugging Face Space install that
extra rather than restating it; each pins only the four CUDA wheels that have to
come from PyTorch's index (`torch`, `torchvision`, `torchaudio`, `xformers`).

**Add a runtime dependency there and nowhere else.** When the list was duplicated
per host it drifted, and the hosts missing `xformers` crashed on the first
generation — `audiocraft.modules.transformer` imports it at module load, so the
failure comes at model load, not at install.

### Installing from a private fork

The repository is public, so every install from the git URL works without
credentials. A build from a private fork dies with `exit code: 128` instead.
Modal and a local checkout never clone, so they are unaffected; Colab takes a
`GITHUB_TOKEN` in its first cell and the Hugging Face Space a `GH_TOKEN` build
secret, both of which can stay empty for this repository.

## Tests

```bash
cd generators/core && pytest
```

Covers the contract against a stub engine — no AudioCraft, no GPU.
