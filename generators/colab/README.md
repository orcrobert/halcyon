# Halcyon generator — Colab

The fastest way to get a working generator, and free. The catch is that the URL
dies with the session: close the tab or let Colab time out and you need a new
one.

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/orcrobert/halcyon/blob/main/generators/colab/halcyon_generator.ipynb)

## Run it

1. Open the notebook with the badge above.
2. **Runtime → Change runtime type → T4 GPU.** Without this it loads on CPU and
   every request times out.
3. Put your [ngrok token](https://dashboard.ngrok.com/get-started/your-authtoken)
   in the config cell.
4. **Runtime → Run all.** Model loading takes a few minutes.
5. Copy the `GENERATOR_URL=…` line the last cell prints.

In Halcyon, go to **Account → Audio generator**, add a **Google Colab**
generator, and paste it. Leave `GITHUB_TOKEN` in the first cell empty; it is
only for installing from a private fork.

## When the URL changes

It changes every session. Rather than adding a new generator each time, edit the
URL on the Colab entry you already saved — the account page shows an inline URL
box on Colab generators for exactly this. Everything else about the profile
stays put.

## Configuration

The config cell sets the same environment variables every other host uses:

| Variable | Default |
|----------|---------|
| `AUDIOGEN_MODEL` | `facebook/audiogen-medium` |
| `MUSICGEN_MODEL` | `facebook/musicgen-large` |
| `STYLE_MODEL` | `facebook/musicgen-style` |
| `GENERATION_DURATION` | `10` |
| `GENERATION_LOUDNESS_LUFS` | `-20` |

The rest of the variables in [../README.md](../README.md#configuration) work
too; set them in the same cell.

On a free T4, `musicgen-large` is tight. If loading runs out of VRAM, drop to
`facebook/musicgen-medium`.

## Notes

The notebook installs `halcyon-generator` from this repository and calls
`create_app()`; it does not carry its own copy of the server. Your runtime, your
ngrok token, your models — nothing is written back here.
