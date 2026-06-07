import { useRef, useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  pan: number
  depth: number
  defaultPan: number
  defaultDepth: number
  label: string
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onPanChange: (pan: number) => void
  onDepthChange: (depth: number) => void
  onClose: () => void
}

const PAD = 260
const HALF = PAD / 2
const DOT_R = 11
const INSET = DOT_R + 6
const GRID_STEP = 12
const MODAL_W = 292
// Organic wobbly path — multiple incommensurable frequencies so it never looks like a flower
function wobblePath(cx: number, cy: number, r: number, amp: number, phase: number): string {
  const steps = 120
  const points: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const noise =
      Math.sin(2.0 * t + phase * 1.00) * 0.40 +
      Math.sin(3.7 * t + phase * 0.73) * 0.28 +
      Math.sin(5.3 * t + phase * 0.51) * 0.18 +
      Math.sin(7.1 * t + phase * 0.39) * 0.10 +
      Math.sin(1.3 * t + phase * 1.41) * 0.14
    const ri = r + amp * noise
    points.push(i === 0 ? `M ${cx + ri * Math.cos(t)} ${cy + ri * Math.sin(t)}` : `L ${cx + ri * Math.cos(t)} ${cy + ri * Math.sin(t)}`)
  }
  return points.join(' ') + ' Z'
}

