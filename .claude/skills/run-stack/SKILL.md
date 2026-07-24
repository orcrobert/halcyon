---
name: run-stack
description: Bring up the full Halcyon stack locally (frontend, Laravel API + queue worker, FastAPI AI service, Colab generator). Use when asked to run, start, or smoke-test the app end to end.
---

# Run the stack

Full detail in [MANUAL.md](../../../MANUAL.md). This is the operational checklist.

## Order of startup

Bring services up bottom-up so a submitted prompt has everything it needs.

1. **Colab generator** — run all cells in
   `colab/soundscape_generator.ipynb`, copy the printed **ngrok URL** into
   `COLAB_URL` in the repo-root `.env`.

2. **AI service** (reads repo-root `.env`; needs a non-empty `AI_SERVICE_SECRET`):
   ```bash
   source .venv/bin/activate
   uvicorn ai.app.main:app --reload --port 8001
   ```
   Sanity check: `curl localhost:8001/health` → `{"status":"ok"}`.

3. **Backend** — API and queue worker are **two processes**; the worker is
   mandatory or generation never starts:
   ```bash
   cd backend
   php artisan serve          # API
   php artisan queue:work     # worker (separate terminal)
   ```
   Ensure `backend/.env` has `AI_SERVICE_URL` (e.g. `http://localhost:8001`) and
   a matching `AI_SERVICE_SECRET`.

4. **Frontend**:
   ```bash
   cd frontend && npm run dev
   ```

## Smoke test

1. Open the Vite URL, register, submit a simple prompt (e.g. "distant foghorn").
2. Watch the generating view poll to `ready`.
3. On the dashboard: play/pause, move a fader/EQ/pan, toggle binaural, export.

## Fast failure triage

| Symptom | Check |
|---------|-------|
| Stuck `pending` | Is `php artisan queue:work` running? |
| Fails after minutes | Is `COLAB_URL` current and the notebook alive? |
| Every request 500 | `AI_SERVICE_SECRET` set on both sides? |
| Request 401 | Secret mismatch between `.env` and `backend/.env` |
| No audio | Interact with page (autoplay); is `public/soundtouch-processor.js` present? |

See MANUAL.md §6 for the full troubleshooting table.
