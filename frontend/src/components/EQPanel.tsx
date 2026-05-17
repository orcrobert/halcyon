import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { EQState } from '../hooks/useAudioEngine'
import type { EQBand } from '../types'

interface Props {
  label: string
  initialBands: EQBand[] | undefined
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onEQChange: (label: string, eq: EQState) => void
  onClose: () => void
}

const EQ_MIN = -8
const EQ_MAX = 8

function clampEQ(v: number) { return Math.max(EQ_MIN, Math.min(EQ_MAX, v)) }

function buildInitialState(bands: EQBand[] | undefined): EQState {
  const state: EQState = { low: 0, mid: 0, high: 0 }
  if (!bands) return state
  for (const band of bands) {
    if (band.type === 'lowshelf') state.low = clampEQ(band.gain)
    else if (band.type === 'highshelf') state.high = clampEQ(band.gain)
    else if (band.type === 'peaking') state.mid = clampEQ(band.gain)
  }
  return state
}

interface BandSliderProps {
  label: string
  freq: string
  value: number
  onChange: (v: number) => void
}

function BandSlider({ label, freq, value, onChange }: BandSliderProps) {
  const MIN = -8
  const MAX = 8
  const isActive = Math.abs(value) > 0.4
  const trackHeight = 180

  const frac = (value - MIN) / (MAX - MIN)
  const centerFrac = 0.5

  const fillBottom = Math.min(frac, centerFrac) * trackHeight
  const fillHeight = Math.abs(frac - centerFrac) * trackHeight

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 }}>
      {/* Value */}
      <span style={{
        fontSize: '13px',
        fontFamily: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 700,
        color: isActive ? '#a5b4fc' : '#475569',
        minHeight: '18px',
        transition: 'color 0.15s ease',
      }}>
        {value === 0 ? '0' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`}
      </span>

      {/* Track + input */}
      <div style={{ position: 'relative', height: `${trackHeight}px`, width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Background track */}
        <div style={{
          position: 'absolute',
          left: '50%', transform: 'translateX(-50%)',
          width: '3px', height: `${trackHeight}px`,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
        }} />

        {/* Active fill */}
        <div style={{
          position: 'absolute',
          left: '50%', transform: 'translateX(-50%)',
          width: '3px',
          bottom: `${fillBottom}px`,
          height: `${fillHeight}px`,
          background: isActive ? '#6366f1' : 'rgba(255,255,255,0.08)',
          borderRadius: '4px',
          transition: 'background 0.15s ease',
        }} />

        {/* 0 dB tick */}
        <div style={{
          position: 'absolute',
          left: '50%', transform: 'translateX(-50%)',
          width: '12px', height: '1px',
          background: 'rgba(255,255,255,0.12)',
          top: `${trackHeight / 2}px`,
        }} />

        {/* Range input rotated */}
        <input
          type="range"
          className="eq-slider"
          min={MIN} max={MAX} step={0.5}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            width: `${trackHeight}px`,
            height: '32px',
            transform: 'rotate(-90deg)',
            margin: 0, padding: 0,
            cursor: 'grab',
          }}
        />
      </div>

      {/* Label */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: isActive ? '#6366f1' : '#475569', letterSpacing: '0.1em', fontFamily: 'inherit', transition: 'color 0.15s ease' }}>
          {label}
        </span>
        <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'inherit' }}>
          {freq}
        </span>
      </div>
    </div>
  )
}

export function EQPanel({ label, initialBands, open, anchorRef, onEQChange, onClose }: Props) {
  const [eq, setEq] = useState<EQState>(() => buildInitialState(initialBands))
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [arrowLeft, setArrowLeft] = useState('50%')
  const panelRef = useRef<HTMLDivElement>(null)
  const PANEL_HEIGHT = 360 // approx, used for positioning

  function getPanelWidth() {
    return Math.min(340, window.innerWidth - 24)
  }

  function reposition() {
    if (!anchorRef.current) return
    const pw = getPanelWidth()
    const rect = anchorRef.current.getBoundingClientRect()
    const anchorCenterX = rect.left + rect.width / 2
    const anchorTop = rect.top

    let left = anchorCenterX - pw / 2
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12))

    const top = Math.max(12, anchorTop - PANEL_HEIGHT - 16)

    const arrowX = anchorCenterX - left
    const clampedArrow = Math.max(20, Math.min(arrowX, pw - 20))

    setPos({ top, left })
    setArrowLeft(`${clampedArrow}px`)
  }

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        reposition()
        setVisible(true)
      })
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [open])

  // Reposition on scroll or resize while open
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  function handleChange(band: keyof EQState, value: number) {
    const next = { ...eq, [band]: value }
    setEq(next)
    onEQChange(label, next)
  }

  function handleReset() {
    const flat: EQState = { low: 0, mid: 0, high: 0 }
    setEq(flat)
    onEQChange(label, flat)
  }

  if (!mounted) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: `${getPanelWidth()}px`,
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.97)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Panel body */}
      <div style={{
        background: 'rgba(8, 9, 18, 0.55)',
        backdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.1)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '28px 28px 22px',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <p style={{ fontSize: '11px', color: '#334155', fontFamily: 'inherit', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>
              EQ — {label}
            </p>
          </div>
          <button
            onClick={handleReset}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '8px',
              color: '#475569',
              fontSize: '10px',
              fontFamily: 'inherit',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '5px 10px',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#94a3b8'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#475569'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
            }}
          >
            Reset
          </button>
        </div>

        {/* Sliders */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
          <BandSlider label="LOW" freq="200 Hz" value={eq.low} onChange={v => handleChange('low', v)} />

          {/* Divider */}
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.04)', alignSelf: 'stretch', margin: '0 4px' }} />

          <BandSlider label="MID" freq="1 kHz" value={eq.mid} onChange={v => handleChange('mid', v)} />

          <div style={{ width: '1px', background: 'rgba(255,255,255,0.04)', alignSelf: 'stretch', margin: '0 4px' }} />

          <BandSlider label="HIGH" freq="8 kHz" value={eq.high} onChange={v => handleChange('high', v)} />
        </div>

        {/* dB scale hint */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: '9px', color: '#1e2030', fontFamily: 'inherit' }}>−8 dB</span>
          <span style={{ fontSize: '9px', color: '#1e2030', fontFamily: 'inherit' }}>0</span>
          <span style={{ fontSize: '9px', color: '#1e2030', fontFamily: 'inherit' }}>+8 dB</span>
        </div>
      </div>

      {/* Arrow pointing down toward anchor */}
      <div style={{
        position: 'absolute',
        bottom: '-7px',
        left: arrowLeft,
        transform: 'translateX(-50%) rotate(45deg)',
        width: '13px',
        height: '13px',
        background: 'rgba(8, 9, 18, 0.55)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTop: 'none',
        borderLeft: 'none',
        pointerEvents: 'none',
      }} />
    </div>,
    document.body
  )
}
