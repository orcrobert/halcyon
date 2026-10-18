import type { Atmosphere, Element } from '../types'
import { Mark } from '../components/Logo'
import { auraOf, barsOf, loopLabel } from './catalog'

interface Props {
  soundscapes: Atmosphere[] | null
  error: string | null
  openingId: number | null
  onOpen: (atmosphere: Atmosphere) => void
  onOpenTheme: () => void
}

const CONTAINER: React.CSSProperties = { maxWidth: 1120, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }

const STEPS: { title: string; body: string }[] = [
  { title: 'Describe a place', body: 'One sentence, the way you would say it out loud.' },
  { title: 'It becomes layers', body: 'A language model splits the scene into sounds and music, each generated on its own.' },
  { title: 'Mixed from the audio', body: 'EQ, level and placement come from analysing every clip, so the layers sit together.' },
]

function dotColor(el: Element): string {
  if (el.playback === 'oneshot') return 'var(--color-tag-event)'
  if (el.type === 'music') return 'var(--color-tag-music)'
  return 'var(--color-tag-sound)'
}

function Artwork({ atmosphere, opening }: { atmosphere: Atmosphere; opening: boolean }) {
  const bars = barsOf(atmosphere.prompt, 36)
  const layers = (atmosphere.elements ?? []).length

  return (
    <div className="relative overflow-hidden" style={{ height: 156, background: 'var(--color-surface-sunken)' }}>
      <div aria-hidden className="absolute inset-0" style={{ background: auraOf(atmosphere.prompt) }} />
      <svg
        aria-hidden
        className="absolute opacity-60 group-hover:opacity-90 transition-opacity duration-500"
        viewBox={`0 0 ${bars.length * 6} 60`}
        preserveAspectRatio="none"
        style={{ left: 20, bottom: 20, height: 52, width: 'calc(100% - 96px)' }}
      >
        {bars.map((h, i) => (
          <rect key={i} x={i * 6 + 1} y={60 - h * 60} width={3} height={h * 60} rx={1.5} style={{ fill: 'var(--color-accent-soft)' }} />
        ))}
      </svg>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{ height: 48, background: 'linear-gradient(to top, var(--color-surface), transparent)' }}
      />

      <span
        className="absolute text-[11px] text-ink-soft rounded-full"
        style={{
          top: 14, left: 14, padding: '4px 10px',
          background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
        }}
      >
        {layers} layers · {loopLabel(atmosphere.duration_s)}
      </span>

      <span
        className="absolute flex items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105"
        style={{
          right: 16, bottom: 16, width: 44, height: 44,
          background: 'var(--color-accent)',
          color: 'var(--color-bg)',
          boxShadow: '0 10px 24px color-mix(in srgb, var(--color-accent) 35%, transparent)',
        }}
      >
        {opening ? (
          <span className="w-4 h-4 rounded-full border-2 border-current animate-spin" style={{ borderTopColor: 'transparent' }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
            <polygon points="6,4 20,12 6,20" />
          </svg>
        )}
      </span>
    </div>
  )
}

function Card({ atmosphere, opening, disabled, onOpen }: {
  atmosphere: Atmosphere
  opening: boolean
  disabled: boolean
  onOpen: () => void
}) {
  const elements = atmosphere.elements ?? []

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={`Play ${atmosphere.title ?? atmosphere.prompt}`}
      className="group flex flex-col text-left rounded-2xl border border-line-soft hover:border-accent/40 bg-surface overflow-hidden transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-wait"
      style={{
        fontFamily: 'inherit',
        boxShadow: '0 12px 28px color-mix(in srgb, var(--color-shade) 18%, transparent)',
      }}
    >
      <Artwork atmosphere={atmosphere} opening={opening} />

      <div className="flex flex-col flex-1" style={{ padding: '16px 20px 20px', gap: 10 }}>
        <h3 className="text-[16px] font-semibold text-ink-bright leading-snug line-clamp-2" style={{ letterSpacing: '-0.01em' }}>
          {atmosphere.title ?? atmosphere.prompt}
        </h3>
        {atmosphere.title && (
          <p className="text-[12.5px] text-ink-faint leading-relaxed line-clamp-2">
            “{atmosphere.prompt}”
          </p>
        )}
        <ul className="flex flex-wrap text-[11.5px] text-ink-dim" style={{ gap: '6px 14px', marginTop: 'auto', paddingTop: 4 }}>
          {elements.map((el) => (
            <li key={el.id} className="flex items-center" style={{ gap: 6 }}>
              <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: dotColor(el) }} />
              {el.label}
            </li>
          ))}
        </ul>
      </div>
    </button>
  )
}

