import { useState } from 'react'
import type { Element } from '../types'

interface Props {
  element: Element
  onVolumeChange: (label: string, volume: number) => void
}

export function TrackStrip({ element, onVolumeChange }: Props) {
  const [volume, setVolume] = useState(element.volume)
  const [muted, setMuted] = useState(false)
  const [hovered, setHovered] = useState(false)

  function handleVolumeChange(val: number) {
    setVolume(val)
    if (val === 0) {
      setMuted(true)
      onVolumeChange(element.label, 0)
    } else {
      setMuted(false)
      onVolumeChange(element.label, val)
    }
  }

  function handleMute() {
    const next = !muted
    setMuted(next)
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
        {/* Arrow */}
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
        className={`flex flex-col items-center rounded-2xl border transition-all duration-200 ${
          muted
            ? 'bg-[#0d0e14] border-[#16171f] opacity-40'
            : 'bg-[#111218] border-[#1d1e2e] hover:border-[#2a2b40]'
        }`}
        style={{ width: '100px', padding: '24px 16px', gap: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        {/* Volume % */}
        <span className="text-[11px] font-mono text-slate-700 tabular-nums">
          {muted ? '—' : `${Math.round(volume * 100)}`}
        </span>

        {/* Fader */}
        <input
          type="range"
          className="fader"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          disabled={muted && volume > 0}
        />

        {/* Divider */}
        <div className="w-full h-px bg-[#1d1e2e]" />

        {/* Type badge */}
        <span
          className={`text-[9px] font-bold uppercase tracking-widest rounded-full ${
            isMusic ? 'bg-violet-500/10 text-violet-500' : 'bg-sky-500/10 text-sky-500'
          }`}
          style={{ padding: '4px 10px' }}
        >
          {isMusic ? 'music' : 'sound'}
        </span>

        {/* Mute */}
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
      </div>
    </div>
  )
}
