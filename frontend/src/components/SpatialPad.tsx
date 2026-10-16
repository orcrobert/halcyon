import { useRef, useCallback, useState } from 'react'
import { alpha } from '../theme'

interface Props {
  pan: number
  depth: number
  defaultPan: number
  defaultDepth: number
  label: string
  onPanChange: (pan: number) => void
  onDepthChange: (depth: number) => void
}

const PAD = 88
const DOT = 9
const HALF = PAD / 2
const INSET = DOT + 2

export function SpatialPad({ pan, depth, defaultPan, defaultDepth, label, onPanChange, onDepthChange }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [active, setActive] = useState(false)

  const dotX = INSET + ((pan + 1) / 2) * (PAD - INSET * 2)
  const dotY = INSET + depth * (PAD - INSET * 2)

  const isOffCenter = Math.abs(pan) > 0.04 || depth > 0.04

  function xyToValues(clientX: number, clientY: number) {
    const rect = padRef.current!.getBoundingClientRect()
    const x = Math.max(INSET, Math.min(PAD - INSET, clientX - rect.left))
    const y = Math.max(INSET, Math.min(PAD - INSET, clientY - rect.top))
    const newPan = ((x - INSET) / (PAD - INSET * 2)) * 2 - 1
    const newDepth = (y - INSET) / (PAD - INSET * 2)
    return {
      pan: Math.round(newPan * 100) / 100,
      depth: Math.round(newDepth * 100) / 100,
    }
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    setActive(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const { pan: p, depth: d } = xyToValues(e.clientX, e.clientY)
    onPanChange(p)
    onDepthChange(d)
  }, [onPanChange, onDepthChange])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const { pan: p, depth: d } = xyToValues(e.clientX, e.clientY)
    onPanChange(p)
    onDepthChange(d)
  }, [onPanChange, onDepthChange])

  const onPointerUp = useCallback(() => {
    dragging.current = false
    setActive(false)
  }, [])

  const onDoubleClick = useCallback(() => {
    onPanChange(defaultPan)
    onDepthChange(defaultDepth)
  }, [onPanChange, onDepthChange, defaultPan, defaultDepth])

  const panLabel = pan === 0 ? 'C'
    : pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}`
    : `R${Math.round(pan * 100)}`

  const depthLabel = depth < 0.15 ? 'near'
    : depth < 0.5 ? 'mid'
    : depth < 0.8 ? 'far'
    : 'deep'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>

      <div style={{ width: PAD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '8px', color: 'var(--color-ink-ghost)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>L</span>
        <span style={{ fontSize: '8px', color: 'var(--color-ink-ghost)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>R</span>
      </div>

      <div
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          width: PAD,
          height: PAD,
          borderRadius: '12px',
          background: active
            ? 'var(--color-surface-raised)'
            : hovered ? 'var(--color-surface)' : 'var(--color-surface-sunken)',
          border: `1px solid ${isOffCenter ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)' : 'color-mix(in srgb, var(--color-wash) 5%, transparent)'}`,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          transition: 'background 0.15s, border-color 0.2s',
          overflow: 'hidden',
        }}
      >
        <svg width={PAD} height={PAD} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <pattern id={`grid-${label}`} x="0" y="0" width="11" height="11" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.5" style={{ fill: 'color-mix(in srgb, var(--color-wash) 7%, transparent)' }} />
            </pattern>
          </defs>
          <rect width={PAD} height={PAD} fill={`url(#grid-${label})`} />

          <line x1={HALF} y1={4} x2={HALF} y2={PAD - 4} strokeWidth="1" strokeDasharray="2 4" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 5%, transparent)' }} />
          <line x1={4} y1={HALF} x2={PAD - 4} y2={HALF} strokeWidth="1" strokeDasharray="2 4" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 5%, transparent)' }} />

          <defs>
            <radialGradient id={`depth-glow-${label}`} cx={dotX / PAD} cy={dotY / PAD} r="0.5">
              <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent) 18%, transparent)' }} />
              <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent) 0%, transparent)' }} />
            </radialGradient>
          </defs>
          {isOffCenter && (
            <rect width={PAD} height={PAD} fill={`url(#depth-glow-${label})`} />
          )}

          {isOffCenter && (
            <line
              x1={HALF} y1={HALF}
              x2={dotX} y2={dotY}
              strokeWidth="1"
              strokeLinecap="round"
              style={{ stroke: alpha('var(--color-accent)', 20) }}
            />
          )}

          <circle
            cx={dotX}
            cy={dotY}
            r={DOT}
            strokeWidth="1.5"
            style={{
              fill: active ? alpha('var(--color-accent)', 15) : alpha('var(--color-surface-high)', 90),
              stroke: isOffCenter ? alpha('var(--color-accent)', 90) : alpha('var(--color-wash)', 30),
              transition: 'fill 0.1s, stroke 0.15s',
            }}
          />

          <circle
            cx={dotX}
            cy={dotY}
            r="2.5"
            style={{ fill: isOffCenter ? alpha('var(--color-accent)', 90) : alpha('var(--color-wash)', 40) }}
          />
        </svg>
      </div>

      <div style={{ width: PAD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '9px',
          color: isOffCenter ? 'var(--color-accent)' : 'var(--color-ink-ghost)',
          fontFamily: 'inherit',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          transition: 'color 0.15s',
        }}>
          {panLabel}
        </span>
        <span style={{
          fontSize: '9px',
          color: depth > 0.04 ? 'var(--color-accent-bright)' : 'var(--color-ink-ghost)',
          fontFamily: 'inherit',
          letterSpacing: '0.04em',
          transition: 'color 0.15s',
        }}>
          {depthLabel}
        </span>
      </div>

    </div>
  )
}
