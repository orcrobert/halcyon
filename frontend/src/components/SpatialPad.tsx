import { useRef, useCallback, useState, useEffect } from 'react'

interface Props {
  pan: number          // -1.0 to +1.0  (X axis, left/right)
  depth: number        // 0.0 to 1.0    (Y axis, front=0 / back=1)
  defaultPan: number
  defaultDepth: number
  label: string
  onPanChange: (pan: number) => void
  onDepthChange: (depth: number) => void
}

const PAD = 88        // pad size px
const DOT = 9         // dot radius px
const HALF = PAD / 2
const INSET = DOT + 2 // keep dot fully inside

export function SpatialPad({ pan, depth, defaultPan, defaultDepth, label, onPanChange, onDepthChange }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [active, setActive] = useState(false)

  // Map pan [-1,1] → x [INSET, PAD-INSET]
  const dotX = INSET + ((pan + 1) / 2) * (PAD - INSET * 2)
  // Map depth [0,1] → y [INSET, PAD-INSET]  (0=top=front, 1=bottom=back)
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

      {/* Axis labels */}
      <div style={{ width: PAD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '8px', color: '#334155', fontFamily: 'inherit', letterSpacing: '0.06em' }}>L</span>
        <span style={{ fontSize: '8px', color: '#334155', fontFamily: 'inherit', letterSpacing: '0.06em' }}>R</span>
      </div>

      {/* 2D Pad */}
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
            ? '#0f1022'
            : hovered ? '#0d0f1e' : '#0a0b15',
          border: `1px solid ${isOffCenter ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          transition: 'background 0.15s, border-color 0.2s',
          overflow: 'hidden',
        }}
      >
        {/* Dot grid background */}
        <svg width={PAD} height={PAD} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <pattern id={`grid-${label}`} x="0" y="0" width="11" height="11" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.5" fill="rgba(255,255,255,0.07)" />
            </pattern>
          </defs>
          <rect width={PAD} height={PAD} fill={`url(#grid-${label})`} />

          {/* Crosshair center lines */}
          <line x1={HALF} y1={4} x2={HALF} y2={PAD - 4} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 4" />
          <line x1={4} y1={HALF} x2={PAD - 4} y2={HALF} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 4" />

          {/* Depth gradient ring — shows "distance" from top to bottom */}
          <defs>
            <radialGradient id={`depth-glow-${label}`} cx={dotX / PAD} cy={dotY / PAD} r="0.5">
              <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
              <stop offset="100%" stopColor="rgba(99,102,241,0)" />
            </radialGradient>
          </defs>
          {isOffCenter && (
            <rect width={PAD} height={PAD} fill={`url(#depth-glow-${label})`} />
          )}

          {/* Shadow line from center to dot — like a "position ray" */}
          {isOffCenter && (
            <line
              x1={HALF} y1={HALF}
              x2={dotX} y2={dotY}
              stroke="rgba(99,102,241,0.2)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          )}

          {/* The dot */}
          <circle
            cx={dotX}
            cy={dotY}
            r={DOT}
            fill={active ? 'rgba(99,102,241,0.15)' : 'rgba(20,21,35,0.9)'}
            stroke={isOffCenter ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.3)'}
            strokeWidth="1.5"
            style={{ transition: 'fill 0.1s, stroke 0.15s' }}
          />

          {/* Inner dot pulse */}
          <circle
            cx={dotX}
            cy={dotY}
            r="2.5"
            fill={isOffCenter ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.4)'}
          />
        </svg>
      </div>

      {/* Bottom axis label */}
      <div style={{ width: PAD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '9px',
          color: isOffCenter ? '#6366f1' : '#334155',
          fontFamily: 'inherit',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          transition: 'color 0.15s',
        }}>
          {panLabel}
        </span>
        <span style={{
          fontSize: '9px',
          color: depth > 0.04 ? '#818cf8' : '#334155',
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
