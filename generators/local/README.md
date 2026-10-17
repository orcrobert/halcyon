# Halcyon generator — your own machine

If you have a CUDA GPU, this is the fastest and cheapest option: no cold starts,
no tunnels, no bills.

## Run it

In a Python 3.10 or 3.11 environment (AudioCraft's pinned torch 2.1.2 has no
wheels for newer Pythons), with an NVIDIA driver recent enough for CUDA 12:

```bash
pip install "halcyon-generator[audiocraft] @ git+https://github.com/orcrobert/halcyon@main#subdirectory=generators/core"
pip install --no-deps git+https://github.com/facebookresearch/audiocraft.git
halcyon-generator serve --port 9000
```

The second line is separate because AudioCraft is installed from git without its
dependency set — it pins versions that fight with everything else.

From a checkout of this repository you can skip the git URL and install the
code you have in front of you:

```bash
pip install -e "./generators/core[audiocraft]"
```

The first start downloads the model weights (several GB, cached by Hugging Face
under `~/.cache/huggingface`) and loads them; later starts only load.

`serve` prints the URL to add under **Account → Audio generator → Local
machine**. If Halcyon runs from source on the same box, `http://localhost:9000`
is already the instance default and you need no profile at all; Halcyon in
Docker on the same box reaches it at `http://host.docker.internal:9000`.

## Options

```bash
halcyon-generator serve --port 9000 --duration 8 --musicgen facebook/musicgen-medium
halcyon-generator serve --device cpu        # works, but minutes per element
halcyon-generator check http://localhost:9000
```

Flags (`--audiogen`, `--musicgen`, `--duration`, `--device`, `--port`,
`--host`) override the matching environment variables. Everything else, such as
`STYLE_MODEL` or `GENERATION_LOUDNESS_LUFS`, is environment only; the full list
is in [../README.md](../README.md#configuration). Without `--port` it listens
on 8000.

`check` probes a generator and prints what it reports — the quickest way to tell
whether a URL is live before pasting it anywhere.

## Serving Halcyon from another machine

The API reaches the generator directly, so the generator needs to be routable
from wherever the API runs — not from your browser. In Docker, the compose
default `http://host.docker.internal:9000` already points at the host.

There is no authentication between the API and the generator. Keep it on a
private network, or put your own proxy in front.
