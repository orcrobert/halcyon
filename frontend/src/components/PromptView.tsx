import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { Logo } from './Logo'
import { Toggle } from './Toggle'
import { StyleClipModal } from './StyleClipModal'
import { MAX_STYLE_FILE_BYTES, type Selection, type StyleClip } from '../hooks/styleClip'
import { useIsMobile } from '../hooks/useIsMobile'

export const DEFAULT_DURATION_S = 10

const DURATION_CHOICES: { seconds: number; hint: string }[] = [
  { seconds: 10, hint: 'Quickest to generate' },
  { seconds: 20, hint: 'A little more movement' },
  { seconds: 30, hint: 'Fuller, less repetitive' },
  { seconds: 60, hint: 'Richest, slowest to generate' },
]

interface Props {
  onSubmit: (prompt: string, durationS: number, useEvents: boolean, style: StyleClip | null) => void
  loading: boolean
  error: string | null
  onOpenAccount?: () => void
  onOpenHistory?: () => void
}

const SUBMENU_W = 214

interface OptionsMenuProps {
  durationS: number
  useEvents: boolean
  onDurationChange: (seconds: number) => void
  onUseEventsChange: (value: boolean) => void
  styleName: string | null
  onPickStyle: () => void
  disabled: boolean
}

function OptionsMenu({
  durationS, useEvents, onDurationChange, onUseEventsChange, styleName, onPickStyle, disabled,
}: OptionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [lengthOpen, setLengthOpen] = useState(false)
  const [flipLength, setFlipLength] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const expanded = open && !disabled
  const customised = durationS !== DEFAULT_DURATION_S || !useEvents || styleName !== null

  useEffect(() => {
    if (!expanded) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setLengthOpen(false)
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (lengthOpen) {
        setLengthOpen(false)
        return
      }
      setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, lengthOpen])

  function togglePanel() {
    setLengthOpen(false)
    setOpen((o) => !o)
  }

  function toggleLength() {
    const opening = !lengthOpen
    const rect = panelRef.current?.getBoundingClientRect()
    if (opening && rect) {
      setFlipLength(rect.right + SUBMENU_W + 14 > window.innerWidth)
    }
    setLengthOpen(opening)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label="Generation options"
        title="Generation options"
        className="relative flex items-center justify-center rounded-full border transition disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          width: 30,
          height: 30,
          borderColor: expanded
            ? 'color-mix(in srgb, var(--color-accent) 50%, transparent)'
            : 'var(--color-line-hover)',
          background: expanded
            ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
            : 'transparent',
          color: expanded ? 'var(--color-accent-bright)' : 'var(--color-ink-dim)',
        }}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round"
          style={{ transform: expanded ? 'rotate(45deg)' : 'none', transition: 'transform 0.18s ease' }}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {customised && !expanded && (
          <span
            aria-hidden
            className="absolute rounded-full bg-accent-bright"
            style={{ width: 5, height: 5, top: 1, right: 1 }}
          />
        )}
      </button>

      {expanded && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Generation options"
          className="absolute left-0 bottom-full mb-2 rounded-xl border border-line-hover bg-surface-high z-20"
          style={{ width: 236, padding: 6, boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)' }}
        >
          <button
            type="button"
            onClick={toggleLength}
            aria-haspopup="listbox"
            aria-expanded={lengthOpen}
            className="w-full flex items-center justify-between gap-3 rounded-lg text-left transition"
            style={{
              padding: '8px 10px',
              fontFamily: 'inherit',
              background: lengthOpen ? 'color-mix(in srgb, var(--color-wash) 5%, transparent)' : 'transparent',
            }}
          >
            <span className="text-[13px] text-ink-soft">Length</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[12px] text-ink-faint tabular-nums">{durationS}s</span>
              <svg
                className="stroke-ink-faint" width="11" height="11" viewBox="0 0 24 24" fill="none"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: flipLength ? 'rotate(180deg)' : 'none' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>

          <div className="bg-line" style={{ height: 1, margin: '6px 10px' }} />

          <button
            type="button"
            role="switch"
            aria-checked={useEvents}
            onClick={() => onUseEventsChange(!useEvents)}
            className="w-full flex items-center justify-between gap-3 rounded-lg text-left hover:bg-wash/[0.04] transition"
            style={{ padding: '8px 10px', fontFamily: 'inherit' }}
          >
            <span className="flex flex-col">
              <span className={`text-[13px] ${useEvents ? 'text-ink-bright' : 'text-ink-soft'}`}>
                Use events
              </span>
              <span className="text-[10.5px] text-ink-faint leading-snug">
                Let sparse sounds come and go instead of looping
              </span>
            </span>
            <Toggle on={useEvents} />
          </button>

          <div className="bg-line" style={{ height: 1, margin: '6px 10px' }} />

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setLengthOpen(false)
              onPickStyle()
            }}
            className="w-full flex items-center justify-between gap-3 rounded-lg text-left hover:bg-wash/[0.04] transition"
            style={{ padding: '8px 10px', fontFamily: 'inherit' }}
          >
            <span className="flex flex-col min-w-0">
              <span className={`text-[13px] ${styleName ? 'text-ink-bright' : 'text-ink-soft'}`}>
                Style clip
              </span>
              <span className="text-[10.5px] text-ink-faint leading-snug truncate">
                {styleName ?? 'Music in the style of a clip you upload'}
              </span>
            </span>
            <span className="text-[12px] text-ink-faint flex-shrink-0">
              {styleName ? 'Change' : 'Add'}
            </span>
          </button>

          {lengthOpen && (
            <div
              role="listbox"
              aria-label="Soundscape length"
              className="absolute top-0 rounded-xl border border-line-hover bg-surface-high"
              style={{
                width: SUBMENU_W,
                padding: 6,
                zIndex: 21,
                boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)',
                ...(flipLength
                  ? { right: '100%', marginRight: 6 }
                  : { left: '100%', marginLeft: 6 }),
              }}
            >
              {DURATION_CHOICES.map((choice) => (
                <button
                  key={choice.seconds}
                  type="button"
                  role="option"
                  aria-selected={choice.seconds === durationS}
                  onClick={() => {
                    onDurationChange(choice.seconds)
                    setLengthOpen(false)
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-lg text-left hover:bg-wash/[0.04] transition"
                  style={{ padding: '7px 10px', fontFamily: 'inherit' }}
                >
                  <span className="flex flex-col">
                    <span className={`text-[13px] ${choice.seconds === durationS ? 'text-ink-bright' : 'text-ink-soft'}`}>
                      {choice.seconds} seconds
                    </span>
                    <span className="text-[10.5px] text-ink-faint">{choice.hint}</span>
                  </span>
                  {choice.seconds === durationS && (
                    <svg className="stroke-accent-bright flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
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
        <path data-glow d={path} stroke="url(#bw-grad)" strokeWidth="10" fill="none" strokeLinecap="round" filter="url(#bw-glow)" opacity="0.18" />
        <path d={path} stroke="url(#bw-grad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={path} strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.35" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 60%, transparent)' }} />
      </svg>
    </div>
  )
}

interface StyleChipProps {
  style: StyleClip
  disabled: boolean
  onEdit: () => void
  onRemove: () => void
}

function StyleChip({ style, disabled, onEdit, onRemove }: StyleChipProps) {
  return (
    <span
      className="flex items-center rounded-full border min-w-0"
      style={{
        height: 30,
        borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        title={`Style: ${style.name} — click to change the excerpt`}
        aria-label={`Edit style excerpt from ${style.name}`}
        className="flex items-center gap-1.5 min-w-0 h-full disabled:cursor-not-allowed"
        style={{ padding: '0 4px 0 10px', fontFamily: 'inherit', color: 'var(--color-accent-soft)' }}
      >
        <svg className="flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span className="text-[11.5px] truncate" style={{ maxWidth: 120 }}>{style.name}</span>
        <span className="text-[11px] tabular-nums text-ink-faint flex-shrink-0">
          {(style.end - style.start).toFixed(1)}s
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove style clip"
        title="Remove style clip"
        className="flex items-center justify-center h-full text-ink-faint hover:text-ink transition disabled:cursor-not-allowed flex-shrink-0"
        style={{ width: 26, fontFamily: 'inherit' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </span>
  )
}

export function PromptView({ onSubmit, loading, error, onOpenAccount, onOpenHistory }: Props) {
  const [prompt, setPrompt] = useState('')
  const [durationS, setDurationS] = useState(DEFAULT_DURATION_S)
  const [useEvents, setUseEvents] = useState(true)
  const [pulse, setPulse] = useState({ key: '', seq: 0 })
  const [style, setStyle] = useState<StyleClip | null>(null)
  const [crop, setCrop] = useState<{ file: File; initial: Selection | null } | null>(null)
  const [styleError, setStyleError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  function submit() {
    if (prompt.trim() && !loading) onSubmit(prompt.trim(), durationS, useEvents, style)
  }

  function pickStyle() {
    setStyleError(null)
    fileInputRef.current?.click()
  }

  function onStyleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_STYLE_FILE_BYTES) {
      setStyleError('That file is too large. Pick a clip under 100 MB.')
      return
    }
    setCrop({ file, initial: null })
  }

  function closeCrop() {
    setCrop(null)
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
    <div className="relative flex flex-col items-center justify-center h-full min-h-screen" style={isMobile ? { padding: '72px 16px 48px' } : undefined}>

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
              style={{ padding: isMobile ? '18px 18px 10px' : '24px 28px 12px 28px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div className="flex flex-wrap items-center justify-between" style={{ padding: isMobile ? '0 14px 14px' : '0 28px 20px 28px', gap: isMobile ? '10px 12px' : '16px' }}>
              <div className="flex items-center gap-3 min-w-0" style={{ flex: '1 1 auto' }}>
                <OptionsMenu
                  durationS={durationS}
                  useEvents={useEvents}
                  onDurationChange={setDurationS}
                  onUseEventsChange={setUseEvents}
                  styleName={style?.name ?? null}
                  onPickStyle={pickStyle}
                  disabled={loading}
                />
                {style && (
                  <StyleChip
                    style={style}
                    disabled={loading}
                    onEdit={() => setCrop({ file: style.file, initial: { start: style.start, end: style.end } })}
                    onRemove={() => setStyle(null)}
                  />
                )}
                <span className={`text-[11px] text-ink-ghost truncate ${style ? 'hidden sm:inline' : ''}`}>
                  Shift + Enter for new line
                </span>
              </div>
              <button
                onClick={submit}
                disabled={loading || !prompt.trim()}
                className="flex items-center justify-center gap-2 text-wash text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: isMobile ? '12px 20px' : '12px 24px',
                  flex: isMobile && style ? '1 1 100%' : '0 0 auto',
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

          {(styleError ?? error) && <p className="text-center text-danger text-sm">{styleError ?? error}</p>}
          {loading && (
            <p className="text-center text-ink-muted text-sm">
              Decomposing prompt and generating audio — this takes ~30 seconds...
            </p>
          )}
        </div>

        {!loading && <BreathingWave pulseKey={pulse.key} pulseSeq={pulse.seq} />}

      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
        onChange={onStyleFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <StyleClipModal
        open={crop !== null}
        file={crop?.file ?? null}
        initial={crop?.initial ?? null}
        onConfirm={(clip) => {
          setStyle(clip)
          setCrop(null)
        }}
        onClose={closeCrop}
      />
    </div>
  )
}
