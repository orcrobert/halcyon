# Generators

The GPU half of Halcyon. The API delegates all audio synthesis to whatever HTTP
service `GENERATOR_URL` points at, so a generator is anything that implements
`POST /generate`. The contract is defined once, in
[SELF_HOSTING.md](../SELF_HOSTING.md#the-generator-contract).

Nothing in `api/` knows which host is answering.

## Layout

| Path | What it is |
|------|-----------|
| `core/` | `halcyon-generator` — the FastAPI server and AudioCraft batching, installable from git |
| `colab/` | notebook: installs `core`, serves it through ngrok |
| `huggingface/` | Docker Space: installs `core`, serves it on port 7860 |
| `modal/` | Modal deployment: installs `core`, serves it as an ASGI app (unverified) |

Every host is a thin adapter over `create_app()`. Fix a generation bug in
`core/` and all three inherit it.

## Choosing a host

| | Cost | Setup | Good for |
|---|------|-------|----------|
| **Colab** | free tier | ngrok token, keep the tab open | trying it out, demos |
| **Modal** | per-second GPU, scales to zero | `modal deploy` | intermittent real use — **recommended** |
| **Hugging Face** | paid GPU hardware, always on | `git subtree push` | an always-available public instance |

Free Hugging Face Spaces are CPU-only and cannot generate inside the API's
300 s timeout; see [huggingface/README.md](huggingface/README.md).

You do not need any of these. A local box with a CUDA GPU running
`uvicorn` over `create_app()` is the fastest option if you have one.

## The shared package

```python
from halcyon_generator import create_app

app = create_app()
```

`create_app()` loads AudioGen and MusicGen at import time and exposes `GET /`,
`GET /health` and `POST /generate`. Pass `eager=False` with a pre-loaded
`AudioCraftEngine` when the host loads models itself, as `modal/` does.

Configuration is environment-only:

| Variable | Default |
|----------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` |
| `GENERATION_DURATION` | `10` |
| `GENERATION_DEVICE` | `cuda` |
| `PORT` | `8000` |

Install it anywhere with:

```
pip install "halcyon-generator @ git+https://github.com/orcrobert/soundscape-generator@main#subdirectory=generators/core"
```

`core` depends on FastAPI and Pydantic only. AudioCraft and torch are the host's
job — they are imported lazily, so the package installs and its tests run
without a GPU.

## Tests

```bash
cd generators/core && pytest
```

The suite covers the contract against a stub engine, so it needs neither
AudioCraft nor a GPU.
