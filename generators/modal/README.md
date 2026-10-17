# Halcyon generator — Modal

The best host for intermittent use. Containers scale to zero between requests,
so an idle generator costs nothing, and the GPU is billed by the second while it
runs. Colab needs a browser tab open; a Hugging Face Space with GPU hardware
bills continuously.

The trade is a cold start. The first request after an idle period pays for
container boot plus model load. Weights are cached on a Modal volume, so only
the very first container pays the download.

## Deploy

### From the app

Open **Account → Audio generator → Modal → Deploy**, save a Modal token (from
[modal.com/settings/tokens](https://modal.com/settings/tokens)), pick the GPU and
models, and press **Create and deploy**. The API runs the same `modal deploy`
below, shows its log, and fills in the URL when it finishes. Changing a
deployment option afterwards marks it as waiting for a redeploy, and a toast
stays on screen with a **Redeploy** button until you run one. Per-request
options (style closeness, prompt weight) apply on the next generation without
a redeploy.

### From a terminal

```bash
pip install modal
modal setup
modal deploy generators/modal/deploy.py
```

Modal prints the URL on success. Add it as a **Modal** generator under
**Account → Audio generator**, or set it in `.env`:

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
generation time for cost, not capability. The style model adds a third
MusicGen and a MERT encoder on top; on a T4 either set `STYLE_PRELOAD=0` or
drop `MUSICGEN_MODEL` to medium.

The model settings are baked into the image instead:

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` | model for `type: sound` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` | model for `type: music` |
| `STYLE_MODEL` | `facebook/musicgen-style` | model for music with a style clip; blank disables it |
| `STYLE_PRELOAD` | `1` | load the style model in `@modal.enter()` so its weights land in the cached volume; `0` loads it on the first styled request instead |
| `GENERATION_DURATION` | `10` | seconds per element |
| `GENERATION_LOUDNESS_LUFS` | `-20` | loudness each clip is normalised to |
| `STYLE_EVAL_Q`, `STYLE_CFG_BETA` | `3`, `5` | defaults for style closeness and prompt weight; the account page sends both per request, so no redeploy is needed to change them |
| `HALCYON_MODAL_SCALEDOWN` | `300` | seconds an idle container waits before scaling to zero |

`HALCYON_MODAL_GPU` and `HALCYON_MODAL_SCALEDOWN` are read by `deploy.py` itself;
the rest become environment variables inside the container. Deploying from the
account page passes the same names, taken from the generator's options.

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

`deploy.py` has been deployed and run on Modal hardware (A10G, `modal` 1.5.3).
A cold container boots and loads both models in about 150 s; a warm container
answers `POST /generate` for one 5 s element in about 18 s.

`deploy.py` is imported twice — once locally to build the image and register the
app, once inside the container to resolve the class. Anything it does at module
level must survive both. Local paths (the repo root, `.env`, `generators/core`)
exist only in the first case, so they stay behind `modal.is_local()`.

Requests that outlive Modal's synchronous window come back as a `303` to a
polling URL rather than a result. A cold start hits this. Follow redirects
(`curl -L`) when testing by hand; the API's `requests` calls already do.

The account page's generator probe waits 10 s, so it reports a cold Modal host
as unreachable. Warm it with `GET /` and probe again.
