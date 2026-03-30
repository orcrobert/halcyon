import { useRef, useState, useCallback, useEffect } from 'react'
import { useSpring, useMotionValue, animate } from 'framer-motion'

interface Props {
  value: number
  onChange: (val: number) => void
  disabled?: boolean
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

export function Fader({ value, onChange, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [dragging, setDragging] = useState(false)

  const scale = useSpring(1, { stiffness: SCALE_STIFFNESS, damping: SCALE_DAMPING })
  const pullX = useMotionValue(0)
  const pullY = useMotionValue(0)
  const pullStrength = useMotionValue(0)

  const thumbY = (1 - value) * (TRACK_HEIGHT - THUMB_R * 2)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const s = scale.get()
      const px = pullX.get()
      const py = pullY.get()
      const strength = pullStrength.get()
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

      const baseColor = disabled ? '#2a2b40' : dragging ? '#818cf8' : '#6366f1'
      ctx.fillStyle = baseColor
      ctx.fill()

      ctx.strokeStyle = 'rgba(8,9,14,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [disabled, dragging])

  const getValueFromY = useCallback((clientY: number) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const y = Math.max(0, Math.min(TRACK_HEIGHT, clientY - rect.top))
    return 1 - y / TRACK_HEIGHT
  }, [value])

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onChange(Math.max(0, Math.min(1, getValueFromY(e.clientY))))
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragging) {
      onChange(Math.max(0, Math.min(1, getValueFromY(e.clientY))))
    }

    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const thumbCenterX = rect.left + rect.width / 2
    const thumbCenterY = rect.top + thumbY + THUMB_R
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
        background: '#1e2035',
        borderRadius: '2px',
      }} />

      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: '4px',
        height: `${value * TRACK_HEIGHT}px`,
        background: disabled ? '#2a2b40' : 'rgba(99,102,241,0.4)',
        borderRadius: '2px',
      }} />

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          position: 'absolute',
          left: '50%',
          top: thumbY + THUMB_R - CANVAS_SIZE / 2,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          background: 'transparent',
        }}
      />
    </div>
  )
}
