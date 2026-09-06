# Halcyon generator — your own machine

If you have a CUDA GPU, this is the fastest and cheapest option: no cold starts,
no tunnels, no bills.

## Run it

```bash
pip install "halcyon-generator[audiocraft] @ git+https://github.com/orcrobert/halcyon@main#subdirectory=generators/core"
pip install --no-deps git+https://github.com/facebookresearch/audiocraft.git
halcyon-generator serve --port 9000
```

The second line is separate because AudioCraft is installed from git without its
dependency set — it pins versions that fight with everything else.

From a checkout of this repository you can skip the git URL entirely, which is
also what to do while the repository is private:

```bash
pip install -e "./generators/core[audiocraft]"
```

`serve` prints the URL to paste into **Account → Generators → Add → Local
machine**. If Halcyon runs on the same box, `http://localhost:9000` is already
the instance default and you need no profile at all.

## Options

```bash
halcyon-generator serve --port 9000 --duration 8 --musicgen facebook/musicgen-medium
halcyon-generator serve --device cpu        # works, but minutes per element
halcyon-generator check http://localhost:9000
```

Flags override the environment variables (`AUDIOGEN_MODEL`, `MUSICGEN_MODEL`,
`GENERATION_DURATION`, `GENERATION_LOUDNESS_LUFS`, `GENERATION_DEVICE`, `PORT`).

`check` probes a generator and prints what it reports — the quickest way to tell
whether a URL is live before pasting it anywhere.

## Serving Halcyon from another machine

The API reaches the generator directly, so the generator needs to be routable
from wherever the API runs — not from your browser. In Docker, the compose
default `http://host.docker.internal:9000` already points at the host.

There is no authentication between the API and the generator. Keep it on a
private network, or put your own proxy in front.
