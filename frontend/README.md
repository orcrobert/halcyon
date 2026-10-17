# frontend

The Halcyon UI and the browser audio engine: React 19 + TypeScript + Vite +
Tailwind, talking to the FastAPI service in [`../api`](../api).

In production the API serves the built assets from `dist/`; the dev server below
exists only for development.

## Run

Needs Node.js 22.12 or newer (Vite 8); CI and the image use 24.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to the API on :8001
```

The API must be running (`uvicorn api.app.main:app --port 8001` from the repo
root). Because the dev server proxies `/api`, the browser only ever sees one
origin and CORS never applies. Copy [`.env.example`](.env.example) to `.env.local` to
set `VITE_DEV_HOST` (a custom dev domain), `VITE_DEV_API_TARGET` (an API on
another port) or `VITE_API_URL` (a UI hosted apart from the API).

```bash
npm run build    # -> dist/, which the API serves at :8001
npm run lint
npx tsc --noEmit
npm test         # vitest
```

`npm run dev` and `npm run build` both run `copy-worklets` first, which copies
the SoundTouch pitch-shift processor into `public/`. Without it there is no
audio — the worklet is fetched at runtime from `/soundtouch-processor.js`.

## Layout

| Path              | Role |
|-------------------|------|
| `src/api/`        | Typed HTTP client, bearer-token storage, error mapping |
| `src/auth/`       | Auth context and session state |
| `src/hooks/`      | `useAudioEngine` (the Web Audio graph), `useDebouncedPatcher`, `eventScheduler`, `styleClip`, `generatorStore` |
| `src/components/` | Presentational views and mixer controls |
| `src/types/`      | Mirror of `api/app/models/schemas.py` — the API contract |
| `src/theme.css`, `src/themes.ts` | Colour and type tokens and the twenty theme presets |
| `src/__tests__/`, `src/hooks/__tests__/` | vitest suites for the pure modules |

`useAudioEngine.ts` is the imperative audio boundary: decode, graph
construction, EQ/pan/depth/tuning, binaural beats, the animate drift loop, and
offline WAV export. Everything else stays presentational.

Two mixing engines exist — this one for live playback, and the Python
[`mixer`](../mixer) at generation time. Their parameter conventions must stay
aligned (`eq_json` as a full band list with the sliders on 200/1k/8k Hz,
pan −1..1, depth 0..1).

## More

- [MANUAL.md](../MANUAL.md) — setup and run guide for the whole stack
- [`.claude/docs/conventions.md`](../.claude/docs/conventions.md) — coding standards
- [`.claude/rules/frontend.md`](../.claude/rules/frontend.md) — the rules for this directory
- [`.claude/docs/design-tokens.md`](../.claude/docs/design-tokens.md) — colour and type tokens
