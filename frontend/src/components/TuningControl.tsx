import { useState, useRef, useCallback, useEffect } from 'react'

const PRESETS = [432, 440, 528]
const MIN = 400
const MAX = 580

const SVG_W = 200
const TOP_PAD = 30
const AXIS_X = 70
const WAVE_X = 130
const WAVE_AMP = 20
const PULL_STRENGTH = 52
const SNAP_ZONE = 6
const SNAP_STRENGTH = 0.35
const SPRING = 0.02
const FRICTION = 0.4

interface Props {
  onTuningChange: (freq: number) => void
  initialFreq?: number
}

function freqToY(freq: number, trackH: number) {
  const t = (freq - MIN) / (MAX - MIN)
  return TOP_PAD + (1 - t) * trackH
}

function yToFreqFloat(y: number, trackH: number) {
  const t = 1 - (y - TOP_PAD) / trackH
  return Math.max(MIN, Math.min(MAX, MIN + t * (MAX - MIN)))
}

function freqToX(freq: number, trackW: number) {
  const t = (freq - MIN) / (MAX - MIN)
  return TOP_PAD + t * trackW
}

function xToFreqFloat(x: number, trackW: number) {
  const t = (x - TOP_PAD) / trackW
  return Math.max(MIN, Math.min(MAX, MIN + t * (MAX - MIN)))
}

function noise(x: number, seed: number) {
  const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function smoothNoise(x: number, seed: number) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return noise(i, seed) * (1 - u) + noise(i + 1, seed) * u
}

