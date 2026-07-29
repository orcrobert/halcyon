# frontend

The Halcyon UI and the browser audio engine: React 19 + TypeScript + Vite +
Tailwind, talking to the FastAPI service in [`../api`](../api).

In production the API serves the built assets from `dist/`; the dev server below
exists only for development.

## Run

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to the API on :8001
```

The API must be running (`uvicorn api.app.main:app --port 8001` from the repo
root). Because the dev server proxies `/api`, the browser only ever sees one
origin and CORS never applies. Set `VITE_DEV_HOST` for a custom dev domain, and
see [`.env.example`](.env.example) for the rest.

```bash
npm run build    # -> dist/, which the API serves at :8001
npm run lint
npx tsc --noEmit
```

`npm run dev` and `npm run build` both run `copy-worklets` first, which copies
the SoundTouch pitch-shift processor into `public/`. Without it there is no
audio — the worklet is fetched at runtime from `/soundtouch-processor.js`.

## Layout

| Path              | Role |
|-------------------|------|
| `src/api/`        | Typed HTTP client, bearer-token storage, error mapping |
| `src/auth/`       | Auth context and session state |
| `src/hooks/`      | `useAudioEngine` (the Web Audio graph) and `useDebouncedPatcher` |
| `src/components/` | Presentational views and mixer controls |
| `src/types/`      | Mirror of `api/app/models/schemas.py` — the API contract |

`useAudioEngine.ts` is the imperative audio boundary: decode, graph
construction, EQ/pan/depth/tuning, binaural beats, the animate drift loop, and
offline WAV export. Everything else stays presentational.

Two mixing engines exist — this one for live playback, and the Python
[`mixer`](../mixer) at generation time. Their parameter conventions must stay
aligned (EQ bands at 200/1k/8k Hz, pan −1..1, depth 0..1).

## More

- [MANUAL.md](../MANUAL.md) — setup and run guide for the whole stack
- [`.claude/docs/conventions.md`](../.claude/docs/conventions.md) — coding standards
