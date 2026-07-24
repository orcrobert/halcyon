# Architecture

Definitive reference for how the system fits together. Skim
[CLAUDE.md](../../CLAUDE.md) first for the summary.

---

## Components and responsibilities

### `frontend/` — React + Web Audio
- **Views** (`components/`): `AuthView`, `PromptView`, `GeneratingView`,
  `DashboardView`, `HistoryPanel`, plus mixing controls (`TrackStrip`, `Fader`,
  `EQPanel`, `PanKnob`, `SpatialPad`/`SpatialModal`, `TuningControl`,
  `BinauralModal`, `Visualizer`).
- **State machine**: `App.tsx` drives three views — `prompt → generating →
  dashboard` — plus history and binaural state. It owns polling and the
  atmosphere object.
- **Audio engine**: `hooks/useAudioEngine.ts` is the heart of playback. It
  decodes element WAVs, builds one Web Audio graph per track
  (`source → SoundTouch pitch → 3-band EQ → gain → reverb send/dry → panner →
  analyser → limiter → destination`), and exposes imperative setters
  (`setVolume`, `setEQ`, `setPan`, `setDepth`, `setTuning`), an autonomous
  `startAnimate` drift loop, binaural oscillators, and an offline `exportMix`.
- **Persistence of edits**: `hooks/useDebouncedPatcher.ts` batches mix edits and
  `PATCH`es them to the backend (250 ms debounce, flush on unload).
- **API layer** (`api/`): `client.ts` (axios + Sanctum CSRF handling with a 419
  retry), `atmospheres.ts` (create/get/poll/delete), `elements.ts`, `auth.ts`.
- **Contract**: `types/index.ts` mirrors the Laravel resources. Treat it as the
  single source of truth for the client-side API shape.

### `backend/` — Laravel API
- **Auth**: Sanctum session-based; `AuthController` (register/login/logout/me).
- **Domain**: `Atmosphere` has many `Element`; each atmosphere has one
  `GenerationJob`. `StyleClip` is an optional style reference. `original_*`
  columns on `Element` store the mixer's computed defaults so the UI can reset.
- **Endpoints** (`routes/api.php`): atmospheres CRUD, element `PATCH`/`reset`,
  and a **public, signed** `GET /elements/{element}/audio` for streaming audio.
- **Generation**: `AtmosphereController::store` creates the row + job and
  dispatches `GenerateAtmosphereJob` (queued). The job calls the AI service,
  persists elements + audio to storage, and flips status to `ready`/`failed`.
- **Resources**: `AtmosphereResource` / `ElementResource` shape the JSON,
  including signed audio URLs.

### `ai/` — FastAPI orchestration
- **`main.py`**: app + CORS + a middleware requiring `X-AI-Service-Secret` on
  everything except `/health` and docs.
- **`routers/sessions.py`**: the `POST /generate` endpoint (decompose → generate
  → analyze → return base64 audio + params). *(Note: file name is legacy; it
  serves generation, not sessions — see AUDIT.)*
- **`services/decomposer.py`**: loads `prompts/decomposer.txt`, calls Gemini or
  Ollama, parses/validates the element list (type normalization, required
  fields, defaults).
- **`services/generator.py`**: forwards decomposed elements to the Colab
  generator and decodes the returned audio.
- **Config**: `config.py` (pydantic-settings) reads the repo-root `.env`.

### `mixer/` — the DSP core (standalone package)
Public API in `mixer/mixer/core.py`:
- `analyze(elements)` → makes each clip loopable, computes per-element EQ
  (`effects/auto_eq.py`), volume (`effects/volume.py`), and spatial pan/depth
  (`effects/spatial.py`); annotates the element dicts in place.
- `mix_to_file(elements, path)` → renders a single mixed WAV (resample → EQ →
  pan → volume → sum → peak-normalize).

