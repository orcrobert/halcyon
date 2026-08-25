import { useRef, useCallback, useState } from 'react'

interface Props {
  value: number        // -1.0 to +1.0
  defaultValue: number // model-suggested pan (reset target)
  onChange: (pan: number) => void
}

const SIZE = 36
const CX = SIZE / 2
const CY = SIZE / 2
const R = 13
const MIN_ANGLE = -135
const MAX_ANGLE = 135

function polarToXY(angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}

function panToAngle(pan: number) {
  return MIN_ANGLE + ((pan + 1) / 2) * (MAX_ANGLE - MIN_ANGLE)
}

function describeArc(startAngle: number, endAngle: number) {
  const start = polarToXY(startAngle)
  const end = polarToXY(endAngle)
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  const sweep = endAngle > startAngle ? 1 : 0
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`
}

export function PanKnob({ value, defaultValue, onChange }: Props) {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startValue = useRef(0)
  const [hovered, setHovered] = useState(false)

  const angle = panToAngle(value)
  const centerAngle = panToAngle(0)
  const dotPos = polarToXY(angle)

  const trackPath = describeArc(MIN_ANGLE, MAX_ANGLE)
  const fillPath = value >= 0
    ? describeArc(centerAngle, angle)
    : describeArc(angle, centerAngle)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startValue.current = value
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [value])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dy = startY.current - e.clientY  // up = increase
    const delta = dy / 120                  // 120px drag = full range
    const next = Math.max(-1, Math.min(1, startValue.current + delta))
    onChange(Math.round(next * 100) / 100)
  }, [onChange])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const onDoubleClick = useCallback(() => {
    onChange(defaultValue)
  }, [onChange, defaultValue])

  const panLabel = value === 0 ? 'C'
    : value < 0 ? `L${Math.round(Math.abs(value) * 100)}`
    : `R${Math.round(value * 100)}`

  const isDetuned = Math.abs(value) > 0.03

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'ns-resize', userSelect: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ touchAction: 'none', overflow: 'visible' }}
      >
        {/* Track arc */}
        <path
          d={trackPath}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ stroke: hovered ? 'var(--color-line-active)' : 'var(--color-line)', transition: 'stroke 0.15s' }}
        />

        {/* Fill arc (center → value) */}
        {Math.abs(value) > 0.01 && (
          <path
            d={fillPath}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ stroke: isDetuned ? 'var(--color-accent)' : 'var(--color-ink-ghost)' }}
          />
        )}

        {/* Center tick */}
        <line
          x1={CX} y1={CY - R + 4}
          x2={CX} y2={CY - R + 7}
          strokeWidth="1"
          style={{ stroke: 'var(--color-line-active)', transform: `rotate(${centerAngle - 0}deg)`, transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* Knob body */}
        <circle
          cx={CX} cy={CY} r="7"
          strokeWidth="1"
          style={{
            fill: hovered ? 'var(--color-surface-hover)' : 'var(--color-surface-high)',
            stroke: isDetuned ? 'var(--color-accent)' : 'var(--color-line-active)',
            transition: 'fill 0.15s, stroke 0.15s',
          }}
        />

        {/* Pointer dot on knob */}
        <circle cx={dotPos.x} cy={dotPos.y} r="1.5" style={{ fill: isDetuned ? 'var(--color-accent)' : 'var(--color-ink-faint)' }} />
      </svg>

      {/* Pan label */}
      <span style={{
        fontSize: '9px',
        fontFamily: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        color: isDetuned ? 'var(--color-accent)' : 'var(--color-ink-faint)',
        letterSpacing: '0.04em',
        transition: 'color 0.15s',
      }}>
        {panLabel}
      </span>
    </div>
  )
}
