---
paths:
  - "generators/**"
---

# Generator rules

Applies to `generators/`. The contract every generator implements is in
[SELF_HOSTING.md](../../SELF_HOSTING.md#the-generator-contract).

- **Four hosts over one package.** Generation logic belongs in
  `generators/core` (`halcyon_generator`). `colab/`, `local/`, `huggingface/`
  and `modal/` install it from git and stay thin. Never fix a generation bug in
  one host: fix `core` and they all inherit it.
- **Tests run without AudioCraft or a GPU:**
  `cd generators/core && pip install -e '.[dev]' && pytest`. CI runs them.
- **Readiness.** `GET /` answers `loaded: true` once the models are in memory.
  The API polls it during its `waking` stage before `POST /generate`, so keep it
  cheap and honest.
- **Replies may come back out of order.** The engine batches by
  `(type, seconds)`. Each reply echoes the element it was sent, including the
  API's `index` and `label`, so keep every field of the element in the reply.
- **Per-element `duration`** overrides the request-level `duration`, which
  overrides the host's configured default.
- **Style conditioning.** A `music` element may carry `style_b64`. The engine
  loads `STYLE_MODEL` on the first styled request, or in `load()` when
  `STYLE_PRELOAD` is set (the Modal default, so the weights are committed to the
  cache volume), and falls back to plain MusicGen when it has none.
- **Request options** (style closeness, prompt weight) arrive as `options` on
  `POST /generate`. **Deploy options** reach Modal as env vars through
  `generators/modal/deploy.py`. Both are declared in
  `api/app/services/generator_options.py`.
- **The AudioCraft stack is pinned** (`torch==2.1.2` and friends in the
  `audiocraft` extra and `huggingface/requirements.txt`). Do not float these;
  AudioCraft breaks on newer torch.
- The Docker image ships `generators/core` and `modal/deploy.py` so the API can
  run `modal deploy`. Keep `deploy.py` importable from there.
