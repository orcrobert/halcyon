import type { Atmosphere, Element } from '../types'
import { Logo } from '../components/Logo'
import { auraOf, loopLabel } from './catalog'

interface Props {
  soundscapes: Atmosphere[] | null
  error: string | null
  openingId: number | null
  onOpen: (atmosphere: Atmosphere) => void
  onOpenTheme: () => void
}

function chipClass(el: Element): string {
  if (el.playback === 'oneshot') return 'bg-tag-event/10 text-tag-event'
  if (el.type === 'music') return 'bg-tag-music/10 text-tag-music'
  return 'bg-tag-sound/10 text-tag-sound'
}

function Card({ atmosphere, opening, disabled, onOpen }: {
  atmosphere: Atmosphere
  opening: boolean
  disabled: boolean
  onOpen: () => void
}) {
  const elements = atmosphere.elements ?? []
  const shown = elements.slice(0, 5)
  const more = elements.length - shown.length

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="group relative flex flex-col text-left rounded-2xl border border-line-soft hover:border-accent/40 bg-surface overflow-hidden transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-wait"
      style={{
        fontFamily: 'inherit',
        boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 30%, transparent)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: auraOf(atmosphere.prompt) }}
      />

      <div className="relative flex flex-col gap-4 flex-1" style={{ padding: '22px' }}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-ink-bright leading-snug" style={{ letterSpacing: '-0.01em' }}>
            {atmosphere.title ?? atmosphere.prompt}
          </h2>
          <span
            className="shrink-0 flex items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent-bright group-hover:bg-accent/20 transition-colors"
            style={{ width: 34, height: 34 }}
          >
            {opening ? (
              <span className="w-3 h-3 rounded-full border-2 border-accent-bright border-t-transparent animate-spin" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </span>
        </div>

        <p className="text-[13px] text-ink-dim leading-relaxed line-clamp-3 italic">
          “{atmosphere.prompt}”
        </p>

        <div className="flex flex-wrap gap-1.5 mt-auto">
          {shown.map((el) => (
            <span key={el.id} className={`text-[10.5px] rounded-md ${chipClass(el)}`} style={{ padding: '2px 8px' }}>
              {el.label}
            </span>
          ))}
          {more > 0 && (
            <span className="text-[10.5px] rounded-md bg-wash/[0.04] text-ink-faint" style={{ padding: '2px 8px' }}>+{more}</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-ink-ghost">
          <span>{elements.length} layers</span>
          <span aria-hidden>·</span>
          <span>{loopLabel(atmosphere.duration_s)}</span>
        </div>
      </div>
    </button>
  )
}

export function Gallery({ soundscapes, error, openingId, onOpen, onOpenTheme }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="flex items-center justify-between" style={{ padding: '18px 32px' }}>
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint border border-line rounded-full" style={{ padding: '5px 12px' }}>
          Demo
        </span>
        <button
          onClick={onOpenTheme}
          className="flex items-center gap-2 text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl transition-all duration-150"
          style={{ fontFamily: 'inherit', padding: '8px 14px' }}
        >
          <ThemeIcon />
          <span className="hidden sm:block">Theme</span>
        </button>
      </header>

      <main className="flex-1 w-full mx-auto flex flex-col gap-12" style={{ maxWidth: '1080px', padding: '32px 24px 64px' }}>
        <div className="flex flex-col items-center gap-5 text-center">
          <Logo size={30} tagline="Describe a place in a sentence and Halcyon builds it as a living, layered soundscape that loops forever." />
          <p className="text-[12.5px] text-ink-faint leading-relaxed" style={{ maxWidth: '460px' }}>
            Each one below came from the prompt on its card and was mixed automatically.
            Open one to listen and remix it: faders, EQ, space, tuning. Nothing you change is saved.
          </p>
        </div>

        {error && (
          <p className="text-center text-[13px] text-danger-soft">{error}</p>
        )}

        {soundscapes === null && !error && (
          <p className="text-center text-[13px] text-ink-ghost">Loading soundscapes…</p>
        )}

        {soundscapes !== null && soundscapes.length === 0 && (
          <p className="text-center text-[13px] text-ink-ghost">No soundscapes have been published yet.</p>
        )}

        {soundscapes !== null && soundscapes.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 340px))',
              justifyContent: 'center',
              gap: '18px',
            }}
          >
            {soundscapes.map((a) => (
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

      <footer className="py-6 text-center">
        <p className="text-[11px] text-ink-whisper uppercase tracking-widest">
          Generation is turned off in the demo · Headphones recommended
        </p>
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
