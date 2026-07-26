---
name: run-stack
description: Bring up the Halcyon stack locally (FastAPI API, Vite dev server, your own generator). Use when asked to run, start, or smoke-test the app end to end.
---

# Run the stack

Full detail in [MANUAL.md](../../../MANUAL.md). This is the operational checklist.

## Order of startup

Bring services up bottom-up so a submitted prompt has everything it needs.

1. **Generator** — start your own (see [SELF_HOSTING.md](../../../SELF_HOSTING.md#the-generator-contract))
   or run all cells in `colab/soundscape_generator.ipynb`, then put its URL in
   `GENERATOR_URL` (legacy alias `COLAB_URL`) in the repo-root `.env`.

2. **API** (reads the repo-root `.env`; creates its database on first boot):
   ```bash
   source .venv/bin/activate
   uvicorn api.app.main:app --reload --port 8001
   ```
   Sanity check: `curl localhost:8001/health` → `{"status":"ok"}`.

   Generation runs on a worker thread inside this process. There is no second
   process to start.

3. **Frontend** — only for development. The dev server proxies `/api` to
   port 8001:
   ```bash
   cd frontend && npm run dev
   ```

   To exercise the production path instead, `npm run build` and open
   <http://localhost:8001> directly — the API serves the build.

## Smoke test

1. Open the Vite URL, register, submit a simple prompt (e.g. "distant foghorn").
2. Watch the generating view poll to `ready`.
3. On the dashboard: play/pause, move a fader/EQ/pan, toggle binaural, export.
4. Reload — the mix edits should have persisted.

## Fast failure triage

| Symptom | Check |
|---------|-------|
| Fails immediately with a key error | Is a key set for the chosen provider, in `.env` or the account panel? |
| Fails after minutes | Is `GENERATOR_URL` current and the generator alive? |
| Failed with "interrupted by a server restart" | The API restarted mid-run; generate again |
| 401 on everything | Token cleared or revoked — sign in again |
| Blank page on :8001 | No `frontend/dist` build |
| No audio | Interact with page (autoplay); is `public/soundtouch-processor.js` present? |

See MANUAL.md §6 for the full troubleshooting table.
