import { useEffect, useRef } from 'react'

interface Props {
  getAnalyser: () => AnalyserNode | null
  playing: boolean
}

const FADE_SPEED = 0.04

export function Visualizer({ getAnalyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const amplitudeRef = useRef(0)

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

      if (!analyser || amp < 0.001) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(99,102,241,${0.15 * (1 - amp)})`
        ctx.lineWidth = 1
        ctx.moveTo(0, H / 2)
        ctx.lineTo(W, H / 2)
        ctx.stroke()
        return
      }

      const bufferLength = analyser.frequencyBinCount
      const data = new Uint8Array(bufferLength)
      analyser.getByteFrequencyData(data)

      const barWidth = W / bufferLength * 2
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = (data[i] / 255) * amp
        const barH = v * H
        const alpha = (0.15 + v * 0.7) * amp
        ctx.fillStyle = `rgba(99,102,241,${alpha})`
        ctx.fillRect(x, H - barH, barWidth - 1, barH)
        x += barWidth
      }
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, getAnalyser])

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={64}
      style={{ width: '100%', maxWidth: '640px', height: '64px', display: 'block' }}
    />
  )
}
