import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { alpha } from '../theme'

const PRESETS = [
  { hz: 1,  band: 'Delta', label: 'Lethargic' },
  { hz: 2,  band: 'Delta', label: 'Deep Sleep' },
  { hz: 3,  band: 'Delta', label: 'Dreamless' },
  { hz: 4,  band: 'Theta', label: 'Drowsy' },
  { hz: 6,  band: 'Theta', label: 'Fantasy' },
  { hz: 8,  band: 'Alpha', label: 'Relaxed' },
  { hz: 12, band: 'Alpha', label: 'Conscious' },
  { hz: 16, band: 'Beta',  label: 'Focused' },
  { hz: 24, band: 'Beta',  label: 'Active' },
  { hz: 32, band: 'Gamma', label: 'Alert' },
]

const BAND_COLOR: Record<string, string> = {
  Delta: 'var(--color-accent)',
  Theta: 'var(--color-band-theta)',
  Alpha: 'var(--color-band-alpha)',
  Beta:  'var(--color-band-beta)',
  Gamma: 'var(--color-band-gamma)',
}

const MODAL_W = 740
const MODAL_H = 480

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  active: boolean
  beatHz: number
  leftHz: number
  rightHz: number
  onToggle: () => void
  onPreset: (beatHz: number) => void
  onLeftHz: (hz: number) => void
  onRightHz: (hz: number) => void
  onClose: () => void
}

function FreqSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: string
}) {
  const MIN = 20
  const MAX = 1000

  const pct = ((value - MIN) / (MAX - MIN)) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
      <span style={{
        fontSize: 9, color: 'var(--color-ink-ghost)', letterSpacing: '0.15em',
        textTransform: 'uppercase', fontFamily: 'inherit',
      }}>
        {label}
      </span>

      <div style={{
        fontSize: 28, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
        color, letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {value}
        <span style={{ fontSize: 11, color: 'var(--color-ink-ghost)', marginLeft: 4 }}>Hz</span>
      </div>

      <div style={{ width: '100%', padding: '0 4px' }}>
        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'color-mix(in srgb, var(--color-wash) 5%, transparent)' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${pct}%`, borderRadius: 2,
            background: `linear-gradient(90deg, ${alpha(color, 27)}, ${color})`,
          }} />
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: '100%', marginTop: -10, opacity: 0, cursor: 'pointer',
            height: 24, display: 'block',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[[-10, '−10'], [-1, '−1'], [+1, '+1'], [+10, '+10']].map(([step, lbl]) => (
          <button
            key={lbl}
            onClick={() => onChange(Math.max(MIN, Math.min(MAX, value + (step as number))))}
            style={{
              width: 36, height: 22, background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)', borderRadius: 6,
              color: 'var(--color-ink-faint)', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BinauralModal({
  open, anchorRef, active, beatHz, leftHz, rightHz,
  onToggle, onPreset, onLeftHz, onRightHz, onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(beatHz)

  function reposition() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const x = Math.max(12, Math.min(vw - MODAL_W - 12, (vw - MODAL_W) / 2))
    const y = Math.max(12, Math.min(vh - MODAL_H - 12, (vh - MODAL_H) / 2))
    setPos({ x, y })
  }

  useEffect(() => {
    if (!open) { setVisible(false); return }
    reposition()
    const id = requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', reposition)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', reposition) }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const inside =
        containerRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      if (!inside) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open && !visible) return null

  const activeBand = PRESETS.find(p => p.hz === beatHz)?.band ?? 'Alpha'
  const activeColor = BAND_COLOR[activeBand]

  function handlePreset(hz: number) {
    setSelectedPreset(hz)
    onPreset(hz)
  }

  function handleLeftHz(hz: number) {
    setSelectedPreset(null)
    onLeftHz(hz)
  }

  function handleRightHz(hz: number) {
    setSelectedPreset(null)
    onRightHz(hz)
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'color-mix(in srgb, var(--color-shade) 45%, transparent)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', left: pos.x, top: pos.y,
        width: MODAL_W, height: MODAL_H, zIndex: 9999,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}>
        <div data-frosted ref={containerRef} style={{
          width: '100%', height: '100%',
          background: 'color-mix(in srgb, var(--color-surface-sunken) 82%, transparent)',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 9%, transparent)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 60px 120px color-mix(in srgb, var(--color-shade) 80%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 10%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 6%, transparent)',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Header */}
          <div style={{
            padding: '16px 22px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 9, color: 'var(--color-ink-trace)', fontFamily: 'inherit',
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>
                Binaural Beats
              </span>
              {selectedPreset !== null && (
                <span style={{
                  fontSize: 9, fontFamily: 'inherit', letterSpacing: '0.08em',
                  padding: '2px 8px', borderRadius: 6,
                  background: alpha(activeColor, 8),
                  border: `1px solid ${alpha(activeColor, 19)}`,
                  color: activeColor,
                }}>
                  {PRESETS.find(p => p.hz === selectedPreset)?.band} · {selectedPreset} Hz
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
                use headphones
              </span>
              <button
                onClick={onToggle}
                style={{
                  fontSize: 9, fontFamily: 'inherit', letterSpacing: '0.1em',
                  padding: '4px 14px', borderRadius: 8, cursor: 'pointer',
                  border: active ? `1px solid ${alpha(activeColor, 33)}` : '1px solid color-mix(in srgb, var(--color-wash) 10%, transparent)',
                  background: active ? alpha(activeColor, 9) : 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                  color: active ? activeColor : 'var(--color-ink-ghost)',
                  transition: 'all 0.2s',
                  boxShadow: active ? `0 0 16px ${alpha(activeColor, 13)}` : 'none',
                }}
              >
                {active ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={onClose}
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                  background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                  color: 'var(--color-ink-ghost)', fontSize: 12, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', overflow: 'hidden' }}>

            {/* Left ear */}
            <div style={{
              padding: '32px 28px',
              borderRight: '1px solid color-mix(in srgb, var(--color-wash) 4%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FreqSlider
                label="Left ear"
                value={leftHz}
                onChange={handleLeftHz}
                color="var(--color-accent-bright)"
              />
            </div>

            {/* Presets */}
            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
              <p style={{ fontSize: 9, color: 'var(--color-ink-trace)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'inherit', marginBottom: 6 }}>
                Presets
              </p>
              {PRESETS.map(p => {
                const color = BAND_COLOR[p.band]
                const sel = selectedPreset === p.hz
                return (
                  <button
                    key={p.hz}
                    onClick={() => handlePreset(p.hz)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                      border: sel ? `1px solid ${alpha(color, 27)}` : '1px solid transparent',
                      background: sel ? alpha(color, 7) : 'transparent',
                      transition: 'all 0.15s', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: sel ? color : 'color-mix(in srgb, var(--color-wash) 8%, transparent)',
                      boxShadow: sel ? `0 0 8px ${color}` : 'none',
                      transition: 'all 0.15s',
                    }} />
                    <span style={{
                      fontSize: 11, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
                      color: sel ? color : 'var(--color-ink-faint)', minWidth: 26, transition: 'color 0.15s',
                    }}>
                      {p.hz} Hz
                    </span>
                    <span style={{
                      fontSize: 9, color: sel ? alpha(color, 80) : 'var(--color-ink-trace)',
                      fontFamily: 'inherit', letterSpacing: '0.08em',
                      minWidth: 36, transition: 'color 0.15s',
                    }}>
                      {p.band}
                    </span>
                    <span style={{
                      fontSize: 10, color: sel ? 'var(--color-ink-dim)' : 'var(--color-ink-whisper)',
                      fontFamily: 'inherit', transition: 'color 0.15s',
                    }}>
                      {p.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Right ear */}
            <div style={{
              padding: '32px 28px',
              borderLeft: '1px solid color-mix(in srgb, var(--color-wash) 4%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FreqSlider
                label="Right ear"
                value={rightHz}
                onChange={handleRightHz}
                color="var(--color-accent-bright)"
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 22px',
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 4%, transparent)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
              L {leftHz} Hz · R {rightHz} Hz · beat {Math.abs(rightHz - leftHz)} Hz
            </span>
            <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
              carrier: {leftHz} Hz · optimal range 100–400 Hz
            </span>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
