import { useEffect, useState } from 'react'
import type { Atmosphere } from '../types'

interface Props {
  atmosphere: Atmosphere
  onCancel: () => void
}

export function GeneratingView({ atmosphere, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">
      <div className="flex flex-col gap-10 w-full" style={{ maxWidth: '560px' }}>

        {/* Header */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.12em] text-indigo-400 font-semibold">
              Generating
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            <h1 className="text-[34px] font-extrabold text-white leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              {atmosphere.title ?? 'Crafting your soundscape'}
            </h1>
            <p className="text-[14px] text-slate-500 leading-relaxed mx-auto line-clamp-3" style={{ maxWidth: '460px' }}>
              {atmosphere.prompt}
            </p>
          </div>
        </div>

        {/* Working card */}
        <div
          className="rounded-2xl border border-[#1e2035] bg-[#0d0e18] flex items-center gap-4"
          style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', padding: '24px 28px' }}
        >
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] text-slate-200 font-medium">
              Working on it…
            </div>
            <div className="text-[12px] text-slate-600 mt-0.5">
              Decomposing the scene, generating each layer, then mixing.
            </div>
          </div>
          <div className="text-[12px] text-slate-500 font-medium tabular-nums shrink-0">
            {formatElapsed(elapsed)}
          </div>
        </div>

        {/* Cancel */}
        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className="text-[12px] text-slate-600 hover:text-slate-300 transition"
          >
            ← Back to prompt (job keeps running)
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
