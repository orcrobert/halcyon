import { memo, useState, useRef } from 'react'
import type { Element } from '../types'
import type { EQState } from '../hooks/useAudioEngine'
import { Fader } from './Fader'
import { EQPanel } from './EQPanel'
import { SpatialModal } from './SpatialModal'
import { DensityModal } from './DensityModal'
import { LayerMenu } from './LayerMenu'
import { DEFAULT_INTERVAL_MAX_S, DEFAULT_INTERVAL_MIN_S } from '../hooks/eventScheduler'
import { alpha } from '../theme'

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
  onIntervalChange: (label: string, minS: number, maxS: number) => void
  onRegenerate: (element: Element) => void
  onDelete: (element: Element) => void
  deletable: boolean
}

function hashLabel(label: string): number {
  let h = 2166136261
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const TrackStrip = memo(function TrackStrip({ element, muted, animatedVolume, animatedPan, animatedDepth, onVolumeChange, onMuteChange, onEQChange, onPanChange, onDepthChange, onIntervalChange, onRegenerate, onDelete, deletable }: Props) {
  const blobSeed = hashLabel(element.label)
  const blobX = 20 + (blobSeed % 60)
  const blobY = 15 + ((blobSeed >> 8) % 70)
  const blobSize = 220 + ((blobSeed >> 16) % 120)
  const blobTint = (blobSeed >> 4) % 2 === 0 ? 'var(--color-accent)' : 'var(--color-accent-bright)'
  const driftAngle = (blobSeed % 360) * (Math.PI / 180)
  const driftX = Math.cos(driftAngle) * 12
  const driftY = Math.sin(driftAngle) * 12
  const [volume, setVolume] = useState(element.volume)
  const [pan, setPan] = useState(element.pan ?? 0)
  const [depth, setDepth] = useState(element.depth ?? 0)
  const [hovered, setHovered] = useState(false)
  const [eqOpen, setEqOpen] = useState(false)
  const [spatialOpen, setSpatialOpen] = useState(false)
  const [densityOpen, setDensityOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [interval, setInterval] = useState<[number, number]>([
    element.interval_min_s ?? DEFAULT_INTERVAL_MIN_S,
    element.interval_max_s ?? DEFAULT_INTERVAL_MAX_S,
  ])
  const eqBtnRef = useRef<HTMLButtonElement>(null)
  const spatialBtnRef = useRef<HTMLButtonElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const isEvent = element.playback === 'oneshot'

  function handleIntervalChange(minS: number, maxS: number) {
    setInterval([minS, maxS])
    onIntervalChange(element.label, minS, maxS)
  }

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
  const regenerating = element.status === 'regenerating'
  const failed = element.status === 'failed'


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
          background: 'var(--color-surface)',
          border: '1px solid var(--color-line)',
          borderRadius: '14px',
          boxShadow: '0 24px 60px color-mix(in srgb, var(--color-shade) 70%, transparent)',
          opacity: hovered ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          zIndex: 10,
        }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 6px 0', fontFamily: 'inherit' }}>
          {element.label}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--color-ink-muted)', lineHeight: '1.6', margin: 0, fontFamily: 'inherit' }}>
          {element.prompt}
        </p>
        {element.clip_s != null && (
          <p style={{ fontSize: '10px', color: 'var(--color-ink-faint)', lineHeight: '1.5', margin: '6px 0 0 0', fontFamily: 'inherit' }}>
            {element.clip_s}s loop
          </p>
        )}
        {failed && element.error && (
          <p style={{ fontSize: '10px', color: 'var(--color-danger-bright)', lineHeight: '1.5', margin: '8px 0 0 0', fontFamily: 'inherit' }}>
            {element.error}
          </p>
        )}
        <div style={{
          position: 'absolute',
          bottom: '-5px',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: '8px',
          height: '8px',
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-line)',
          borderBottom: '1px solid var(--color-line)',
        }} />
      </div>

      {/* Strip card */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`relative flex flex-col items-center rounded-2xl border transition-all duration-300 overflow-hidden ${
          failed
            ? 'border-danger/40'
            : muted
              ? 'bg-surface border-line-faint'
              : 'border-line hover:border-line-active'
        }`}
        style={{
          width: '100px',
          padding: '24px 16px',
          gap: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: muted
            ? 'var(--color-surface)'
            : 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface-hover) 85%, transparent) 0%, color-mix(in srgb, var(--color-surface-raised) 85%, transparent) 100%)',
          backdropFilter: muted ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: muted ? 'none' : 'blur(8px)',
          boxShadow: muted
            ? 'none'
            : hovered
              ? '0 14px 32px color-mix(in srgb, var(--color-shade) 45%, transparent), 0 2px 6px color-mix(in srgb, var(--color-shade) 30%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 4%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--color-shade) 30%, transparent)'
              : '0 8px 20px color-mix(in srgb, var(--color-shade) 35%, transparent), 0 1px 3px color-mix(in srgb, var(--color-shade) 25%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 3%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--color-shade) 25%, transparent)',
        }}
      >
        {!muted && (
          <div
            aria-hidden
            data-glow
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
              background: `radial-gradient(circle, ${alpha(blobTint, hovered ? 10 : 7)} 0%, ${alpha(blobTint, hovered ? 3.5 : 2.5)} 40%, transparent 70%)`,
              filter: 'blur(52px)',
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1), background 1.2s ease',
              willChange: 'transform',
            }}
          />
        )}

        <button
          ref={menuBtnRef}
          onClick={() => setMenuOpen(o => !o)}
          title={failed ? 'Regeneration failed — open layer options' : 'Layer options'}
          aria-label="Layer options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`absolute flex items-center justify-center rounded-full transition-all duration-150 border ${
            failed
              ? 'bg-danger/15 text-danger-bright border-danger/40'
              : menuOpen
                ? 'bg-accent/15 text-accent-soft border-accent/40'
                : 'bg-wash/[0.02] text-ink-ghost hover:text-ink-soft border-wash/[0.06] hover:border-line-active'
          }`}
          style={{ top: 8, right: 8, width: 22, height: 22, zIndex: 2, padding: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {regenerating && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 5,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'color-mix(in srgb, var(--color-surface-sunken) 72%, transparent)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >
            <svg className="animate-spin stroke-accent-bright" width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
            <span style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--color-accent)', fontFamily: 'inherit', textTransform: 'uppercase' }}>
              redoing
            </span>
          </div>
        )}

        <div
          className="relative w-full flex flex-col items-center"
          style={{
            zIndex: 1,
            gap: '16px',
            opacity: regenerating ? 0.25 : 1,
            pointerEvents: regenerating ? 'none' : 'auto',
            transition: 'opacity 0.3s ease',
          }}
        >

        {/* Volume % */}
        <span className={`text-[11px] font-mono tabular-nums ${muted ? 'text-ink-whisper' : 'text-ink-ghost'}`}>
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
            border: `1px solid ${spatialOpen ? 'color-mix(in srgb, var(--color-accent) 50%, transparent)' : 'color-mix(in srgb, var(--color-wash) 7%, transparent)'}`,
            background: spatialOpen ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
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
            <circle cx="10" cy="10" r="8" fill="none" strokeWidth="1" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 12%, transparent)' }} />
            <line x1="10" y1="3" x2="10" y2="17" strokeWidth="0.75" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 6%, transparent)' }} />
            <line x1="3" y1="10" x2="17" y2="10" strokeWidth="0.75" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 6%, transparent)' }} />
            <circle
              cx={10 + dispPan * 7}
              cy={3 + dispDepth * 14}
              r="2.5"
              style={{
                fill: Math.abs(dispPan) > 0.03 || dispDepth > 0.03
                  ? alpha('var(--color-accent)', 90)
                  : alpha('var(--color-wash)', 35),
              }}
            />
          </svg>
        </button>

        {/* Divider */}
        <div className={`w-full h-px ${muted ? 'bg-surface-raised' : 'bg-line'}`} />

        {/* Type badge */}
        <span
          className={`text-[9px] font-bold uppercase tracking-widest rounded-full ${
            muted
              ? 'bg-surface-raised text-ink-whisper'
              : isEvent ? 'bg-tag-event/10 text-tag-event'
              : isMusic ? 'bg-tag-music/10 text-tag-music'
              : 'bg-tag-sound/10 text-tag-sound'
          }`}
          style={{ padding: '4px 10px' }}
        >
          {isEvent ? 'event' : isMusic ? 'music' : 'sound'}
        </span>

        {/* Bottom buttons row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleMute}
            title="Mute"
            className={`w-8 h-8 rounded-full text-xs font-bold transition-all duration-150 border ${
              muted
                ? 'bg-danger/20 text-danger-bright border-danger/40'
                : 'bg-transparent text-ink-faint hover:text-ink-soft border-line hover:border-line-active'
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
                ? 'bg-accent/20 text-accent-bright border-accent/40'
                : 'bg-transparent text-ink-faint hover:text-ink-soft border-line hover:border-line-active'
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

      <LayerMenu
        open={menuOpen}
        anchorRef={menuBtnRef}
        deletable={deletable}
        onRegenerate={() => onRegenerate(element)}
        onDelete={() => onDelete(element)}
        onFrequency={isEvent ? () => setDensityOpen(true) : undefined}
        onClose={() => setMenuOpen(false)}
      />

      <DensityModal
        intervalMinS={interval[0]}
        intervalMaxS={interval[1]}
        open={densityOpen}
        anchorRef={menuBtnRef}
        onIntervalChange={handleIntervalChange}
        onClose={() => setDensityOpen(false)}
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
})
