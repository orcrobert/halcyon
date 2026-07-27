import { useState, useRef } from 'react'
import type { Element } from '../types'
import type { EQState } from '../hooks/useAudioEngine'
import { Fader } from './Fader'
import { EQPanel } from './EQPanel'
import { SpatialModal } from './SpatialModal'

interface Props {
  element: Element
  muted: boolean
  animatedVolume?: number
  animatedPan?: number
  animatedDepth?: number
  onVolumeChange: (label: string, volume: number) => void
  onMuteChange: (label: string, muted: boolean) => void
  onEQChange: (label: string, eq: EQState) => void
  onPanChange: (label: string, pan: number) => void
  onDepthChange: (label: string, depth: number) => void
}

function hashLabel(label: string): number {
  let h = 2166136261
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function TrackStrip({ element, muted, animatedVolume, animatedPan, animatedDepth, onVolumeChange, onMuteChange, onEQChange, onPanChange, onDepthChange }: Props) {
  const blobSeed = hashLabel(element.label)
  const blobX = 20 + (blobSeed % 60)
  const blobY = 15 + ((blobSeed >> 8) % 70)
  const blobSize = 220 + ((blobSeed >> 16) % 120)
  const blobHue = (blobSeed >> 4) % 2 === 0 ? '99,102,241' : '129,140,248'
  const driftAngle = (blobSeed % 360) * (Math.PI / 180)
  const driftX = Math.cos(driftAngle) * 12
  const driftY = Math.sin(driftAngle) * 12
  const [volume, setVolume] = useState(element.volume)
  const [pan, setPan] = useState(element.pan ?? 0)
  const [depth, setDepth] = useState(element.depth ?? 0)
  const [hovered, setHovered] = useState(false)
  const [eqOpen, setEqOpen] = useState(false)
  const [spatialOpen, setSpatialOpen] = useState(false)
  const eqBtnRef = useRef<HTMLButtonElement>(null)
  const spatialBtnRef = useRef<HTMLButtonElement>(null)

  const dispVolume = animatedVolume ?? volume
  const dispPan    = animatedPan    ?? pan
  const dispDepth  = animatedDepth  ?? depth

  function handlePanChange(val: number) {
    setPan(val)
    onPanChange(element.label, val)
  }

  function handleDepthChange(val: number) {
    setDepth(val)
    onDepthChange(element.label, val)
  }

  function handleVolumeChange(val: number) {
    setVolume(val)
    if (val === 0) {
      onMuteChange(element.label, true)
      onVolumeChange(element.label, 0)
    } else {
      onMuteChange(element.label, false)
      onVolumeChange(element.label, val)
    }
  }

  function handleMute() {
    const next = !muted
    onMuteChange(element.label, next)
    onVolumeChange(element.label, next ? 0 : volume)
  }

  const isMusic = element.type === 'music'

  return (
    <div style={{ position: 'relative' }}>
      {/* Tooltip */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 14px)',
          left: '50%',
          transform: hovered ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(8px)',
          width: '220px',
          padding: '14px 16px',
          background: '#0d0e18',
          border: '1px solid #1d1e2e',
          borderRadius: '14px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          opacity: hovered ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          zIndex: 10,
        }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px 0', fontFamily: 'inherit' }}>
          {element.label}
        </p>
        <p style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.6', margin: 0, fontFamily: 'inherit' }}>
          {element.prompt}
        </p>
        <div style={{
          position: 'absolute',
          bottom: '-5px',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: '8px',
          height: '8px',
          background: '#0d0e18',
          borderRight: '1px solid #1d1e2e',
          borderBottom: '1px solid #1d1e2e',
        }} />
      </div>

      {/* Strip card */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`relative flex flex-col items-center rounded-2xl border transition-all duration-300 overflow-hidden ${
          muted
            ? 'bg-[#0d0e14] border-[#0f1018]'
            : 'border-[#1d1e2e] hover:border-[#2a2b40]'
        }`}
        style={{
          width: '100px',
          padding: '24px 16px',
          gap: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: muted
            ? '#0d0e14'
            : 'linear-gradient(180deg, rgba(24,26,42,0.85) 0%, rgba(17,18,24,0.85) 100%)',
          backdropFilter: muted ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: muted ? 'none' : 'blur(8px)',
          boxShadow: muted
            ? 'none'
            : hovered
              ? '0 14px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.3)'
              : '0 8px 20px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.25)',
        }}
      >
        {!muted && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: `${blobX}%`,
              top: `${blobY}%`,
              width: `${blobSize}px`,
              height: `${blobSize}px`,
              transform: hovered
                ? `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scale(1.08)`
                : 'translate(-50%, -50%) scale(1)',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${blobHue},${hovered ? 0.10 : 0.07}) 0%, rgba(${blobHue},${hovered ? 0.035 : 0.025}) 40%, transparent 70%)`,
              filter: 'blur(52px)',
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1), background 1.2s ease',
              willChange: 'transform',
            }}
          />
        )}

        <div className="relative w-full flex flex-col items-center" style={{ zIndex: 1, gap: '16px' }}>

        {/* Volume % */}
        <span className={`text-[11px] font-mono tabular-nums ${muted ? 'text-slate-800' : 'text-slate-700'}`}>
          {muted ? '—' : `${Math.round(dispVolume * 100)}`}
        </span>

        <Fader
          value={volume}
          displayValue={dispVolume}
          onChange={handleVolumeChange}
          disabled={muted && volume > 0}
        />

        {/* Spatial indicator button */}
        <button
          ref={spatialBtnRef}
          onClick={() => setSpatialOpen(v => !v)}
          title="Spatial placement"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: `1px solid ${spatialOpen ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}`,
            background: spatialOpen ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.15s, background 0.15s',
            flexShrink: 0,
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <line x1="10" y1="3" x2="10" y2="17" stroke="rgba(255,255,255,0.06)" strokeWidth="0.75" />
            <line x1="3" y1="10" x2="17" y2="10" stroke="rgba(255,255,255,0.06)" strokeWidth="0.75" />
            <circle
              cx={10 + dispPan * 7}
              cy={3 + dispDepth * 14}
              r="2.5"
              fill={Math.abs(dispPan) > 0.03 || dispDepth > 0.03 ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.35)'}
            />
          </svg>
        </button>

        {/* Divider */}
        <div className={`w-full h-px ${muted ? 'bg-[#111318]' : 'bg-[#1d1e2e]'}`} />

        {/* Type badge */}
        <span
          className={`text-[9px] font-bold uppercase tracking-widest rounded-full ${
            muted ? 'bg-slate-900 text-slate-800' : isMusic ? 'bg-violet-500/10 text-violet-500' : 'bg-sky-500/10 text-sky-500'
          }`}
          style={{ padding: '4px 10px' }}
        >
          {isMusic ? 'music' : 'sound'}
        </span>

        {/* Bottom buttons row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleMute}
            title="Mute"
            className={`w-8 h-8 rounded-full text-xs font-bold transition-all duration-150 border ${
              muted
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-transparent text-slate-600 hover:text-slate-300 border-[#1d1e2e] hover:border-[#2a2b40]'
            }`}
            style={{ fontFamily: 'inherit' }}
          >
            M
          </button>

          <button
            ref={eqBtnRef}
            onClick={() => setEqOpen(v => !v)}
            title="EQ"
            className={`w-8 h-8 rounded-full text-[9px] font-bold transition-all duration-150 border ${
              eqOpen
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                : 'bg-transparent text-slate-600 hover:text-slate-300 border-[#1d1e2e] hover:border-[#2a2b40]'
            }`}
            style={{ fontFamily: 'inherit', letterSpacing: '0.04em' }}
          >
            EQ
          </button>
        </div>
        </div>
      </div>

      <EQPanel
        label={element.label}
        initialBands={element.eq_json ?? undefined}
        open={eqOpen}
        anchorRef={eqBtnRef}
        onEQChange={onEQChange}
        onClose={() => setEqOpen(false)}
      />

      <SpatialModal
        pan={dispPan}
        depth={dispDepth}
        defaultPan={element.pan ?? 0}
        defaultDepth={0}
        open={spatialOpen}
        anchorRef={spatialBtnRef}
        onPanChange={handlePanChange}
        onDepthChange={handleDepthChange}
        onClose={() => setSpatialOpen(false)}
      />
    </div>
  )
}
