import { useEffect, useRef, useState, useCallback } from 'react'
import type { Atmosphere, Element } from '../types'
import type { EQState } from '../hooks/useAudioEngine'
import { TrackStrip } from './TrackStrip'
import { Visualizer } from './Visualizer'
import { TuningControl } from './TuningControl'
import { BinauralModal } from './BinauralModal'
import { PromptModal } from './PromptModal'
import { RegenerateModal } from './RegenerateModal'

export interface AnimatedValues { vol: number; pan: number; depth: number }

const EXPORT_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 seconds' },
  { seconds: 60, label: '1 minute' },
  { seconds: 120, label: '2 minutes' },
  { seconds: 300, label: '5 minutes' },
]

function ExportMenu({ onExport }: { onExport: (seconds: number) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
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
  }, [open])

  async function choose(seconds: number) {
    setOpen(false)
    setBusy(true)
    try {
      await onExport(seconds)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl px-4 py-2 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ fontFamily: 'inherit' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span className="hidden sm:block">{busy ? 'Rendering…' : 'Export'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 rounded-xl border border-line-hover bg-surface-high z-30"
          style={{ width: 196, padding: 6, boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)' }}
        >
          <p className="text-[10px] uppercase tracking-wider text-ink-faint" style={{ padding: '6px 10px 8px 10px' }}>
            Export length
          </p>
          {EXPORT_CHOICES.map((choice) => (
            <button
              key={choice.seconds}
              role="option"
              aria-selected={false}
              onClick={() => choose(choice.seconds)}
              className="w-full flex items-center rounded-lg text-left text-[13px] text-ink-soft hover:bg-wash/[0.04] hover:text-ink-bright transition"
              style={{ padding: '8px 10px', fontFamily: 'inherit' }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  session: Atmosphere
  playing: boolean
  getAnalyser: () => AnalyserNode | null
  onPlayPause: () => Promise<void>
  onVolumeChange: (label: string, volume: number) => void
  onEQChange: (label: string, eq: EQState) => void
  onPanChange: (label: string, pan: number) => void
  onDepthChange: (label: string, depth: number) => void
  onIntervalChange: (label: string, minS: number, maxS: number) => void
  onTuningChange: (freqHz: number) => void
  onExport: (seconds: number) => Promise<void>
  onReset: () => void
  onRegenerateElement: (element: Element, feedback: string) => Promise<void>
  onDeleteElement: (element: Element) => Promise<void>
  onRegenerateScene: () => Promise<void>
  actionError: string | null
  onDismissActionError: () => void
  onStartAnimate: (cb: (values: Map<string, AnimatedValues>) => void) => void
  onStopAnimate: () => void
  onSetAnimateMuted: (muted: Set<string>) => void
  onBinauralToggle: () => void
  onBinauralPreset: (beatHz: number) => void
  onBinauralLeftHz: (hz: number) => void
  onBinauralRightHz: (hz: number) => void
  binauralActive: boolean
  binauralBeatHz: number
  binauralLeftHz: number
  binauralRightHz: number
}

export function DashboardView({
  session, playing, getAnalyser, onPlayPause,
  onVolumeChange, onEQChange, onPanChange, onDepthChange, onIntervalChange, onTuningChange,
  onExport, onReset, onRegenerateElement, onDeleteElement, onRegenerateScene,
  actionError, onDismissActionError,
  onStartAnimate, onStopAnimate, onSetAnimateMuted,
  onBinauralToggle, onBinauralPreset, onBinauralLeftHz, onBinauralRightHz,
  binauralActive, binauralBeatHz, binauralLeftHz, binauralRightHz,
}: Props) {
  const [binauralOpen, setBinauralOpen] = useState(false)
  const binauralBtnRef = useRef<HTMLButtonElement>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [regenerating, setRegenerating] = useState<Element | null>(null)
  const [submittingRegen, setSubmittingRegen] = useState(false)
  const [sceneRegenerating, setSceneRegenerating] = useState(false)
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set())
  const [animating, setAnimating] = useState(false)
  const [animatedValues, setAnimatedValues] = useState<Map<string, AnimatedValues>>(new Map())
  const volumeMap = useRef<Map<string, number>>(
    new Map((session.elements ?? []).map(e => [e.label, e.volume]))
  )

  const labels = (session.elements ?? []).map(e => e.label)
  const allMutedLocal = labels.length > 0 && labels.every(l => mutedTracks.has(l))

  const handleVolumeChange = useCallback((label: string, volume: number) => {
    if (volume > 0) volumeMap.current.set(label, volume)
    onVolumeChange(label, volume)
  }, [onVolumeChange])

  const handleMuteChange = useCallback((label: string, m: boolean) => {
    setMutedTracks(prev => {
      const next = new Set(prev)
      if (m) next.add(label); else next.delete(label)
      onSetAnimateMuted(next)
      return next
    })
  }, [onSetAnimateMuted])

  function handleMuteAll() {
    if (allMutedLocal) {
      const next = new Set<string>()
      setMutedTracks(next)
      onSetAnimateMuted(next)
      for (const label of labels) {
        const vol = volumeMap.current.get(label) ?? 1
        onVolumeChange(label, vol)
      }
    } else {
      const next = new Set(labels)
      setMutedTracks(next)
      onSetAnimateMuted(next)
      for (const label of labels) onVolumeChange(label, 0)
    }
  }

  const handleRegenerateSubmit = useCallback(async (feedback: string) => {
    if (!regenerating) return
    setSubmittingRegen(true)
    try {
      await onRegenerateElement(regenerating, feedback)
      setRegenerating(null)
    } finally {
      setSubmittingRegen(false)
    }
  }, [regenerating, onRegenerateElement])

  const handleRegenerateScene = useCallback(async () => {
    setSceneRegenerating(true)
    try {
      await onRegenerateScene()
    } finally {
      setSceneRegenerating(false)
    }
  }, [onRegenerateScene])

  const handleToggleAnimate = useCallback(() => {
    if (animating) {
      onStopAnimate()
      setAnimating(false)
      setAnimatedValues(new Map())
    } else {
      onStartAnimate((values) => {
        setAnimatedValues(new Map(values))
      })
      setAnimating(true)
    }
  }, [animating, onStartAnimate, onStopAnimate])

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TuningControl
        onTuningChange={onTuningChange}
        initialFreq={session.elements?.[0]?.tuning_hz ?? 440}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line-soft" style={{ padding: '18px 32px' }}>
        {/* Live indicator */}
        <div className={`flex items-center gap-2 border rounded-xl px-4 py-2 transition-all duration-150 ${
          playing
            ? 'border-accent/30 bg-accent/5'
            : 'border-line'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${playing ? 'bg-accent animate-pulse' : 'bg-ink-ghost'}`} />
          <span className={`text-[12px] font-medium uppercase tracking-[0.12em] hidden sm:block ${playing ? 'text-accent-bright' : 'text-ink-faint'}`}>
            {playing ? 'Live' : 'Paused'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">

          {/* Binaural beats button */}
          <button
            ref={binauralBtnRef}
            onClick={() => setBinauralOpen(o => !o)}
            style={{
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              border: binauralActive ? '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)' : '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
              background: binauralActive ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'color-mix(in srgb, var(--color-accent) 4%, transparent)',
              color: binauralActive ? 'var(--color-accent-bright)' : 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
              fontSize: 13, fontFamily: 'inherit', fontStyle: 'italic', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: binauralActive ? '0 0 16px color-mix(in srgb, var(--color-accent) 25%, transparent), 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            β
          </button>

          <ExportMenu onExport={onExport} />

          <button
            onClick={handleRegenerateScene}
            disabled={sceneRegenerating}
            title="Generate this scene again as a new atmosphere"
            className="flex items-center gap-2 text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl px-4 py-2 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: 'inherit' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span className="hidden sm:block">Take another</span>
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-2 text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl px-4 py-2 transition-all duration-150"
            style={{ fontFamily: 'inherit' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden sm:block">New atmosphere</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-14">

        {/* Title + visualizer + play/pause */}
        <div className="flex flex-col items-center gap-6 text-center w-full" style={{ maxWidth: '640px' }}>

          <Visualizer getAnalyser={getAnalyser} playing={playing} />

          {/* Title */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-ghost mb-3">Now playing</p>
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-3xl font-bold text-wash" style={{ letterSpacing: '-0.02em' }}>
                {session.title ?? session.prompt}
              </h1>
              <button
                onClick={() => setPromptOpen(true)}
                title="Show original prompt"
                aria-label="Show original prompt"
                className="shrink-0 flex items-center justify-center rounded-full transition-all duration-200"
                style={{
                  width: 22, height: 22,
                  fontSize: 10, fontFamily: 'inherit',
                  fontWeight: 700, letterSpacing: '0.04em',
                  color: 'color-mix(in srgb, var(--color-accent-soft) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
                  cursor: 'pointer',
                  lineHeight: 1,
                  paddingTop: 1,
                  boxShadow: '0 0 0 0 color-mix(in srgb, var(--color-accent) 0%, transparent)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 55%, transparent)'
                  e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--color-accent) 25%, transparent)'
                  e.currentTarget.style.color = 'var(--color-accent-pale)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 6%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 30%, transparent)'
                  e.currentTarget.style.boxShadow = '0 0 0 0 color-mix(in srgb, var(--color-accent) 0%, transparent)'
                  e.currentTarget.style.color = 'color-mix(in srgb, var(--color-accent-soft) 85%, transparent)'
                }}
              >
                P
              </button>
            </div>
          </div>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-12 h-12 rounded-full border border-line bg-surface-raised hover:border-accent/40 hover:bg-accent/5 transition-all duration-200"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-ink-soft">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-accent-bright">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {/* Mute all + Animate */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleMuteAll}
              style={{
                fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.1em',
                padding: '4px 14px', borderRadius: 8, cursor: 'pointer',
                border: allMutedLocal ? '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)' : '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                background: allMutedLocal ? 'color-mix(in srgb, var(--color-danger) 8%, transparent)' : 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
                color: allMutedLocal ? 'var(--color-danger-bright)' : 'var(--color-ink-ghost)',
                transition: 'all 0.2s',
              }}
            >
              {allMutedLocal ? 'unmute all' : 'mute all'}
            </button>

            <button
              onClick={handleToggleAnimate}
              style={{
                fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.1em',
                padding: '4px 14px', borderRadius: 8, cursor: 'pointer',
                border: animating ? '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)' : '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                background: animating ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
                color: animating ? 'var(--color-accent-bright)' : 'var(--color-ink-ghost)',
                boxShadow: animating ? '0 0 12px color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {animating ? 'animating' : 'animate'}
            </button>
          </div>
        </div>

        {/* Mixer */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(100px, 100px))`,
          gap: '16px',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '900px',
        }}>
          {(session.elements ?? []).map((el) => {
            const anim = animatedValues.get(el.label)
            return (
              <TrackStrip
                key={`${el.id}:${el.version}`}
                element={el}
                deletable={(session.elements ?? []).length > 1}
                styleName={session.style?.name ?? null}
                onRegenerate={setRegenerating}
                onDelete={onDeleteElement}
                muted={mutedTracks.has(el.label)}
                animatedVolume={anim?.vol}
                animatedPan={anim?.pan}
                animatedDepth={anim?.depth}
                onMuteChange={handleMuteChange}
                onVolumeChange={handleVolumeChange}
                onEQChange={onEQChange}
                onPanChange={onPanChange}
                onDepthChange={onDepthChange}
                onIntervalChange={onIntervalChange}
              />
            )
          })}
        </div>

      </main>

      {actionError && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            zIndex: 9997,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100vw - 32px)',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
            background: 'color-mix(in srgb, var(--color-surface-danger) 92%, transparent)',
            boxShadow: '0 20px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-danger-soft)', fontFamily: 'inherit' }}>
            {actionError}
          </span>
          <button
            onClick={onDismissActionError}
            aria-label="Dismiss"
            style={{
              width: 20, height: 20, borderRadius: '50%', cursor: 'pointer',
              border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
              background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
              color: 'var(--color-danger-bright)', fontSize: 11, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-[11px] text-ink-whisper uppercase tracking-widest">
          Drag faders · Space to play/pause
        </p>
      </footer>

      <RegenerateModal
        open={regenerating !== null}
        element={regenerating}
        submitting={submittingRegen}
        onSubmit={handleRegenerateSubmit}
        onClose={() => setRegenerating(null)}
      />

      <BinauralModal
        open={binauralOpen}
        anchorRef={binauralBtnRef}
        active={binauralActive}
        beatHz={binauralBeatHz}
        leftHz={binauralLeftHz}
        rightHz={binauralRightHz}
        onToggle={onBinauralToggle}
        onPreset={onBinauralPreset}
        onLeftHz={onBinauralLeftHz}
        onRightHz={onBinauralRightHz}
        onClose={() => setBinauralOpen(false)}
      />

      <PromptModal
        open={promptOpen}
        prompt={session.prompt}
        onClose={() => setPromptOpen(false)}
      />

    </div>
  )
}