export function Gallery({ soundscapes, error, openingId, onOpen, onOpenTheme }: Props) {
  const count = soundscapes?.length ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header style={{ ...CONTAINER, width: '100%', paddingTop: 20, paddingBottom: 20 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center" style={{ gap: 10 }}>
            <Mark size={20} />
            <span
              className="text-wash/90"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 'var(--font-weight-brand)',
                letterSpacing: 'var(--tracking-brand)',
                textTransform: 'uppercase',
              }}
            >
              Halcyon
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.16em] text-accent-soft rounded-full"
              style={{
                padding: '3px 9px',
                marginLeft: 4,
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              }}
            >
              Demo
            </span>
          </div>
          <button
            onClick={onOpenTheme}
            className="flex items-center text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl transition-all duration-150"
            style={{ fontFamily: 'inherit', padding: '8px 14px', gap: 8 }}
          >
            <ThemeIcon />
            <span className="hidden sm:block">Theme</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full" style={{ ...CONTAINER, paddingTop: 48, paddingBottom: 72 }}>
        <section className="flex flex-col" style={{ gap: 18, maxWidth: 640 }}>
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-ghost">Listening room</span>
          <h1
            className="font-semibold text-ink-bright"
            style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.05, letterSpacing: '-0.03em', textWrap: 'balance' }}
          >
            Ambient worlds, written in one sentence.
          </h1>
          <p className="text-[15px] text-ink-dim leading-relaxed" style={{ maxWidth: 520 }}>
            Every soundscape here started as the prompt on its card. Open one to listen and remix it with faders,
            EQ, space and tuning. Generation is off in the demo, and nothing you change is saved.
          </p>
        </section>

        <ol
          className="border-t border-b border-line-faint"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
            marginTop: 40,
            padding: '22px 0',
          }}
        >
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex" style={{ gap: 14 }}>
              <span className="text-[11px] text-accent-soft" style={{ fontFamily: 'var(--font-mono)', paddingTop: 2 }}>
                0{i + 1}
              </span>
              <span className="flex flex-col" style={{ gap: 4 }}>
                <span className="text-[13px] font-medium text-ink">{step.title}</span>
                <span className="text-[12px] text-ink-faint leading-relaxed">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-baseline justify-between" style={{ marginTop: 48, marginBottom: 18 }}>
          <h2 className="text-[13px] font-semibold text-ink tracking-tight">Soundscapes</h2>
          {count > 0 && <span className="text-[11px] text-ink-ghost">{count} to explore</span>}
        </div>

        {error && <p className="text-[13px] text-danger-soft">{error}</p>}

        {soundscapes === null && !error && (
          <p className="text-[13px] text-ink-ghost">Loading soundscapes…</p>
        )}

        {soundscapes !== null && count === 0 && (
          <p className="text-[13px] text-ink-ghost">No soundscapes have been published yet.</p>
        )}

        {count > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {soundscapes!.map((a) => (
              <Card
                key={a.id}
                atmosphere={a}
                opening={openingId === a.id}
                disabled={openingId !== null}
                onOpen={() => onOpen(a)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-line-faint">
        <div
          className="flex flex-wrap items-center justify-between text-[11px] text-ink-ghost"
          style={{ ...CONTAINER, paddingTop: 18, paddingBottom: 18, gap: 8 }}
        >
          <span>Halcyon demo · generation is turned off</span>
          <span>Best with headphones</span>
        </div>
      </footer>
    </div>
  )
}

export function ThemeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  )
}
