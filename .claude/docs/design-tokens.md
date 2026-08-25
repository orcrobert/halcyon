# Design tokens

Every colour and typeface in the frontend comes from
[`frontend/src/theme.css`](../../frontend/src/theme.css). Nothing else in
`frontend/src/` may hold a raw colour — no hex literals, no `rgb()`/`rgba()`,
no Tailwind palette classes (`text-slate-400`, `bg-indigo-500`). Change the
theme file once and the whole UI follows.

---

## The two layers

**Primitives** live in a plain `:root` block. They are the raw ramps and carry
no meaning beyond position on a scale:

| Ramp | Steps | What it is |
|------|-------|------------|
| `--surface-0…9` | dark → light | the near-black chrome: page, panels, borders |
| `--ink-0…9` | dark → light | the text scale, from barely-there captions to primary copy |
| `--accent-0…4` | deep → pale | the indigo used for anything interactive |
| `--brand-0…2` | deep → light | the three stops of the Halcyon mark gradient |
| `--danger-0…3` | deep → soft | destructive actions and errors |

**Semantic tokens** live in `@theme static` and are what components actually
reference. They alias the primitives:

- Surfaces — `--color-bg`, `--color-surface-sunken`, `--color-surface`,
  `--color-surface-raised`, `--color-surface-high`, `--color-surface-hover`,
  `--color-surface-danger`
- Borders — `--color-line-faint`, `--color-line-soft`, `--color-line`,
  `--color-line-hover`, `--color-line-active`, `--color-line-strong`
- Text — `--color-ink-bright`, `--color-ink`, `--color-ink-soft`,
  `--color-ink-dim`, `--color-ink-muted`, `--color-ink-faint`,
  `--color-ink-ghost`, `--color-ink-veil`, `--color-ink-trace`,
  `--color-ink-whisper`
- Accent — `--color-accent-deep`, `--color-accent`, `--color-accent-bright`,
  `--color-accent-soft`, `--color-accent-pale`
- Brand — `--color-brand-deep`, `--color-brand`, `--color-brand-light`
- Status — `--color-danger-deep`, `--color-danger`, `--color-danger-bright`,
  `--color-danger-soft`, `--color-success`, `--color-warn`
- Categories — `--color-tag-music`, `--color-tag-sound`,
  `--color-band-theta` / `-alpha` / `-beta` / `-gamma`
- Neutrals — `--color-wash` (white overlays), `--color-shade` (black shadows)

Type: `--font-sans`, `--font-mono`, `--font-display`, plus
`--font-weight-brand` and `--tracking-brand` for the wordmark.

To retint the whole app, edit a primitive ramp. To move one role onto a
different step, edit its alias. Adding a new colour means adding a token, not a
literal.

---

## Using them

Because the semantic tokens sit in `@theme`, Tailwind generates a utility for
each: `bg-surface`, `border-line`, `text-ink-dim`, `stroke-accent-bright`,
`bg-accent/15`. Prefer the utility.

Inline styles reference the variable directly:

```tsx
style={{ color: 'var(--color-ink-muted)' }}
```

Translucency uses `color-mix`, via the `alpha` helper in
[`frontend/src/theme.ts`](../../frontend/src/theme.ts):

```tsx
style={{ background: alpha('var(--color-accent)', 15) }}
```

`@theme static` (rather than plain `@theme`) is deliberate: Tailwind only emits
variables it sees used in a class, and most of these are consumed by inline
styles it cannot scan.

---

## Two constraints worth knowing

**SVG presentation attributes cannot take `var()`.** `fill="var(--color-accent)"`
silently does nothing. Put SVG colours in `style` (or use a Tailwind
`fill-*` / `stroke-*` class) instead:

```tsx
<circle style={{ fill: 'var(--color-accent)' }} />
```

**Canvas cannot take `var()` either** — a 2D context has no element to resolve
against. Resolve the token once when the effect mounts, using `token()` from
`theme.ts`:

```tsx
const accent = token('--color-accent')
ctx.fillStyle = alpha(accent, 80 * amp)
```

This applies to `Visualizer`, `GeneratingView`, and `Fader`.
