import { useRef, useState, useCallback } from 'react'
import type { Atmosphere } from '../types'
import type { EQState } from '../hooks/useAudioEngine'
import { TrackStrip } from './TrackStrip'
import { Visualizer } from './Visualizer'
import { TuningControl } from './TuningControl'
import { BinauralModal } from './BinauralModal'
import { PromptModal } from './PromptModal'

export interface AnimatedValues { vol: number; pan: number; depth: number }

interface Props {
  session: Atmosphere
  playing: boolean
  getAnalyser: () => AnalyserNode | null
  onPlayPause: () => Promise<void>
  onVolumeChange: (label: string, volume: number) => void
  onEQChange: (label: string, eq: EQState) => void
  onPanChange: (label: string, pan: number) => void
  onDepthChange: (label: string, depth: number) => void
  onTuningChange: (freqHz: number) => void
  onExport: () => Promise<void>
  onReset: () => void
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
  onVolumeChange, onEQChange, onPanChange, onDepthChange, onTuningChange,
  onExport, onReset, onStartAnimate, onStopAnimate, onSetAnimateMuted,
  onBinauralToggle, onBinauralPreset, onBinauralLeftHz, onBinauralRightHz,
  binauralActive, binauralBeatHz, binauralLeftHz, binauralRightHz,
}: Props) {
  const [binauralOpen, setBinauralOpen] = useState(false)
  const binauralBtnRef = useRef<HTMLButtonElement>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set())
  const [animating, setAnimating] = useState(false)
  const [animatedValues, setAnimatedValues] = useState<Map<string, AnimatedValues>>(new Map())
  const volumeMap = useRef<Map<string, number>>(
    new Map((session.elements ?? []).map(e => [e.label, e.volume]))
  )

  const labels = (session.elements ?? []).map(e => e.label)
  const allMutedLocal = labels.length > 0 && labels.every(l => mutedTracks.has(l))

  function handleVolumeChange(label: string, volume: number) {
    if (volume > 0) volumeMap.current.set(label, volume)
    onVolumeChange(label, volume)
  }

  function handleMuteChange(label: string, m: boolean) {
    setMutedTracks(prev => {
      const next = new Set(prev)
      if (m) next.add(label); else next.delete(label)
      onSetAnimateMuted(next)
      return next
    })
  }

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
    <div className="min-h-screen flex flex-col bg-[#08090e]">
      <TuningControl
        onTuningChange={onTuningChange}
        initialFreq={session.elements?.[0]?.tuning_hz ?? 440}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[#13141f]" style={{ padding: '18px 32px' }}>
        {/* Live indicator */}
        <div className={`flex items-center gap-2 border rounded-xl px-4 py-2 transition-all duration-150 ${
          playing
            ? 'border-indigo-500/30 bg-indigo-500/5'
            : 'border-[#1d1e2e]'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${playing ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'}`} />
          <span className={`text-[12px] font-medium uppercase tracking-[0.12em] hidden sm:block ${playing ? 'text-indigo-400' : 'text-slate-600'}`}>
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
              border: binauralActive ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(99,102,241,0.2)',
              background: binauralActive ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.04)',
              color: binauralActive ? '#818cf8' : 'rgba(99,102,241,0.4)',
              fontSize: 13, fontFamily: 'inherit', fontStyle: 'italic', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: binauralActive ? '0 0 16px rgba(99,102,241,0.25), 0 0 4px rgba(99,102,241,0.15)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            β
          </button>

          <button
            onClick={onExport}
            className="flex items-center gap-2 text-[12px] font-medium text-slate-400 hover:text-slate-200 border border-[#1d1e2e] hover:border-[#2a2b40] rounded-xl px-4 py-2 transition-all duration-150"
            style={{ fontFamily: 'inherit' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:block">Export</span>
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-2 text-[12px] font-medium text-slate-400 hover:text-slate-200 border border-[#1d1e2e] hover:border-[#2a2b40] rounded-xl px-4 py-2 transition-all duration-150"
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
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-700 mb-3">Now playing</p>
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
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
                  color: 'rgba(165,180,252,0.85)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  background: 'rgba(99,102,241,0.06)',
                  cursor: 'pointer',
                  lineHeight: 1,
                  paddingTop: 1,
                  boxShadow: '0 0 0 0 rgba(99,102,241,0)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.16)'
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)'
                  e.currentTarget.style.boxShadow = '0 0 14px rgba(99,102,241,0.25)'
                  e.currentTarget.style.color = '#c7d2fe'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(99,102,241,0)'
                  e.currentTarget.style.color = 'rgba(165,180,252,0.85)'
                }}
              >
                P
              </button>
            </div>
          </div>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-12 h-12 rounded-full border border-[#1d1e2e] bg-[#111218] hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all duration-200"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-slate-300">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400">
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
                border: allMutedLocal ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.07)',
                background: allMutedLocal ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                color: allMutedLocal ? '#f87171' : '#334155',
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
                border: animating ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.07)',
                background: animating ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                color: animating ? '#818cf8' : '#334155',
                boxShadow: animating ? '0 0 12px rgba(99,102,241,0.15)' : 'none',
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
                key={el.label}
                element={el}
                muted={mutedTracks.has(el.label)}
                animatedVolume={anim?.vol}
                animatedPan={anim?.pan}
                animatedDepth={anim?.depth}
                onMuteChange={handleMuteChange}
                onVolumeChange={handleVolumeChange}
                onEQChange={onEQChange}
                onPanChange={onPanChange}
                onDepthChange={onDepthChange}
              />
            )
          })}
        </div>

      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-[11px] text-slate-800 uppercase tracking-widest">
          Drag faders · M to mute
        </p>
      </footer>

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
