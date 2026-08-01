---
title: Halcyon Generator
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Halcyon generator — Hugging Face Space

A Docker Space implementing the [Halcyon generator contract](https://github.com/orcrobert/soundscape-generator/blob/main/SELF_HOSTING.md#the-generator-contract):
`POST /generate` takes typed elements, returns each one with base64 WAV bytes.

The server itself is `halcyon-generator`, installed from the main repository.
`app.py` here is only the entrypoint.

## Hardware

**This needs paid GPU hardware.** Free Spaces are CPU-only, and AudioGen medium
plus MusicGen large at 10 s per element takes minutes per request on CPU — past
the 300 s timeout the Halcyon API allows. ZeroGPU is built around the Gradio
SDK and does not fit a long-running `POST /generate`, so it is not an option
for this Space either.

Pick a T4 or better under Settings → Hardware. For anything other than an
always-on instance, Modal (`generators/modal/`) is cheaper — it scales to zero
between requests.

## Wiring it up

Set `GENERATOR_URL` in Halcyon's `.env` to the Space's direct URL:

```
GENERATOR_URL=https://<user>-<space>.hf.space
```

A private Space needs a token on every call, which the API does not send today.
Keep the Space public, or put it behind your own proxy.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` | model for `type: sound` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` | model for `type: music` |
| `GENERATION_DURATION` | `10` | seconds per element |
| `GENERATION_DEVICE` | `cuda` | torch device |

Set them as Space variables. Models load at startup, so the first boot after a
change is slow.

## Deploying

From a checkout of the main repository:

```bash
git remote add hf https://huggingface.co/spaces/<user>/<space>
git subtree push --prefix generators/huggingface hf main
```

That pushes this directory as the Space's repository root, which is where
Hugging Face expects `Dockerfile`, `app.py` and this README.
