# Project audit

Findings from a full-repository review, kept as the cleanup backlog. Grouped by
theme, tagged by severity (🔴 high / 🟡 medium / 🟢 low) and whether a fix is
**safe** (behaviour-preserving, low risk) or **risky** (could change behaviour /
needs care — this is a thesis project with almost no tests).

Nothing here blocks the app from running today; these are quality, correctness,
and repo-hygiene items.

---

## Dead code / legacy

- 🟡 **`ai/app/sessions/store.py` is entirely unused.** An in-memory session
  store (`create_session`, etc.) imported by nothing. *Safe: delete the
  `sessions/` package.*
- 🟡 **`ai/app/routers/sessions.py` is misnamed.** It defines `POST /generate`,
  not sessions. *Safe: rename to `routers/generate.py` and update the import in
  `main.py`.*
- 🟡 **`mixer/effects/spatial.py::predict_pan` always returns `0.0`** and
  `predict_and_apply` is unused legacy from the abandoned learned-pan approach.
  *Safe: remove both; keep `apply_pan` and `assign_spatial`.*
- 🟢 **`mixer/models/*.pkl` + `pan_model/` are a documented negative result** but
  sit alongside production code with no marker. *Safe: add a README to
  `pan_model/` stating it's an experiment; the shipped mixer is heuristic.*

## Coupling / structure

- 🔴 **`ai/app/routers/generate.py` imports the mixer via a `sys.path.insert`
  hack** (`parents[3] / "mixer"`). Fragile and non-portable. *Safe-ish: declare
  `halcyon-mixer` as a dependency of `ai/` (editable install / path dep) and
  `from mixer.core import analyze` normally. Requires updating `ai/pyproject.toml`
  and the dev setup.*
- 🟡 **`ai/app/services/generator.py` writes WAVs and a global
  `output/session.json` to local disk on every request**, even though the audio
  is already returned as base64 and persisted by Laravel. The single shared
  `session.json` is overwritten by concurrent generations (not concurrency-safe)
  and couples a stateless service to a local filesystem. *Risky: removing the
  disk writes changes behaviour if anything downstream reads `output/`; verify
  nothing depends on it (the Colab notebook / scripts may). Likely
  safe to drop the `session.json` write; keep or gate the WAV cache behind a
  flag.*
- 🟢 **`OUTPUT_DIR` in `.env.example`/config exists only for that disk write.**
  Remove alongside the above.

## Correctness / bugs

- 🔴 **Play/pause is inconsistent in `useAudioEngine.ts`.** `pause()` uses
  `ctx.suspend()` (preserves position) but `unpause()` calls `startFromDecoded`,
  which tears down and rebuilds every track from sample 0. Result: playback
  restarts from the top on resume instead of continuing. `App.tsx::handlePlayPause`
  also calls `start()` then `unpause()`, risking a double rebuild. *Risky:
  reconcile to a single resume path (`ctx.resume()` without rebuilding when tracks
  exist). Needs manual audio verification.*
- 🟡 **`sanitize_label` filename collisions** in `generator.py`: labels differing
  only by punctuation map to the same `<atmosphere>_<label>.wav` and silently
  overwrite. *Safe: include the element index or a hash in the filename (only
  matters while the disk write exists).*
- 🟡 **Fragile JSON extraction** in `decomposer.py::_parse_result`
  (`re.search(r"\{.*\}", ...)` greedy/DOTALL) even though both providers are
  already forced into JSON mode. Can mis-slice on nested braces. *Safe: try
  `json.loads` on the whole response first, fall back to the regex.*
- 🟡 **`GenerateAtmosphereJob` has `tries=1`** against the flaky Colab+ngrok
  link — a single transient failure kills the whole generation. *Risky: adding
  retries/backoff changes failure semantics and could double-charge GPU time;
  decide deliberately.*
- 🟢 **Two mixing engines can drift.** The Python mixer peak-normalizes; the
  browser uses a −4 dB 20:1 limiter. Backend `mix_to_file` and browser export can
  differ in loudness. *Risky: align intentionally; document the canonical chain.*

## Frontend maintainability

- 🟡 **`useAudioEngine.ts` is a 550-line monolith** doing decode, graph
  construction, EQ, pan, reverb, tuning, binaural, animation, and offline export
  in one hook. *Risky but high value: extract cohesive units (graph builder,
  binaural, animation, export) behind the same public surface. Do incrementally
  with audio verification.*
- 🟢 **Duplicated magic constants** — the `* 0.5` gain scale and reverb
  coefficients (`1 - depth*0.7`, `depth*0.6`) are repeated across
  `startFromDecoded`, `setVolume`, `setDepth`, `startAnimate`, `exportMix`. *Safe:
  hoist to named constants / small helpers.*
- 🟢 **`preload`'s dependency array lists `getContext` but the callback doesn't
  use it directly.** Minor; tidy while refactoring.

## Backend / data

- 🟡 **Three migrations share the timestamp `2026_05_02_132114`**
  (atmospheres, elements, generation_jobs). Ordering currently works by filename
  but is fragile. *Risky: renaming applied migrations desyncs existing databases;
  only fix on a fresh migration history or leave as-is and note it.*
- 🟢 **Stock READMEs.** `backend/README.md` is the Laravel boilerplate and
  `frontend/README.md` is the Vite template; neither documents this project.
  *Safe: replace with project-specific notes (or point to root docs).*

## Repo hygiene

- 🔴 **No root `README.md`.** The repo has no top-level entry point describing
  what it is or how to run it. *Safe: add one (overview, quickstart → MANUAL.md,
  license, architecture link).*
- 🟡 **No `LICENSE` at the repo root.** *Safe: add one (author's choice).*
- 🟢 **No test coverage for the mixer.** Only Laravel example stubs exist; the
  mixer (auto_eq/volume/spatial/looping) has zero tests despite being the core of
  the system. *Safe and high value: add `pytest` regression tests for the
  mixer.*
- 🟢 **`.DS_Store` files and macOS "keep both" duplicates** (`favicon 2.svg`,
  `index 2.html`, `icons 2.svg` under `frontend/dist/`, and `frontend/public/`)
  litter the tree. Gitignored, but worth cleaning locally.
- 🟢 **No CI.** No automated lint/test on push. *Safe: add a minimal GitHub
  Actions workflow (lint frontend, test backend, pytest mixer).*

---

## Suggested refactor order (safest first)

1. Root `README.md` + `LICENSE`; project READMEs for `backend/`/`frontend/`. (docs)
2. Delete dead code: `ai/app/sessions/`, `predict_pan`/`predict_and_apply`. (safe)
3. Rename `routers/sessions.py` → `routers/generate.py`. (safe)
4. Mixer as a real dependency of `ai/`; drop the `sys.path` hack. (safe-ish)
5. Add `pytest` regression tests for the mixer. (safe, enables the rest)
6. Robust JSON parsing in the decomposer. (safe)
7. Centralize frontend audio constants. (safe)
8. Then, with tests in place and manual audio checks: play/pause fix, generator
   disk-write removal, `useAudioEngine` decomposition, engine alignment. (risky)
