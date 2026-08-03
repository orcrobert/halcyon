# Halcyon generator — Modal

The best host for intermittent use. Containers scale to zero between requests,
so an idle generator costs nothing, and the GPU is billed by the second while it
runs. Colab needs a browser tab open; a Hugging Face Space with GPU hardware
bills continuously.

The trade is a cold start. The first request after an idle period pays for
container boot plus model load. Weights are cached on a Modal volume, so only
the very first container pays the download.

## Deploy

```bash
pip install modal
modal setup
modal deploy generators/modal/deploy.py
```

Modal prints the URL on success. Paste it into the account page under
**Generators → Add → Modal**, or set it in `.env`:

```
GENERATOR_URL=https://<workspace>--halcyon-generator-generator-web.modal.run
```

To iterate on the deployment without publishing it, `modal serve
generators/modal/deploy.py` gives you a temporary URL that reloads on save.

## Configuration

Set them in the repo-root `.env` — `deploy.py` reads it — or export them in your
shell, which wins over the file:

```
HALCYON_MODAL_GPU=T4
```

| GPU | Notes |
|-----|-------|
| `T4` | 16 GB, cheapest that fits both models, slowest |
| `L4` | 24 GB, a good middle |
| `A10G` | 24 GB, the default, roughly twice a T4 |
| `A100`, `A100-80GB`, `L40S`, `H100` | faster, more expensive |

Both models together need about 8 GB, so a T4 is fine — you are trading
generation time for cost, not capability.

The model settings are baked into the image instead:

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` | model for `type: sound` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` | model for `type: music` |
| `GENERATION_DURATION` | `10` | seconds per element |

```bash
HALCYON_MODAL_GPU=T4 MUSICGEN_MODEL=facebook/musicgen-medium \
  modal deploy generators/modal/deploy.py
```

Changing a **model** setting rebuilds the image, so that deploy is slow.
Changing the **GPU** does not — it is a property of the running class, so
switching to a T4 is a fast redeploy.

## Private repository

Nothing to configure. The image copies `generators/core` straight off your
checkout with `add_local_dir` and installs from that path, so it never clones
this repository and never needs a token — public or private makes no difference.

It also means you deploy the code you have in front of you. Edit `core`, redeploy,
and the change is live without pushing anything.

## How it works

`@modal.enter()` loads AudioGen and MusicGen once per container and
`create_app(engine=..., eager=False)` mounts the shared FastAPI app over that
already-loaded engine, so a warm container answers `POST /generate` with no
per-request load.

`startup_timeout=900` covers a cold model load, and `timeout=900` covers a
generation request — both comfortably above the 300 s the Halcyon API waits, so
a cold start is the only case that can time out on the API side. Hit `GET /`
once after deploying to warm a container before you generate for real.

`max_containers=1` keeps a single generator alive. Raise it for concurrent
atmospheres and expect a cold start per new container.

## What is verified

`deploy.py` is checked against the real `modal` package (1.5.3): the module
imports, the image spec builds, and the class and ASGI endpoint register. That
catches API drift — `modal.Stub` is gone, `container_idle_timeout` is now
`scaledown_window` — but it is not a deployment.

**It has not been run on Modal hardware.** Deploying needs an account, and the
GPU path, cold-start timings and volume caching are unexercised. Treat the first
`modal deploy` as the real test.
