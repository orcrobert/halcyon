---
paths:
  - "frontend/**"
---

# Frontend rules

Applies to `frontend/`. The cross-cutting rules in `AGENTS.md` still hold.

## Checks

`npm run lint`, `npx tsc --noEmit` and `npm test` (vitest) from `frontend/`.
Pure scheduling and maths helpers (`hooks/eventScheduler.ts`,
`hooks/styleClip.ts`) are unit-tested; keep new pure logic in that shape.

## Styling

- **Colour and type come from `src/theme.css`.** No hex literals, no
  `rgb()`/`rgba()`, no Tailwind palette classes anywhere in `src/`. Use a token
  (`bg-surface`, `text-ink-dim`, `var(--color-accent)`) or the `alpha()` helper
  in `src/theme.ts`. SVG attributes and canvas contexts cannot resolve `var()`:
  see [design-tokens.md](../docs/design-tokens.md).
- **Phones get their own layout below 640 px.** `hooks/useIsMobile.ts` is the
  one breakpoint: layer strips become full-width rows with a horizontal fader,
  and the EQ panel switches to horizontal sliders (also on short landscape
  screens). Anchored popovers place themselves through
  `hooks/popoverPlacement.ts`, which flips them below the anchor, caps their
  height to the viewport and leaves the rest to scroll. Never rely on hover
  alone: anything a tooltip shows needs a tap path too.
- **The global reset in `index.css` beats Tailwind spacing.** `* { margin: 0;
  padding: 0 }` is unlayered, so `px-*`, `py-*` and `m*-auto` do nothing. Set
  spacing inline.
- **Themes are presets over the token ramps.** `src/themes.ts` holds twenty
  specs; `themeVariables()` expands each into the primitive layer in OKLab. Add
  a spec, never a hand-written ramp. The choice lives on `UserSettings.theme`
  and is mirrored to `localStorage` for first paint.
- **Reduce blur is a per-user flag applied through one root attribute.**
  `UserSettings.reduce_blur` is mirrored to `localStorage` like the theme, and
  `effects.ts` sets `data-reduce-blur` on `<html>`. `index.css` then drops every
  backdrop filter, makes `data-frosted` panels opaque and hides `data-glow`
  layers, and the canvases skip their shadow blur via `blurReduced()`. A new
  frosted panel needs `data-frosted`, and a new blur-only glow needs `data-glow`.

## The audio engine (`hooks/useAudioEngine.ts`)

- It is the imperative audio boundary; components stay presentational. Its
  parameter conventions and filter maths must match the Python `mixer`.
- **`eq_json` is a full band list.** Build every band into the biquad chain. The
  three sliders read and write only the 200/1k/8k bands and carry the rest
  through. Never collapse the list to three bands: that throws the auto-EQ away
  and reapplies its gains at the wrong frequencies.
  The sliders start at 0 because they are an offset on top of the mixer. The EQ
  panel draws the mixer's bands as a response curve (`hooks/eqResponse.ts`)
  and lists each with its `source` (`tone` or `masking`), which the PATCH
  schema keeps. A band with a `source` is never a slider band, even at
  200/1k/8k.
- **Stored loop clips carry padding the player must skip.** A decoder
  resampling a clip to the device rate starves at the first and last sample, so
  a seam that is clean in the file arrives as a tick once per loop, worst on the
  16 kHz `sound` layers. The API pads each end by `LOOP_PAD_S` and
  `Element.duration_s` stays the unpadded length, so derive the loop region as
  `(buffer.duration - duration_s) / 2` and play the interior. A file with no
  padding falls back to looping the whole buffer. One-shots are never padded.
- **Events are scheduled in the browser, never baked into a WAV.** An `event`
  element is one short clip with `playback: oneshot` and
  `interval_min_s`/`interval_max_s`. `hooks/eventScheduler.ts` is pure and
  unit-tested; the lane scheduler runs on `ctx.currentTime` with a lookahead, so
  `ctx.suspend()` pauses it with no extra state. Events bypass the SoundTouch
  worklet: global tuning is for tonal layers. Export plans triggers from a
  seeded PRNG so the same length renders the same file.
- **Released audio tracks must be disconnected.** The SoundTouch worklet never
  lets its processor go idle, so a track left connected after release keeps
  rendering, and each rebuild adds another one. `releaseTrack` disconnects the
  chain after its fade-out. Layers share one reverb convolver per context
  through their wet sends; do not go back to a convolver per track.
- `public/soundtouch-processor.js` is copied from `node_modules` by
  `npm run copy-worklets` on every dev start and build. Never edit it.

## Features that span the API

- **Style clip.** The prompt view lets the user upload audio and crop a
  1.5–4.5 s excerpt (`StyleClipModal`, maths in `hooks/styleClip.ts`); the
  browser renders it to a 32 kHz mono WAV and sends it as `style` on
  `POST /api/atmospheres`.
- **Layer review.** `ReviewLayersModal` edits a parked decomposition and
  `PUT`s it back; closing the modal deletes the atmosphere.
- **Clip quality.** The dashboard's `QualityModal` lists flagged layers and
  either re-renders them or dismisses the warning.
- **Admin views.** `GeneratorsCard` and `DecomposerCard` take an optional
  `userId` so the same card edits another account under `/api/admin/users/{id}/`.
- **Generators.** `hooks/generatorStore.ts` is the one copy of the generator
  list. `DeployToast` stays on screen while a redeploy is pending, running or
  failed, polls only while one runs, and sets `--deploy-toast-offset` so the
  page and the dashboard's error bar clear it.
- `src/types/index.ts` mirrors `api/app/models/schemas.py`. Change both together.
