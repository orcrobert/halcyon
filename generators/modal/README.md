# Halcyon generator — Modal

> **Status: unverified.** The deployment below is written but has not been run
> against Modal yet. Treat it as a starting point, not a tested path.

Modal is the best fit of the three hosts for occasional use: containers scale to
zero between requests, so an idle generator costs nothing, and a GPU is billed
by the second while it runs. Colab needs a browser tab open; a Hugging Face
Space with GPU hardware bills continuously.

The cost is a cold start. The first request after an idle period pays for
container boot plus model load — well inside the API's 300 s timeout once the
weights are cached on the volume, but slow the very first time.

## Deploying

```bash
pip install modal
modal setup
modal deploy generators/modal/deploy.py
```

Modal prints a URL. Put it in Halcyon's `.env`:

```
GENERATOR_URL=https://<workspace>--halcyon-generator-generator-web.modal.run
```

## How it is wired

`@modal.enter()` loads AudioGen and MusicGen once per container, and
`create_app(engine=..., eager=False)` mounts the shared FastAPI app over that
already-loaded engine — so a warm container answers `POST /generate`
immediately. Model weights persist in the `halcyon-model-cache` volume, so only
the first container of a given image pays the download.

`max_containers=1` keeps a single generator alive. Raise it if you want
concurrent atmospheres, and expect a cold start per new container.

## Configuration

The same variables as every other host — `AUDIOGEN_MODEL`, `MUSICGEN_MODEL`,
`GENERATION_DURATION`, `GENERATION_DEVICE`. Set them in the image's `.env({...})`
call or as Modal secrets.
