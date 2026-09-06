import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { Logo } from './Logo'

export const DEFAULT_DURATION_S = 10

const DURATION_CHOICES: { seconds: number; hint: string }[] = [
  { seconds: 10, hint: 'Quickest to generate' },
  { seconds: 20, hint: 'A little more movement' },
  { seconds: 30, hint: 'Fuller, less repetitive' },
  { seconds: 60, hint: 'Richest, slowest to generate' },
]

interface Props {
  onSubmit: (prompt: string, durationS: number) => void
  loading: boolean
  error: string | null
  onOpenAccount?: () => void
  onOpenHistory?: () => void
}

interface LengthMenuProps {
  value: number
  onChange: (seconds: number) => void
  disabled: boolean
}

function LengthMenu({ value, onChange, disabled }: LengthMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const expanded = open && !disabled

  useEffect(() => {
    if (!expanded) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        title="Loop length of each generated layer"
        className="flex items-center gap-1.5 rounded-lg border border-line-hover text-[11px] text-ink-dim hover:text-ink hover:border-line-strong transition disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ padding: '5px 9px', fontFamily: 'inherit' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
        {value}s
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
          <polyline points="6 15 12 9 18 15" />
        </svg>
      </button>

      {expanded && (
        <div
          role="listbox"
          className="absolute left-0 bottom-full mb-2 rounded-xl border border-line-hover bg-surface-high z-20"
          style={{ width: 232, padding: 6, boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)' }}
        >
          <p className="text-[10px] uppercase tracking-wider text-ink-faint" style={{ padding: '6px 10px 8px 10px' }}>
            Soundscape length
          </p>
          {DURATION_CHOICES.map((choice) => (
            <button
              key={choice.seconds}
              type="button"
              role="option"
              aria-selected={choice.seconds === value}
              onClick={() => {
                onChange(choice.seconds)
                setOpen(false)
              }}
              className="w-full flex items-center justify-between gap-3 rounded-lg text-left hover:bg-wash/[0.04] transition"
              style={{ padding: '8px 10px', fontFamily: 'inherit' }}
            >
              <span className="flex flex-col">
                <span className={`text-[13px] ${choice.seconds === value ? 'text-ink-bright' : 'text-ink-soft'}`}>
                  {choice.seconds} seconds
                </span>
                <span className="text-[10.5px] text-ink-faint">{choice.hint}</span>
              </span>
              {choice.seconds === value && (
                <svg className="stroke-accent-bright" width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          <p className="text-[10.5px] text-ink-faint leading-snug" style={{ padding: '8px 10px 6px 10px' }}>
            Every layer loops forever — this sets how much audio plays before it repeats.
          </p>
        </div>
      )}
    </div>
  )
}

interface Ripple {
  x: number
  amp: number
  freq: number
  phase: number
  t0: number
  decay: number
}

interface BreathingWaveProps {
  pulseKey: string
  pulseSeq: number
}

function BreathingWave({ pulseKey, pulseSeq }: BreathingWaveProps) {
  const [path, setPath] = useState('')
  const rafRef = useRef(0)
  const tRef = useRef(0)
  const ripplesRef = useRef<Ripple[]>([])

  useEffect(() => {
    if (pulseSeq === 0 || !pulseKey) return

    const isSpace = pulseKey === ' '
    const isBack = pulseKey === 'Backspace'
    const code = pulseKey.charCodeAt(0) || 32

    let x: number
    let amp: number
    let freq: number
    let decay: number

    if (isSpace) {
      x = 0.5
      amp = 1.6
      freq = 3.0
      decay = 2.2
    } else if (isBack) {
      x = ripplesRef.current.length > 0
        ? ripplesRef.current[ripplesRef.current.length - 1].x
        : 0.5
      amp = -1.1
      freq = 4.5
      decay = 3.0
    } else {
      x = ((code * 53) % 1000) / 1000
      const isVowel = 'aeiouAEIOU'.includes(pulseKey)
      const isUpper = pulseKey >= 'A' && pulseKey <= 'Z'
      amp = (isVowel ? 1.2 : 0.85) * (isUpper ? 1.4 : 1.0)
      freq = 2.5 + ((code * 31) % 60) / 10
      decay = 2.6 + (code % 7) * 0.15
    }

    ripplesRef.current.push({
      x,
      amp,
      freq,
      phase: (code % 360) * (Math.PI / 180),
      t0: tRef.current,
      decay,
    })
  }, [pulseSeq, pulseKey])

  useEffect(() => {
    const W = 720
    const H = 80
    const MID = H / 2
    const SAMPLES = 180

    function tick() {
      tRef.current += 0.006
      const t = tRef.current
      const breath = 0.55 + 0.45 * Math.sin(t * 0.7)

      const active: Ripple[] = []
      for (const r of ripplesRef.current) {
        const age = t - r.t0
        if (Math.exp(-age * r.decay) > 0.015) active.push(r)
      }
      ripplesRef.current = active

      const pts: string[] = []
      for (let i = 0; i <= SAMPLES; i++) {
        const xPx = (i / SAMPLES) * W
        const u = (i / SAMPLES) * Math.PI * 2

        const a1 = Math.sin(u * 1.0 + t * 1.2) * 12 * breath
        const a2 = Math.sin(u * 2.3 + t * 0.7) * 6 * breath
        const a3 = Math.sin(u * 0.5 - t * 0.5) * 4

        let ripple = 0
        const norm = i / SAMPLES
        for (const r of active) {
          const age = t - r.t0
          const life = Math.exp(-age * r.decay)
          const dist = norm - r.x
          const spatial = Math.exp(-dist * dist * 55)
          ripple += r.amp * 18 * life * spatial * Math.sin(age * r.freq * 6 - dist * 22 + r.phase)
        }

        const envelope = Math.sin((i / SAMPLES) * Math.PI)
        const y = MID + (a1 + a2 + a3) * envelope + ripple * envelope

        pts.push(`${i === 0 ? 'M' : 'L'} ${xPx.toFixed(2)} ${y.toFixed(2)}`)
      }

      setPath(pts.join(' '))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="relative w-full flex justify-center pointer-events-none" style={{ height: 80 }}>
      <svg width="720" height="80" viewBox="0 0 720 80" style={{ overflow: 'visible', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="bw-grad" x1="0" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" style={{ stopColor: 'var(--color-accent)' }} stopOpacity="0" />
            <stop offset="50%" style={{ stopColor: 'var(--color-accent-bright)' }} stopOpacity="0.9" />
            <stop offset="100%" style={{ stopColor: 'var(--color-accent)' }} stopOpacity="0" />
          </linearGradient>
          <filter id="bw-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b1" />
            <feGaussianBlur stdDeviation="2" result="b2" />
            <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
          </filter>
        </defs>
        <path d={path} stroke="url(#bw-grad)" strokeWidth="10" fill="none" strokeLinecap="round" filter="url(#bw-glow)" opacity="0.18" />
        <path d={path} stroke="url(#bw-grad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={path} strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.35" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 60%, transparent)' }} />
      </svg>
    </div>
  )
}

export function PromptView({ onSubmit, loading, error, onOpenAccount, onOpenHistory }: Props) {
  const [prompt, setPrompt] = useState('')
  const [durationS, setDurationS] = useState(DEFAULT_DURATION_S)
  const [pulse, setPulse] = useState({ key: '', seq: 0 })

  function submit() {
    if (prompt.trim() && !loading) onSubmit(prompt.trim(), durationS)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === ' ') {
      setPulse(p => ({ key: e.key, seq: p.seq + 1 }))
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">

      {onOpenHistory && (
        <button
          onClick={onOpenHistory}
          className="absolute top-6 left-6 w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-wash/[0.04] transition"
          aria-label="Open history"
          title="History"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      )}

      {onOpenAccount && (
        <button
          onClick={onOpenAccount}
          className="absolute top-6 right-6 w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-wash/[0.04] transition"
          aria-label="Open account settings"
          title="Account"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
      )}

      <div className="flex flex-col gap-10 w-full" style={{ maxWidth: '640px' }}>

        <Logo size={26} tagline="Describe a place. Hear it built, layer by layer." />

        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl border border-line bg-surface transition-opacity"
            style={{ boxShadow: '0 25px 50px color-mix(in srgb, var(--color-shade) 40%, transparent)', opacity: loading ? 0.6 : 1 }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="A place, a mood, a moment in time…"
              rows={5}
              className="w-full bg-transparent text-ink resize-none border-none outline-none placeholder:text-ink-faint text-[15px] leading-relaxed"
              style={{ padding: '24px 28px 12px 28px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div className="flex items-center justify-between gap-4" style={{ padding: '0 28px 20px 28px' }}>
              <div className="flex items-center gap-3 min-w-0">
                <LengthMenu value={durationS} onChange={setDurationS} disabled={loading} />
                <span className="text-[11px] text-ink-ghost truncate">Shift + Enter for new line</span>
              </div>
              <button
                onClick={submit}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 text-wash text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: loading || !prompt.trim() ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)' : 'var(--color-accent)',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-wash rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                    <span className="ml-1.5">Generating...</span>
                  </span>
                ) : (
                  <>
                    Generate
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-center text-danger text-sm">{error}</p>}
          {loading && (
            <p className="text-center text-ink-muted text-sm">
              Decomposing prompt and generating audio — this takes ~30 seconds...
            </p>
          )}
        </div>

        {!loading && <BreathingWave pulseKey={pulse.key} pulseSeq={pulse.seq} />}

      </div>
    </div>
  )
}
