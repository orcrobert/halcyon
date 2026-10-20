import { useRef, useState, useCallback, useEffect } from 'react'
import { useSpring, useMotionValue, animate } from 'framer-motion'
import { alpha, token } from '../theme'

interface Props {
  value: number
  onChange: (val: number) => void
  disabled?: boolean
  displayValue?: number
  orientation?: 'vertical' | 'horizontal'
}

const TRACK_HEIGHT = 180
const THUMB_R = 10
const CANVAS_SIZE = 40
const JELLY_MAX_DIST = 50
const JELLY_PULL_STRENGTH = 0.5
const JELLY_SMOOTHNESS = 1.5
const JELLY_PULL_DURATION = 0.08
const JELLY_STRENGTH_DURATION = 0.1
const JELLY_RELEASE_DURATION = 0.25
const SCALE_HOVER = 1.4
const SCALE_STIFFNESS = 400
const SCALE_DAMPING = 25

export function Fader({ value, onChange, disabled, displayValue, orientation = 'vertical' }: Props) {
  const horizontal = orientation === 'horizontal'
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [dragging, setDragging] = useState(false)

  const scale = useSpring(1, { stiffness: SCALE_STIFFNESS, damping: SCALE_DAMPING })
  const pullX = useMotionValue(0)
  const pullY = useMotionValue(0)
  const pullStrength = useMotionValue(0)

  const display = displayValue ?? value
  const thumbY = (1 - display) * (TRACK_HEIGHT - THUMB_R * 2)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const idle = token('--color-line-active')
    const accent = token('--color-accent')
    const accentBright = token('--color-accent-bright')
    const outline = alpha(token('--color-bg'), 50)
    let drawn: [number, number, number, number] | null = null

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const s = scale.get()
      const px = pullX.get()
      const py = pullY.get()
      const strength = pullStrength.get()
      if (drawn && drawn[0] === s && drawn[1] === px && drawn[2] === py && drawn[3] === strength) return
      drawn = [s, px, py, strength]
      const r = THUMB_R * s
      const cx = CANVAS_SIZE / 2
      const cy = CANVAS_SIZE / 2

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

      const angle = Math.atan2(py, px)
      const pull = strength * r * JELLY_PULL_STRENGTH

      ctx.beginPath()

      const points = 128
      for (let i = 0; i <= points; i++) {
        const t = (i / points) * Math.PI * 2
        const cosT = Math.cos(t)
        const sinT = Math.sin(t)

        const dot = cosT * Math.cos(angle) + sinT * Math.sin(angle)
        const influence = Math.pow((dot + 1) / 2, JELLY_SMOOTHNESS)
        const deform = influence * pull

        const x = cx + cosT * (r + deform)
        const y = cy + sinT * (r + deform)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      ctx.closePath()

      const baseColor = disabled ? idle : dragging ? accentBright : accent
      ctx.fillStyle = baseColor
      ctx.fill()

      ctx.strokeStyle = outline
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [disabled, dragging, horizontal])

  const getValue = useCallback((e: React.PointerEvent) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    if (horizontal) {
      const span = rect.width - THUMB_R * 2
      return span > 0 ? (e.clientX - rect.left - THUMB_R) / span : value
    }
    const y = Math.max(0, Math.min(TRACK_HEIGHT, e.clientY - rect.top))
    return 1 - y / TRACK_HEIGHT
  }, [value, horizontal])

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onChange(Math.max(0, Math.min(1, getValue(e))))
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragging) {
      onChange(Math.max(0, Math.min(1, getValue(e))))
    }

    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const thumbCenterX = horizontal
      ? rect.left + THUMB_R + display * (rect.width - THUMB_R * 2)
      : rect.left + rect.width / 2
    const thumbCenterY = horizontal ? rect.top + rect.height / 2 : rect.top + thumbY + THUMB_R
    const dx = e.clientX - thumbCenterX
    const dy = e.clientY - thumbCenterY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const p = Math.max(0, (dist / JELLY_MAX_DIST) * (1 - dist / JELLY_MAX_DIST) * 4)

    if (dist > 0) {
      animate(pullX, dx / dist, { duration: JELLY_PULL_DURATION })
      animate(pullY, dy / dist, { duration: JELLY_PULL_DURATION })
    }
    animate(pullStrength, p, { duration: JELLY_STRENGTH_DURATION })
  }

  function handlePointerUp() {
    setDragging(false)
  }

  function handleMouseEnter() {
    if (disabled) return
    scale.set(SCALE_HOVER)
  }

  function handleMouseLeave() {
    setDragging(false)
    scale.set(1)
    animate(pullStrength, 0, { duration: JELLY_RELEASE_DURATION })
    animate(pullX, 0, { duration: JELLY_RELEASE_DURATION })
    animate(pullY, 0, { duration: JELLY_RELEASE_DURATION })
  }

  const canvas = (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      style={horizontal ? {
        position: 'absolute',
        top: '50%',
        left: `calc(${display} * (100% - ${THUMB_R * 2}px) + ${THUMB_R - CANVAS_SIZE / 2}px)`,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        background: 'transparent',
      } : {
        position: 'absolute',
        left: '50%',
        top: thumbY + THUMB_R - CANVAS_SIZE / 2,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    />
  )

  if (horizontal) {
    return (
      <div
        ref={trackRef}
        style={{ width: '100%', height: `${CANVAS_SIZE}px`, position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          height: '4px',
          width: '100%',
          background: 'linear-gradient(to right, var(--color-surface-high) 0%, var(--color-line) 50%, var(--color-surface-high) 100%)',
          borderRadius: '2px',
          boxShadow: `inset 0 0 0 1px ${alpha('var(--color-wash)', 2)}`,
        }} />

        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          height: '4px',
          width: `${display * 100}%`,
          background: disabled
            ? 'var(--color-line-active)'
            : `linear-gradient(to right, ${alpha('var(--color-accent)', 15)} 0%, ${alpha('var(--color-accent)', 55)} 60%, ${alpha('var(--color-accent-bright)', 85)} 100%)`,
          borderRadius: '2px',
          boxShadow: disabled
            ? 'none'
            : `0 0 8px ${alpha('var(--color-accent)', 35)}, inset 0 0 0 1px ${alpha('var(--color-accent-bright)', 15)}`,
          transition: 'box-shadow 0.25s ease',
        }} />

        {canvas}
      </div>
    )
  }

  return (
    <div
      ref={trackRef}
      style={{ width: `${CANVAS_SIZE}px`, height: `${TRACK_HEIGHT}px`, position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        transform: 'translateX(-50%)',
        width: '4px',
        height: '100%',
        background: 'linear-gradient(to bottom, var(--color-surface-high) 0%, var(--color-line) 50%, var(--color-surface-high) 100%)',
        borderRadius: '2px',
        boxShadow: `inset 0 0 0 1px ${alpha('var(--color-wash)', 2)}`,
      }} />

      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: '4px',
        height: `${display * TRACK_HEIGHT}px`,
        background: disabled
          ? 'var(--color-line-active)'
          : `linear-gradient(to top, ${alpha('var(--color-accent)', 15)} 0%, ${alpha('var(--color-accent)', 55)} 60%, ${alpha('var(--color-accent-bright)', 85)} 100%)`,
        borderRadius: '2px',
        boxShadow: disabled
          ? 'none'
          : `0 0 8px ${alpha('var(--color-accent)', 35)}, inset 0 0 0 1px ${alpha('var(--color-accent-bright)', 15)}`,
        transition: 'box-shadow 0.25s ease',
      }} />

      {canvas}
    </div>
  )
}
