import { useEffect, useRef, useState } from 'react'
import type { Atmosphere } from '../types'
import { alpha, token } from '../theme'
import { STAGES, resolveStage } from '../stages'

interface Props {
  atmosphere: Atmosphere
  onCancel: () => void
}

const CANVAS_W = 1520
const CANVAS_H = 600
const MID = CANVAS_H / 2
const SAMPLES = 280
const MAX_LAYERS = 7
const NEW_LAYER_EVERY_MS = 2800
const SLOT_SPACING = (CANVAS_H - 160) / (MAX_LAYERS - 1)
const SLOT_ORDER = [3, 1, 5, 0, 6, 2, 4]

interface Layer {
  bornAt: number
  yOffset: number
  freq1: number
  freq2: number
  phase: number
  speed: number
  amp: number
}

function GenerationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const layersRef = useRef<Layer[]>([])
  const startRef = useRef(0)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const accent = token('--color-accent')
    const accentPale = token('--color-accent-pale')

    startRef.current = performance.now()
    layersRef.current = [spawnLayer(0, 0)]

    function spawnLayer(seed: number, layerIndex: number): Layer {
      const rng = () => {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }
      const slot = SLOT_ORDER[layerIndex % MAX_LAYERS]
      const slotY = (slot - (MAX_LAYERS - 1) / 2) * SLOT_SPACING
      const jitter = (rng() - 0.5) * 12
      return {
        bornAt: performance.now(),
        yOffset: slotY + jitter,
        freq1: 1.0 + rng() * 2.5,
        freq2: 0.5 + rng() * 1.5,
        phase: rng() * Math.PI * 2,
        speed: 0.4 + rng() * 0.8,
        amp: 28 + rng() * 36,
      }
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      tRef.current += 0.012
      const now = performance.now()
      const ageMs = now - startRef.current

      const wantedLayers = Math.min(MAX_LAYERS, 1 + Math.floor(ageMs / NEW_LAYER_EVERY_MS))
      while (layersRef.current.length < wantedLayers) {
        const idx = layersRef.current.length
        layersRef.current.push(spawnLayer(idx * 1337 + Math.floor(ageMs), idx))
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const breath = 0.85 + 0.15 * Math.sin(tRef.current * 0.6)

      for (let li = 0; li < layersRef.current.length; li++) {
        const layer = layersRef.current[li]
        const age = (now - layer.bornAt) / 1000
        const fadeIn = Math.min(1, age / 1.5)

        const points: { x: number; y: number }[] = []
        for (let i = 0; i <= SAMPLES; i++) {
          const x = (i / SAMPLES) * CANVAS_W
          const u = (i / SAMPLES) * Math.PI * 2
          const a = Math.sin(u * layer.freq1 + tRef.current * layer.speed + layer.phase) * layer.amp
          const b = Math.sin(u * layer.freq2 - tRef.current * layer.speed * 0.6 + layer.phase * 0.5) * layer.amp * 0.5
          const envelope = Math.sin((i / SAMPLES) * Math.PI)
          const y = MID + layer.yOffset + (a + b) * envelope * breath
          points.push({ x, y })
        }

        ctx.save()
        ctx.shadowColor = alpha(accent, 60 * fadeIn)
        ctx.shadowBlur = 28
        ctx.strokeStyle = alpha(accent, 55 * fadeIn)
        ctx.lineWidth = 4.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i]
          const p1 = points[i + 1]
          ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2)
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
        ctx.stroke()
        ctx.restore()

        ctx.strokeStyle = alpha(accentPale, 50 * fadeIn)
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i]
          const p1 = points[i + 1]
          ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2)
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
        ctx.stroke()
      }
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    />
  )
}

function StageTracker({ atmosphere }: { atmosphere: Atmosphere }) {
  const { index: active, label, detail, settled } = resolveStage(atmosphere)

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-1.5 w-full" style={{ maxWidth: '520px' }}>
        {STAGES.map((stage, i) => (
          <span
            key={stage.key}
            className={`flex-1 rounded-full transition-colors duration-700 ${
              i < active ? 'bg-accent/60' : i === active ? 'bg-accent-bright animate-pulse' : 'bg-line'
            }`}
            style={{ height: 2, animationDuration: '1.8s' }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
        <span className="text-accent-bright/90">{label}</span>
        {!settled && (
          <>
            <span className="text-ink-ghost">·</span>
            <span className="text-ink-faint tabular-nums">
              step {active + 1} of {STAGES.length}
            </span>
          </>
        )}
      </div>

      <p
        key={detail}
        className="text-[13px] text-ink-soft text-center leading-relaxed"
        style={{ maxWidth: '520px', fontWeight: 300, animation: 'fade-in 0.4s ease-out' }}
      >
        {detail}
      </p>
    </div>
  )
}

function elapsedSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
}

export function GeneratingView({ atmosphere, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(() => elapsedSince(atmosphere.created_at))
  useEffect(() => {
    const t = setInterval(() => setElapsed(elapsedSince(atmosphere.created_at)), 1000)
    return () => clearInterval(t)
  }, [atmosphere.created_at])

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">
      <div className="flex flex-col gap-10 w-full" style={{ maxWidth: '880px' }}>

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-[10px] uppercase tracking-[0.32em] text-accent-bright/70 font-medium">
            Composing
          </span>
          {atmosphere.title && (
            <h1 className="text-[20px] text-ink leading-tight" style={{ fontWeight: 400, letterSpacing: '-0.01em' }}>
              {atmosphere.title}
            </h1>
          )}
          <p className="text-[13px] text-ink-muted leading-relaxed mx-auto line-clamp-3 italic" style={{ maxWidth: '560px', fontWeight: 300 }}>
            &ldquo;{atmosphere.prompt}&rdquo;
          </p>
        </div>

        <GenerationCanvas />

        <div className="flex flex-col items-center gap-5">
          <StageTracker atmosphere={atmosphere} />

          <div className="flex items-center justify-center gap-5 text-[11px] uppercase tracking-[0.18em]">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-accent-bright/80 animate-pulse"
                  style={{ animationDelay: `${i * 0.18}s`, animationDuration: '1.4s' }}
                />
              ))}
            </div>
            <span className="text-ink-ghost">·</span>
            <span className="text-accent-bright/80 tabular-nums">{formatElapsed(elapsed)}</span>
            <span className="text-ink-ghost">·</span>
            <span className="text-ink-faint tabular-nums">{atmosphere.duration_s}s layers</span>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className="text-[11px] text-ink-faint hover:text-ink-soft transition tracking-wide"
          >
            ← back to prompt (job keeps running)
          </button>
        </div>

      </div>
    </div>
  )
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem.toString().padStart(2, '0')}s`
}