export function SpatialModal({
  pan, depth, defaultPan, defaultDepth, label,
  open, anchorRef, onPanChange, onDepthChange, onClose
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)

  const [dotHovered, setDotHovered] = useState(false)
  const [waveAmp, setWaveAmp] = useState(0)
  const [wavePhase, setWavePhase] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)

  const dotX = INSET + ((pan + 1) / 2) * (PAD - INSET * 2)
  const dotY = INSET + depth * (PAD - INSET * 2)
  const isOffCenter = Math.abs(pan) > 0.03 || depth > 0.03

  const panLabel = pan === 0 ? 'center'
    : pan < 0 ? `L ${Math.round(Math.abs(pan) * 100)}`
    : `R ${Math.round(pan * 100)}`
  const depthLabel = depth < 0.15 ? 'near' : depth < 0.45 ? 'mid' : depth < 0.75 ? 'far' : 'deep'

  // Animate wave on hover or drag — decay when neither
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    const active = dotHovered || dragging.current
    if (!active) {
      let amp = waveAmp
      function decay() {
        amp *= 0.80
        if (amp < 0.04) { setWaveAmp(0); return }
        setWaveAmp(amp)
        rafRef.current = requestAnimationFrame(decay)
      }
      rafRef.current = requestAnimationFrame(decay)
      return () => cancelAnimationFrame(rafRef.current)
    }
    let amp = waveAmp
    const TARGET_AMP = 1.4   // subtle — not a flower
    function animate() {
      amp += (TARGET_AMP - amp) * 0.08
      phaseRef.current += 0.022   // slow drift
      setWaveAmp(amp)
      setWavePhase(phaseRef.current)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [dotHovered])

  const dotPath = wobblePath(dotX, dotY, DOT_R, waveAmp, wavePhase)
  const dotPathBig = wobblePath(dotX, dotY, DOT_R + 11, waveAmp * 0.6, wavePhase + 1.3)

  function reposition() {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const MODAL_H = PAD + 80
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = rect.left + rect.width / 2 - MODAL_W / 2
    let y = rect.top - MODAL_H - 14
    if (y < 8) y = rect.bottom + 14
    x = Math.max(8, Math.min(vw - MODAL_W - 8, x))
    y = Math.max(8, Math.min(vh - MODAL_H - 8, y))
    setPos({ x, y })
  }

  useEffect(() => {
    if (!open) { setVisible(false); return }
    reposition()
    const id = requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
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

  function xyToValues(clientX: number, clientY: number) {
    if (!svgRef.current) return { pan: 0, depth: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = PAD / rect.width
    const scaleY = PAD / rect.height
    const vx = (clientX - rect.left) * scaleX
    const vy = (clientY - rect.top) * scaleY
    const cx = Math.max(INSET, Math.min(PAD - INSET, vx))
    const cy = Math.max(INSET, Math.min(PAD - INSET, vy))
    return {
      pan: Math.round(((cx - INSET) / (PAD - INSET * 2) * 2 - 1) * 100) / 100,
      depth: Math.round((cy - INSET) / (PAD - INSET * 2) * 100) / 100,
    }
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    const { pan: p, depth: d } = xyToValues(e.clientX, e.clientY)
    onPanChange(p); onDepthChange(d)
  }, [onPanChange, onDepthChange])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const { pan: p, depth: d } = xyToValues(e.clientX, e.clientY)
    onPanChange(p); onDepthChange(d)
  }, [onPanChange, onDepthChange])

  const onPointerUp = useCallback(() => { dragging.current = false }, [])

  const onDoubleClick = useCallback(() => {
    onPanChange(defaultPan); onDepthChange(defaultDepth)
  }, [onPanChange, onDepthChange, defaultPan, defaultDepth])

  // Static grid
  const gridLines: React.ReactNode[] = []
  for (let gx = 0; gx <= PAD; gx += GRID_STEP) {
    const isCenter = Math.abs(gx - HALF) < 1
    gridLines.push(
      <line key={`v${gx}`} x1={gx} y1={0} x2={gx} y2={PAD}
        stroke={isCenter ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.07)'}
        strokeWidth={isCenter ? 0.75 : 0.5}
      />
    )
  }
  for (let gy = 0; gy <= PAD; gy += GRID_STEP) {
    const isCenter = Math.abs(gy - HALF) < 1
    gridLines.push(
      <line key={`h${gy}`} x1={0} y1={gy} x2={PAD} y2={gy}
        stroke={isCenter ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.07)'}
        strokeWidth={isCenter ? 0.75 : 0.5}
      />
    )
  }

  const uid = useId().replace(/:/g, '')
  const gradId = `sg-${uid}`
  const glowId = `glow-${uid}`

  if (!open && !visible) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MODAL_W,
      zIndex: 9999,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)',
      transition: 'opacity 0.18s ease, transform 0.18s ease',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <div ref={containerRef} style={{
        background: 'rgba(8,9,18,0.55)',
        backdropFilter: 'blur(40px) saturate(180%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>

        {/* Header — coords only, no label */}
        <div style={{
          padding: '12px 16px 9px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: '9px', color: '#253047', fontFamily: 'inherit', letterSpacing: '0.08em' }}>
            SPATIAL
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{
              fontSize: '10px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
              color: isOffCenter ? '#818cf8' : '#2d3a4f',
              transition: 'color 0.2s', letterSpacing: '0.04em',
            }}>
              {panLabel}
            </span>
            <span style={{ fontSize: '10px', color: '#1e2a3a' }}>·</span>
            <span style={{
              fontSize: '10px', fontFamily: 'inherit',
              color: depth > 0.04 ? '#6366f1' : '#2d3a4f',
              transition: 'color 0.2s',
            }}>
              {depthLabel}
            </span>
          </div>
        </div>

        {/* Pad */}
        <svg
          ref={svgRef}
          width={PAD} height={PAD}
          viewBox={`0 0 ${PAD} ${PAD}`}
          style={{ display: 'block', width: '100%', height: 'auto', cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(99,102,241,0.2)" />
              <stop offset="100%" stopColor="rgba(99,102,241,0)" />
            </radialGradient>
            <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={PAD} height={PAD} fill="transparent" />

          {/* Grid */}
          {gridLines}

          {/* Glow behind dot */}
          {isOffCenter && (
            <ellipse cx={dotX} cy={dotY} rx={55} ry={55} fill={`url(#${gradId})`} style={{ pointerEvents: 'none' }} />
          )}

          {/* Straight line center → dot */}
          {isOffCenter && (
            <line
              x1={HALF} y1={HALF} x2={dotX} y2={dotY}
              stroke="rgba(99,102,241,0.3)" strokeWidth="1"
              strokeDasharray="3 5" strokeLinecap="round"
            />
          )}

          {/* Center pip */}
          <circle cx={HALF} cy={HALF} r="2" fill="rgba(255,255,255,0.15)" style={{ pointerEvents: 'none' }} />

          {/* Outer wobbly ring — faint */}
          {(dotHovered || dragging.current) && waveAmp > 0.1 && (
            <path
              d={dotPathBig}
              fill="none"
              stroke="rgba(99,102,241,0.1)"
              strokeWidth="1"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Dot fill */}
          <circle
            cx={dotX} cy={dotY} r={DOT_R}
            fill="rgba(8,9,18,0.88)"
            style={{ pointerEvents: 'none' }}
          />

          {/* Wobbly dot border */}
          <path
            d={dotPath}
            fill="rgba(8,9,18,0.0)"
            stroke={isOffCenter ? 'rgba(99,102,241,0.85)' : 'rgba(255,255,255,0.22)'}
            strokeWidth="1.5"
            filter={isOffCenter ? `url(#${glowId})` : undefined}
            style={{ transition: 'stroke 0.2s', cursor: 'crosshair' }}
            onMouseEnter={() => setDotHovered(true)}
            onMouseLeave={() => setDotHovered(false)}
          />

          {/* Inner pip */}
          <circle
            cx={dotX} cy={dotY} r="3"
            fill={isOffCenter ? '#6366f1' : 'rgba(255,255,255,0.35)'}
            style={{ transition: 'fill 0.2s', pointerEvents: 'none' }}
          />
        </svg>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: '9px', color: '#1e2d42', fontFamily: 'inherit', letterSpacing: '0.07em' }}>
            L · R  ·  NEAR ↑ FAR ↓
          </span>
          <span style={{ fontSize: '9px', color: '#1e2d42', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
            dbl-click reset
          </span>
        </div>

      </div>
    </div>,
    document.body
  )
}