Effects:
- **`auto_eq.py`**: ERB-band analysis with A-weighting; two stages — *tonal
  shaping* (tame sub/air/boxy/harsh per element type) and *masking cuts*
  (pairwise spreading-function masking, music weighted slightly higher) — merged
  into a compact EQ band list per element.
- **`volume.py`**: perceptual weighting (mid energy, onset density, bandwidth,
  type) → target dB per element relative to the loudest-weighted anchor, minus a
  spectral-overlap penalty, clamped to a gain range.
- **`spatial.py`**: per-element spectral features → a `reach` score drives pan
  placement (alternating sides, spectral-similarity clustering, minimum
  separation); loudness/HF/onset drive `depth`. Degrades to centre/no-depth if
  `librosa` is missing.
- **`looping.py`**: cross-correlation loop-point search + equal-power crossfade
  so every clip loops seamlessly (infinite playback).

### `colab/` — reference generator
Runs AudioGen (sound) and MusicGen (music) from Meta's AudioCraft, exposes
`POST /generate` over ngrok. It is one implementation of the generator contract;
the `ai/` service treats any generator as a black box behind `GENERATOR_URL`
(legacy alias `COLAB_URL`). See [SELF_HOSTING.md](../../SELF_HOSTING.md#the-generator-contract).

### Research
- `experiments/llm_eval/` — decomposition benchmark (prompts, per-run JSON,
  scoring).
- `pan_model/`, `notebooks/`, `scripts/train_spatial_model.py` — the learned
  spatial-placement experiment (negative result).

---

## Request lifecycle (generation)

```
Frontend                Laravel                 AI service            Colab
   │  POST /atmospheres    │                        │                   │
   ├──────────────────────▶│ create + queue job     │                   │
   │◀─ 202 (pending) ──────┤                        │                   │
   │  poll GET /{id} ──────▶│ (worker picks up job)  │                   │
   │                        ├── POST /generate ─────▶│ decompose         │
   │                        │                        ├── POST /generate ▶│
   │                        │                        │◀── wavs (b64) ────┤
   │                        │                        │ mixer.analyze()   │
   │                        │◀── elements + params ──┤                   │
   │                        │ persist + status=ready │                   │
   │◀─ ready + elements ────┤                        │                   │
   │  fetch signed audio, build graph, play          │                   │
```

---

## Key parameter conventions (keep both engines aligned)

| Parameter | Range / value | Where |
|-----------|---------------|-------|
| EQ bands  | lowshelf 200 Hz, peaking 1 kHz (Q 1.4), highshelf 8 kHz | frontend `createFilters`, mixer `apply_eq` |
| Pan       | −1 (L) .. +1 (R), equal-power | both engines |
| Depth     | 0 .. 1 (reverb send) | frontend reverb, mixer `depth` |
| Volume    | 0 .. 2 (UI), stored gain; playback scales by 0.5 | `useAudioEngine` |
| Tuning    | 400–580 Hz, 6 Hz snap, presets 432/440/528 | `TuningControl` + SoundTouch |
| Binaural  | 200/208 Hz default, gain 0.15, 10 presets | `useAudioEngine` |
| Loop      | 3 s search window, 1.5 s crossfade | `looping.py` |
| Poll      | 1.5 s interval, 20 s stuck-pending guard, 10 min timeout | `atmospheres.ts` |
| Job       | `tries=1`, `timeout=600 s` | `GenerateAtmosphereJob` |

There are **two mixing implementations** (Python at generation time, browser for
live/export). They must stay conceptually aligned. Divergence between them is a
known correctness risk (see AUDIT).

---

## Trust boundaries

- Browser ↔ Laravel: Sanctum session cookies + CSRF; ownership checks on every
  atmosphere/element route; audio served via **signed** URLs scoped to the owner.
- Laravel ↔ AI service: shared `AI_SERVICE_SECRET` header.
- AI service ↔ generator: `GENERATOR_URL` only (no auth by default — run it on a
  private network or add your own).
- Never expose the AI service or generator publicly without protection.
