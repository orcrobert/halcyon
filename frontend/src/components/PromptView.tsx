import { useState, useEffect, useRef, type KeyboardEvent } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  loading: boolean
  error: string | null
  onLogout?: () => void
  onOpenHistory?: () => void
}

interface Ripple {
  x: number
  amp: number
  freq: number
  phase: number
  t0: number
  decay: number
}

interface BreathingWaveProps {
  pulseKey: string
  pulseSeq: number
}

function BreathingWave({ pulseKey, pulseSeq }: BreathingWaveProps) {
  const [path, setPath] = useState('')
  const rafRef = useRef(0)
  const tRef = useRef(0)
  const ripplesRef = useRef<Ripple[]>([])

  useEffect(() => {
    if (pulseSeq === 0 || !pulseKey) return

    const isSpace = pulseKey === ' '
    const isBack = pulseKey === 'Backspace'
    const code = pulseKey.charCodeAt(0) || 32

    let x: number
    let amp: number
    let freq: number
    let decay: number

    if (isSpace) {
      x = 0.5
      amp = 1.6
      freq = 3.0
      decay = 2.2
    } else if (isBack) {
      x = ripplesRef.current.length > 0
        ? ripplesRef.current[ripplesRef.current.length - 1].x
        : 0.5
      amp = -1.1
      freq = 4.5
      decay = 3.0
    } else {
      x = ((code * 53) % 1000) / 1000
      const isVowel = 'aeiouAEIOU'.includes(pulseKey)
      const isUpper = pulseKey >= 'A' && pulseKey <= 'Z'
      amp = (isVowel ? 1.2 : 0.85) * (isUpper ? 1.4 : 1.0)
      freq = 2.5 + ((code * 31) % 60) / 10
      decay = 2.6 + (code % 7) * 0.15
    }

    ripplesRef.current.push({
      x,
      amp,
      freq,
      phase: (code % 360) * (Math.PI / 180),
      t0: tRef.current,
      decay,
    })
  }, [pulseSeq, pulseKey])

  useEffect(() => {
    const W = 720
    const H = 80
    const MID = H / 2
    const SAMPLES = 180

    function tick() {
      tRef.current += 0.006
      const t = tRef.current
      const breath = 0.55 + 0.45 * Math.sin(t * 0.7)

      const active: Ripple[] = []
      for (const r of ripplesRef.current) {
        const age = t - r.t0
        if (Math.exp(-age * r.decay) > 0.015) active.push(r)
      }
      ripplesRef.current = active

      const pts: string[] = []
      for (let i = 0; i <= SAMPLES; i++) {
        const xPx = (i / SAMPLES) * W
        const u = (i / SAMPLES) * Math.PI * 2

        const a1 = Math.sin(u * 1.0 + t * 1.2) * 12 * breath
        const a2 = Math.sin(u * 2.3 + t * 0.7) * 6 * breath
        const a3 = Math.sin(u * 0.5 - t * 0.5) * 4

        let ripple = 0
        const norm = i / SAMPLES
        for (const r of active) {
          const age = t - r.t0
          const life = Math.exp(-age * r.decay)
          const dist = norm - r.x
          const spatial = Math.exp(-dist * dist * 55)
          ripple += r.amp * 18 * life * spatial * Math.sin(age * r.freq * 6 - dist * 22 + r.phase)
        }

        const envelope = Math.sin((i / SAMPLES) * Math.PI)
        const y = MID + (a1 + a2 + a3) * envelope + ripple * envelope

        pts.push(`${i === 0 ? 'M' : 'L'} ${xPx.toFixed(2)} ${y.toFixed(2)}`)
      }

      setPath(pts.join(' '))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="relative w-full flex justify-center pointer-events-none" style={{ height: 80 }}>
      <svg width="720" height="80" viewBox="0 0 720 80" style={{ overflow: 'visible', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="bw-grad" x1="0" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <filter id="bw-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b1" />
            <feGaussianBlur stdDeviation="2" result="b2" />
            <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
          </filter>
        </defs>
        <path d={path} stroke="url(#bw-grad)" strokeWidth="10" fill="none" strokeLinecap="round" filter="url(#bw-glow)" opacity="0.18" />
        <path d={path} stroke="url(#bw-grad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={path} stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  )
}

export function PromptView({ onSubmit, loading, error, onLogout, onOpenHistory }: Props) {
  const [prompt, setPrompt] = useState('')
  const [pulse, setPulse] = useState({ key: '', seq: 0 })

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (prompt.trim() && !loading) onSubmit(prompt.trim())
      return
    }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === ' ') {
      setPulse(p => ({ key: e.key, seq: p.seq + 1 }))
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">

      {onOpenHistory && (
        <button
          onClick={onOpenHistory}
          className="absolute top-6 left-6 w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition"
          aria-label="Open history"
          title="History"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      )}

      {onLogout && (
        <button
          onClick={onLogout}
          className="absolute top-6 right-6 text-xs text-white/40 hover:text-white/70 transition"
        >
          Sign out
        </button>
      )}

      <div className="flex flex-col gap-10 w-full" style={{ maxWidth: '640px' }}>

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-[10px] uppercase tracking-[0.32em] text-slate-600 font-medium">
            Atmosphere
          </span>
          <p className="text-[15px] text-slate-400 leading-relaxed mx-auto" style={{ maxWidth: '440px', fontWeight: 300, letterSpacing: '-0.005em' }}>
            Describe a place. Hear it built, layer by layer.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl border border-[#1e2035] bg-[#0d0e18] transition-opacity"
            style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', opacity: loading ? 0.6 : 1 }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="A place, a mood, a moment in time…"
              rows={5}
              className="w-full bg-transparent text-slate-200 resize-none border-none outline-none placeholder:text-slate-600 text-[15px] leading-relaxed"
              style={{ padding: '24px 28px 12px 28px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div className="flex items-center justify-between" style={{ padding: '0 28px 20px 28px' }}>
              <span className="text-[11px] text-slate-700">Shift + Enter for new line</span>
              <button
                onClick={() => prompt.trim() && !loading && onSubmit(prompt.trim())}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 text-white text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: loading || !prompt.trim() ? 'rgba(99,102,241,0.25)' : '#6366f1',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                    <span className="ml-1.5">Generating...</span>
                  </span>
                ) : (
                  <>
                    Generate
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-center text-red-500 text-sm">{error}</p>}
          {loading && (
            <p className="text-center text-slate-500 text-sm">
              Decomposing prompt and generating audio — this takes ~30 seconds...
            </p>
          )}
        </div>

        {!loading && <BreathingWave pulseKey={pulse.key} pulseSeq={pulse.seq} />}

      </div>
    </div>
  )
}