function buildWavyLineV(apexY: number, trackH: number, phase: number, seed: number): string {
  const pts: string[] = []
  for (let i = 0; i <= 140; i++) {
    const y = TOP_PAD + (i / 140) * trackH
    const dy = y - apexY
    const nd = Math.abs(dy) / trackH
    const pull = Math.exp(-nd * nd * 38)
    const suppress = 1 - Math.exp(-nd * nd * 60)
    const n1 = smoothNoise(i * 0.07 + phase * 0.28, seed) * 2 - 1
    const n2 = smoothNoise(i * 0.13 + phase * 0.19 + 4.1, seed + 1) * 2 - 1
    const x = WAVE_X + (n1 * 0.6 + n2 * 0.4) * WAVE_AMP * suppress - pull * PULL_STRENGTH
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

function buildWavyLineH(apexX: number, trackW: number, phase: number, seed: number, axisY: number, waveY: number): string {
  const pts: string[] = []
  for (let i = 0; i <= 140; i++) {
    const x = TOP_PAD + (i / 140) * trackW
    const dx = x - apexX
    const nd = Math.abs(dx) / trackW
    const pull = Math.exp(-nd * nd * 38)
    const suppress = 1 - Math.exp(-nd * nd * 60)
    const n1 = smoothNoise(i * 0.07 + phase * 0.28, seed) * 2 - 1
    const n2 = smoothNoise(i * 0.13 + phase * 0.19 + 4.1, seed + 1) * 2 - 1
    const y = waveY + (n1 * 0.6 + n2 * 0.4) * WAVE_AMP * suppress - pull * (waveY - axisY)
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

function applySnap(fFloat: number): number {
  for (const p of PRESETS) {
    const dist = Math.abs(fFloat - p)
    if (dist < SNAP_ZONE) {
      return fFloat + (p - fFloat) * SNAP_STRENGTH * (1 - dist / SNAP_ZONE)
    }
  }
  return fFloat
}

function DiamondMarker({ x, y, glowColor, filterId }: { x: number; y: number; glowColor: string; filterId: string }) {
  const s = 7
  const d = `M ${x} ${y - s} L ${x + s * 0.55} ${y} L ${x} ${y + s} L ${x - s * 0.55} ${y} Z`
  return (
    <>
      <path d={d} fill={glowColor} opacity="0.9" filter={`url(#${filterId})`} />
      <path d={d} fill="white" opacity="0.9" />
      <line x1={x - 14} y1={y} x2={x - s * 0.55 - 3} y2={y} stroke={glowColor} strokeWidth="1" opacity="0.5" />
      <line x1={x + s * 0.55 + 3} y1={y} x2={x + 14} y2={y} stroke={glowColor} strokeWidth="1" opacity="0.5" />
    </>
  )
}

export function TuningControl({ onTuningChange, initialFreq = 440 }: Props) {
  const clamped = Math.max(MIN, Math.min(MAX, initialFreq))
  const [displayFreq, setDisplayFreq] = useState(clamped)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [trackH, setTrackH] = useState(400)
  const [trackW, setTrackW] = useState(260)
  const [isMobile, setIsMobile] = useState(false)
  const [phase, setPhase] = useState(0)
  const [seed] = useState(() => Math.random() * 100)

  const freqRef = useRef(clamped)
  const displayFreqRef = useRef(clamped)
  const targetFreqRef = useRef(clamped)
  const velocityRef = useRef(0)
  const animatingRef = useRef(false)
  const onTuningChangeRef = useRef(onTuningChange)
  useEffect(() => { onTuningChangeRef.current = onTuningChange }, [onTuningChange])

  const rawPosRef = useRef(freqToY(clamped, 400))
  const draggingRef = useRef(false)
  const lastPosRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function measure() {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      if (panelRef.current) {
        if (mobile) {
          const tw = panelRef.current.clientWidth - TOP_PAD * 2 - 20
          setTrackW(tw)
          rawPosRef.current = freqToX(freqRef.current, tw)
        } else {
          const available = panelRef.current.clientHeight - 430
          const h = Math.max(200, available)
          setTrackH(h)
          rawPosRef.current = freqToY(freqRef.current, h)
        }
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

  useEffect(() => {
    let t = 0
    function tick() {
      t += 0.003
      setPhase(t)

      if (animatingRef.current) {
        const diff = targetFreqRef.current - displayFreqRef.current
        velocityRef.current = velocityRef.current * FRICTION + diff * SPRING
        displayFreqRef.current += velocityRef.current
        if (Math.abs(diff) < 0.08 && Math.abs(velocityRef.current) < 0.05) {
          displayFreqRef.current = targetFreqRef.current
          velocityRef.current = 0
          animatingRef.current = false
        }
        const liveFreq = Math.round(displayFreqRef.current)
        freqRef.current = liveFreq
        onTuningChangeRef.current(liveFreq)
        setDisplayFreq(displayFreqRef.current)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const commit = useCallback((rawPos: number, th: number, tw: number, mobile: boolean) => {
    let fFloat: number
    if (mobile) {
      fFloat = xToFreqFloat(Math.max(TOP_PAD, Math.min(TOP_PAD + tw, rawPos)), tw)
    } else {
      fFloat = yToFreqFloat(Math.max(TOP_PAD, Math.min(TOP_PAD + th, rawPos)), th)
    }
    const snapped = applySnap(fFloat)
    const rounded = Math.round(snapped)
    freqRef.current = rounded
    displayFreqRef.current = snapped
    targetFreqRef.current = snapped
    animatingRef.current = false
    velocityRef.current = 0
    setDisplayFreq(snapped)
    onTuningChange(rounded)
  }, [onTuningChange])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault()
    draggingRef.current = true
    setDragging(true)
    lastPosRef.current = isMobile ? e.clientX : e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [isMobile])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    const pos = isMobile ? e.clientX : e.clientY
    rawPosRef.current += pos - lastPosRef.current
    lastPosRef.current = pos
    commit(rawPosRef.current, trackH, trackW, isMobile)
  }, [commit, trackH, trackW, isMobile])

  const onPointerUp = useCallback(() => {
    draggingRef.current = false
    setDragging(false)
  }, [])

  const applyPreset = useCallback((f: number) => {
    targetFreqRef.current = f
    animatingRef.current = true
    rawPosRef.current = isMobile ? freqToX(f, trackW) : freqToY(f, trackH)
  }, [trackH, trackW, isMobile])

  const shownFreq = displayFreq
  const isDetuned = Math.round(shownFreq) !== 440
  const cents = Math.round(1200 * Math.log2(shownFreq / 440))
  const glowColor = '#6366f1'
  const apexY = freqToY(shownFreq, trackH)
  const apexX = freqToX(shownFreq, trackW)
  const pathV = buildWavyLineV(apexY, trackH, phase, seed)
  const pathH = buildWavyLineH(apexX, trackW, phase, seed, 38, 82)

  if (isMobile) {
    const svgW = trackW + TOP_PAD * 2
    const gradStopPct = ((apexX - TOP_PAD) / trackW * 100).toFixed(1)

    return (
      <>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            position: 'fixed', bottom: open ? '220px' : '0px',
            left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '80px', height: '28px',
            background: open ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${open ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`,
            borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
            transition: 'bottom 0.35s cubic-bezier(0.4,0,0.2,1), background 0.2s', padding: 0,
          }}
        >
          <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
            <path d="M1 8 Q10 1 19 8" stroke={open ? '#818cf8' : '#2a3040'} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
          {isDetuned && !open && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />}
        </button>

        <div ref={panelRef} style={{
          position: 'fixed', bottom: open ? '0px' : '-220px', left: 0, right: 0, height: '220px',
          zIndex: 49, background: 'rgba(7,8,13,0.98)', borderTop: '1px solid rgba(99,102,241,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly',
          transition: 'bottom 0.35s cubic-bezier(0.4,0,0.2,1)',
          padding: '12px 20px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#334155', textTransform: 'uppercase', fontFamily: 'inherit' }}>Tuning</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: isDetuned ? '#a5b4fc' : '#475569', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', letterSpacing: '-0.02em' }}>{Math.round(shownFreq)} Hz</span>
            <span style={{ fontSize: '10px', color: cents === 0 ? 'transparent' : '#6366f1', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{cents > 0 ? '+' : ''}{cents}¢</span>
          </div>

          <div style={{ position: 'relative' }}>
            <svg width={svgW} height={120}
              style={{ overflow: 'visible', cursor: dragging ? 'grabbing' : 'ew-resize', touchAction: 'none', userSelect: 'none', display: 'block' }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            >
              <defs>
                <filter id="tcm-bloom" x="-300%" y="-300%" width="700%" height="700%">
                  <feGaussianBlur stdDeviation="12" result="b1" /><feGaussianBlur stdDeviation="4" result="b2" />
                  <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
                </filter>
                <filter id="tcm-soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2.5" /></filter>
                <filter id="tcm-apex" x="-500%" y="-500%" width="1100%" height="1100%">
                  <feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="tcm-grad" x1={TOP_PAD} y1="0" x2={TOP_PAD + trackW} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={glowColor} stopOpacity="0.04" />
                  <stop offset={`${gradStopPct}%`} stopColor={glowColor} stopOpacity="1" />
                  <stop offset="100%" stopColor={glowColor} stopOpacity="0.04" />
                </linearGradient>
              </defs>
              <line x1={TOP_PAD} y1={38} x2={TOP_PAD + trackW} y2={38} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              {PRESETS.map(p => {
                const px = freqToX(p, trackW)
                const active = Math.round(shownFreq) === p
                return (
                  <g key={p}>
                    <line x1={px} y1={33} x2={px} y2={43} stroke={active ? '#818cf8' : 'rgba(255,255,255,0.15)'} strokeWidth={active ? 1.5 : 1} />
                    <text x={px} y={28} fontSize="9" fill={active ? '#818cf8' : '#2a3550'} textAnchor="middle" fontFamily="inherit">{p}</text>
                  </g>
                )
              })}
              <path d={pathH} stroke={glowColor} strokeWidth="14" fill="none" strokeLinecap="round" filter="url(#tcm-bloom)" opacity="0.25" />
              <path d={pathH} stroke={glowColor} strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#tcm-soft)" opacity="0.5" />
              <path d={pathH} stroke="url(#tcm-grad)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d={pathH} stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.3" />
              <DiamondMarker x={apexX} y={38} glowColor={glowColor} filterId="tcm-apex" />
            </svg>
            {/* subtle edge fades */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '18%', height: '100%', background: 'linear-gradient(to right, rgba(7,8,13,0.98), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '18%', height: '100%', background: 'linear-gradient(to left, rgba(7,8,13,0.98), transparent)', pointerEvents: 'none' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            {PRESETS.map(p => {
              const active = Math.round(shownFreq) === p
              return (
                <button key={p} onClick={() => applyPreset(p)} style={{
                  padding: '7px 20px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.1em',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: '100px', cursor: 'pointer',
                  background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                  color: active ? '#c7d2fe' : '#64748b',
                  boxShadow: active ? '0 0 14px rgba(99,102,241,0.25)' : 'none',
                  transition: 'all 0.15s ease',
                }}>{p} Hz</button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // desktop
  const gradStopPct = ((apexY - TOP_PAD) / trackH * 100).toFixed(1)
  const svgH = TOP_PAD + trackH + 20

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', right: open ? '220px' : '0px', top: '50%', transform: 'translateY(-50%)',
          zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '24px', height: '64px',
          background: open ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`,
          borderRight: 'none', borderRadius: '8px 0 0 8px', cursor: 'pointer',
          transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1), background 0.2s, border-color 0.2s', padding: 0,
        }}
      >
        <svg width="10" height="20" viewBox="0 0 10 20" fill="none">
          <path d="M8 1 Q1 10 8 19" stroke={open ? '#818cf8' : '#2a3040'} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
        {isDetuned && !open && <div style={{ position: 'absolute', top: '6px', right: '6px', width: '5px', height: '5px', borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />}
      </button>

      <div ref={panelRef} style={{
        position: 'fixed', right: open ? '0px' : '-220px', top: 0, bottom: 0, width: '220px',
        zIndex: 49, background: 'rgba(7,8,13,0.98)', borderLeft: '1px solid rgba(99,102,241,0.08)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)', paddingTop: '28px', paddingBottom: '28px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#334155', textTransform: 'uppercase', fontFamily: 'inherit' }}>Tuning</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: isDetuned ? '#a5b4fc' : '#475569', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', transition: 'color 0.2s', letterSpacing: '-0.02em' }}>{Math.round(shownFreq)} Hz</span>
          <span style={{ fontSize: '10px', minHeight: '14px', color: cents === 0 ? 'transparent' : '#6366f1', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{cents > 0 ? '+' : ''}{cents}¢</span>
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={SVG_W} height={svgH}
            style={{ overflow: 'visible', cursor: dragging ? 'grabbing' : 'ns-resize', touchAction: 'none', userSelect: 'none', display: 'block' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          >
            <defs>
              <filter id="tcd-bloom" x="-300%" y="-300%" width="700%" height="700%">
                <feGaussianBlur stdDeviation="12" result="b1" /><feGaussianBlur stdDeviation="4" result="b2" />
                <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
              </filter>
              <filter id="tcd-soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2.5" /></filter>
              <filter id="tcd-apex" x="-500%" y="-500%" width="1100%" height="1100%">
                <feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <linearGradient id="tcd-grad" x1="0" y1={TOP_PAD} x2="0" y2={TOP_PAD + trackH} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={glowColor} stopOpacity="0.04" />
                <stop offset={`${gradStopPct}%`} stopColor={glowColor} stopOpacity="1" />
                <stop offset="100%" stopColor={glowColor} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            <line x1={AXIS_X} y1={TOP_PAD} x2={AXIS_X} y2={TOP_PAD + trackH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

            {PRESETS.map(p => {
              const py = freqToY(p, trackH)
              const active = Math.round(shownFreq) === p
              return (
                <g key={p}>
                  <line x1={AXIS_X - 5} y1={py} x2={AXIS_X + 5} y2={py} stroke={active ? '#818cf8' : 'rgba(255,255,255,0.15)'} strokeWidth={active ? 1.5 : 1} />
                  <text x={AXIS_X - 10} y={py + 3.5} fontSize="9" fill={active ? '#818cf8' : '#2a3550'} textAnchor="end" fontFamily="inherit">{p}</text>
                </g>
              )
            })}

            <path d={pathV} stroke={glowColor} strokeWidth="14" fill="none" strokeLinecap="round" filter="url(#tcd-bloom)" opacity="0.25" />
            <path d={pathV} stroke={glowColor} strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#tcd-soft)" opacity="0.5" />
            <path d={pathV} stroke="url(#tcd-grad)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d={pathV} stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.3" />

            <DiamondMarker x={AXIS_X} y={apexY} glowColor={glowColor} filterId="tcd-apex" />
          </svg>
          {/* subtle top/bottom fades using divs — no masks, no SVG filter bullshit */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to bottom, rgba(7,8,13,0.98), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(to top, rgba(7,8,13,0.98), transparent)', pointerEvents: 'none' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
          {PRESETS.map(p => {
            const active = Math.round(shownFreq) === p
            return (
              <button key={p} onClick={() => applyPreset(p)} style={{
                padding: '6px 18px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.1em',
                border: `1px solid ${active ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '100px', cursor: 'pointer',
                background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                color: active ? '#c7d2fe' : '#64748b',
                boxShadow: active ? '0 0 14px rgba(99,102,241,0.25)' : 'none',
                transition: 'all 0.15s ease',
              }}>{p} Hz</button>
            )
          })}
        </div>
      </div>
    </>
  )
}
