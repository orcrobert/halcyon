import { useEffect, useRef } from 'react'
import { alpha, token } from '../theme'

interface Props {
  getAnalyser: () => AnalyserNode | null
  playing: boolean
}

const FADE_SPEED = 0.08
const BAR_ATTACK = 0.85
const BAR_RELEASE = 0.16
const BARS = 56
const SPATIAL_SMOOTHING = 0.08
const REFERENCE_W = 1280
const REFERENCE_H = 128
const DISPLAY_H = 64
const MAX_DPR = 2

export function Visualizer({ getAnalyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const amplitudeRef = useRef(0)
  const barsRef = useRef<Float32Array>(new Float32Array(BARS))
  const tmpRef = useRef<Float32Array>(new Float32Array(BARS))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(DISPLAY_H * dpr))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const accent = token('--color-accent')
    let data = new Uint8Array(0)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)

      const analyser = getAnalyser()
      const W = canvas.width
      const H = canvas.height

      const target = playing ? 1 : 0
      amplitudeRef.current += (target - amplitudeRef.current) * FADE_SPEED
      const amp = amplitudeRef.current

      ctx.clearRect(0, 0, W, H)

      const bars = barsRef.current
      const tmp = tmpRef.current

      if (analyser) {
        const bin = analyser.frequencyBinCount
        if (data.length !== bin) data = new Uint8Array(bin)
        analyser.getByteFrequencyData(data)
        const usable = Math.floor(bin * 0.65)

        for (let i = 0; i < BARS; i++) {
          const t = i / (BARS - 1)
          const srcIdx = Math.floor(Math.pow(t, 1.5) * usable)
          tmp[i] = (data[srcIdx] / 255) * amp
        }

        for (let i = 0; i < BARS; i++) {
          const left = i > 0 ? tmp[i - 1] : tmp[i]
          const right = i < BARS - 1 ? tmp[i + 1] : tmp[i]
          const blurred = tmp[i] * (1 - SPATIAL_SMOOTHING) + (left + right) / 2 * SPATIAL_SMOOTHING
          const prev = bars[i]
          const rate = blurred > prev ? BAR_ATTACK : BAR_RELEASE
          bars[i] = prev + (blurred - prev) * rate
        }
      } else {
        for (let i = 0; i < BARS; i++) bars[i] *= 0.93
      }

      if (amp < 0.002) return

      const scale = W / REFERENCE_W
      const gap = 4 * scale
      const barWidth = Math.max(1, (W - gap * (BARS - 1)) / BARS)
      const baseline = H - H / REFERENCE_H
      const maxBarH = H - 2 * H / REFERENCE_H

      ctx.beginPath()
      for (let i = 0; i < BARS; i++) {
        const v = bars[i]
        if (v < 0.005) continue
        const x = i * (barWidth + gap)
        const barH = Math.max(1, v * maxBarH)
        ctx.rect(x, baseline - barH, barWidth, barH)
      }

      ctx.save()
      ctx.shadowColor = alpha(accent, 95 * amp)
      ctx.shadowBlur = 32 * scale
      ctx.fillStyle = alpha(accent, 80 * amp)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.shadowColor = alpha(accent, 85 * amp)
      ctx.shadowBlur = 12 * scale
      ctx.fillStyle = alpha(accent, 95 * amp)
      ctx.fill()
      ctx.restore()

    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, getAnalyser])

  return (
    <canvas
      ref={canvasRef}
      width={REFERENCE_W}
      height={REFERENCE_H}
      style={{ width: '100%', maxWidth: '640px', height: `${DISPLAY_H}px`, display: 'block' }}
    />
  )
}
