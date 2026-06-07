import { useEffect, useRef } from 'react'

interface Props {
  getAnalyser: () => AnalyserNode | null
  playing: boolean
}

const FADE_SPEED = 0.08
const BAR_ATTACK = 0.85
const BAR_RELEASE = 0.16
const BARS = 56
const SPATIAL_SMOOTHING = 0.08

export function Visualizer({ getAnalyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const amplitudeRef = useRef(0)
  const barsRef = useRef<Float32Array>(new Float32Array(BARS))
  const tmpRef = useRef<Float32Array>(new Float32Array(BARS))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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
        const data = new Uint8Array(bin)
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

      const gap = 4
      const barWidth = Math.max(1, (W - gap * (BARS - 1)) / BARS)
      const baseline = H - 1
      const maxBarH = H - 2

      ctx.save()
      ctx.shadowColor = `rgba(99,102,241,${0.95 * amp})`
      ctx.shadowBlur = 32
      for (let i = 0; i < BARS; i++) {
        const v = bars[i]
        if (v < 0.005) continue
        const x = i * (barWidth + gap)
        const barH = Math.max(1, v * maxBarH)
        const top = baseline - barH
        ctx.fillStyle = `rgba(99,102,241,${0.8 * amp})`
        ctx.fillRect(x, top, barWidth, barH)
      }
      ctx.restore()

      ctx.save()
      ctx.shadowColor = `rgba(99,102,241,${0.85 * amp})`
      ctx.shadowBlur = 12
      for (let i = 0; i < BARS; i++) {
        const v = bars[i]
        if (v < 0.005) continue
        const x = i * (barWidth + gap)
        const barH = Math.max(1, v * maxBarH)
        const top = baseline - barH
        ctx.fillStyle = `rgba(99,102,241,${0.95 * amp})`
        ctx.fillRect(x, top, barWidth, barH)
      }
      ctx.restore()

    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, getAnalyser])

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={128}
      style={{ width: '100%', maxWidth: '640px', height: '64px', display: 'block' }}
    />
  )
}
