import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_STYLE_S,
  MIN_STYLE_S,
  clamp,
  formatTime,
  initialSelection,
  moveSelection,
  peaks,
  renderExcerpt,
  resizeEnd,
  resizeStart,
  viewWindow,
  type Selection,
  type StyleClip,
} from '../hooks/styleClip'

interface Props {
  open: boolean
  file: File | null
  initial: Selection | null
  onConfirm: (clip: StyleClip) => void
  onClose: () => void
}

type DragMode = 'start' | 'end' | 'move'

const MODAL_W = 640
const DETAIL_SPAN_S = 12
const DETAIL_BINS = 180
const OVERVIEW_BINS = 220
const DETAIL_H = 112
const OVERVIEW_H = 34
const FADE_S = 0.012
const NUDGE_S = 0.1
const NUDGE_FAST_S = 0.5

interface WaveProps {
  values: Float32Array
  height: number
  highlight: Selection | null
}

function Wave({ values, height, highlight }: WaveProps) {
  const clipId = `wave-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const bins = values.length
  const bars = useMemo(() => {
    const out: { x: number; y: number; h: number }[] = []
    for (let i = 0; i < bins; i++) {
      const h = Math.max(1.5, values[i] * 94)
      out.push({ x: i + 0.18, y: 50 - h / 2, h })
    }
    return out
  }, [values, bins])

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${bins} 100`}
      preserveAspectRatio="none"
      style={{ display: 'block', pointerEvents: 'none' }}
      aria-hidden
    >
      {highlight && (
        <defs>
          <clipPath id={clipId}>
            <rect x={highlight.start * bins} y={0} width={Math.max(0, (highlight.end - highlight.start) * bins)} height={100} />
          </clipPath>
        </defs>
      )}
      <g style={{ fill: 'var(--color-ink-veil)' }}>
        {bars.map((bar, i) => (
          <rect key={i} x={bar.x} y={bar.y} width={0.64} height={bar.h} rx={0.3} />
        ))}
      </g>
      {highlight && (
        <g clipPath={`url(#${clipId})`} style={{ fill: 'var(--color-accent-bright)' }}>
          {bars.map((bar, i) => (
            <rect key={i} x={bar.x} y={bar.y} width={0.64} height={bar.h} rx={0.3} />
          ))}
        </g>
      )}
    </svg>
  )
}

function Handle({
  side, value, min, max, onPointerDown, onNudge,
}: {
  side: 'start' | 'end'
  value: number
  min: number
  max: number
  onPointerDown: (e: ReactPointerEvent) => void
  onNudge: (delta: number) => void
}) {
  function onKeyDown(e: ReactKeyboardEvent) {
    const step = e.shiftKey ? NUDGE_FAST_S : NUDGE_S
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onNudge(-step)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onNudge(step)
    }
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={side === 'start' ? 'Excerpt start' : 'Excerpt end'}
      aria-valuemin={Number(min.toFixed(2))}
      aria-valuemax={Number(max.toFixed(2))}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={formatTime(value)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="focus-visible:outline-none group"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side === 'start' ? 'left' : 'right']: -12,
        width: 24,
        cursor: 'ew-resize',
        touchAction: 'none',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 2,
      }}
    >
      <span
        className="group-focus-visible:ring-2 ring-accent-soft"
        style={{
          width: 4,
          height: '100%',
          borderRadius: 2,
          background: 'var(--color-accent-bright)',
          boxShadow: '0 0 10px color-mix(in srgb, var(--color-accent) 60%, transparent)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 12,
          height: 26,
          borderRadius: 4,
          background: 'var(--color-accent-bright)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        <span style={{ width: 4, height: 1, background: 'var(--color-surface-sunken)' }} />
        <span style={{ width: 4, height: 1, background: 'var(--color-surface-sunken)' }} />
        <span style={{ width: 4, height: 1, background: 'var(--color-surface-sunken)' }} />
      </span>
    </div>
  )
}

export function StyleClipModal({ open, file, initial, onConfirm, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 })
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [encoding, setEncoding] = useState(false)
  const [frozenView, setFrozenView] = useState<Selection | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const rafRef = useRef(0)
  const detailRef = useRef<HTMLDivElement>(null)
  const overviewRef = useRef<HTMLDivElement>(null)

  const duration = buffer?.duration ?? 0

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const source = sourceRef.current
    const gain = gainRef.current
    sourceRef.current = null
    gainRef.current = null
    if (source) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    gain?.disconnect()
    setPlaying(false)
    setPlayhead(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => {
      cancelAnimationFrame(id)
      setVisible(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !file) return
    let cancelled = false
    setBuffer(null)
    setError(null)
    setEncoding(false)

    const ctx = ctxRef.current ?? new AudioContext()
    ctxRef.current = ctx

    file.arrayBuffer()
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((decoded) => {
        if (cancelled) return
        if (decoded.duration < MIN_STYLE_S) {
          setError(`This clip is ${decoded.duration.toFixed(1)}s long. The style excerpt needs at least ${MIN_STYLE_S}s.`)
          return
        }
        setBuffer(decoded)
        const restored = initial && initial.end <= decoded.duration + 0.01
          ? resizeEnd(resizeStart(initial, initial.start, decoded.duration), initial.end, decoded.duration)
          : initialSelection(decoded.duration)
        setSelection(restored)
      })
      .catch(() => {
        if (!cancelled) setError('This file could not be read as audio. Try an MP3, WAV, OGG or FLAC file.')
      })

    return () => {
      cancelled = true
    }
  }, [open, file, initial])

  useEffect(() => {
    if (open) return
    stop()
    const ctx = ctxRef.current
    ctxRef.current = null
    void ctx?.close().catch(() => undefined)
  }, [open, stop])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    void ctxRef.current?.close().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const play = useCallback(async () => {
    const ctx = ctxRef.current
    if (!ctx || !buffer) return
    stop()
    await ctx.resume()

    const length = selection.end - selection.start
    const gain = ctx.createGain()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(ctx.destination)

    const t0 = ctx.currentTime + 0.02
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(1, t0 + FADE_S)
    gain.gain.setValueAtTime(1, t0 + length - FADE_S)
    gain.gain.linearRampToValueAtTime(0, t0 + length)
    source.start(t0, selection.start, length)
    sourceRef.current = source
    gainRef.current = gain
    setPlaying(true)

    source.onended = () => {
      if (sourceRef.current !== source) return
      sourceRef.current = null
      gainRef.current = null
      source.disconnect()
      gain.disconnect()
      cancelAnimationFrame(rafRef.current)
      setPlaying(false)
      setPlayhead(null)
    }

    const startAt = selection.start
    const tick = () => {
      const elapsed = Math.max(0, ctx.currentTime - t0)
      setPlayhead(startAt + Math.min(elapsed, length))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [buffer, selection, stop])

  const view = useMemo(
    () => frozenView ?? viewWindow(selection, duration, DETAIL_SPAN_S),
    [frozenView, selection, duration],
  )
  const viewSpan = Math.max(0.001, view.end - view.start)

  const detailPeaks = useMemo(
    () => (buffer ? peaks(buffer, view.start, view.end, DETAIL_BINS) : new Float32Array(DETAIL_BINS)),
    [buffer, view.start, view.end],
  )
  const overviewPeaks = useMemo(
    () => (buffer ? peaks(buffer, 0, buffer.duration, OVERVIEW_BINS) : new Float32Array(OVERVIEW_BINS)),
    [buffer],
  )

  function timeAt(el: HTMLElement | null, clientX: number, from: number, span: number): number {
    if (!el) return from
    const rect = el.getBoundingClientRect()
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    return from + clamp(ratio, 0, 1) * span
  }

  function beginDrag(mode: DragMode, e: ReactPointerEvent, grabOffset = 0, jump = false) {
    if (!buffer || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    stop()
    const locked = view
    setFrozenView(locked)
    const lockedSpan = locked.end - locked.start

    const apply = (clientX: number) => {
      const t = timeAt(detailRef.current, clientX, locked.start, lockedSpan)
      setSelection((current) => {
        if (mode === 'start') return resizeStart(current, Math.max(t, locked.start), duration)
        if (mode === 'end') return resizeEnd(current, Math.min(t, locked.end), duration)
        const length = current.end - current.start
        const start = clamp(t - grabOffset, locked.start, Math.max(locked.start, locked.end - length))
        return moveSelection(current, start, duration)
      })
    }

    const onMove = (ev: PointerEvent) => apply(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setFrozenView(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    if (jump) apply(e.clientX)
  }

  function onDetailDown(e: ReactPointerEvent) {
    beginDrag('move', e, (selection.end - selection.start) / 2, true)
  }

  function onSelectionDown(e: ReactPointerEvent) {
    const t = timeAt(detailRef.current, e.clientX, view.start, viewSpan)
    beginDrag('move', e, t - selection.start)
  }

  function onOverviewDown(e: ReactPointerEvent) {
    if (!buffer || e.button !== 0) return
    e.preventDefault()
    stop()
    const length = selection.end - selection.start
    const apply = (clientX: number) => {
      const t = timeAt(overviewRef.current, clientX, 0, duration)
      setSelection((current) => moveSelection(current, t - length / 2, duration))
    }
    apply(e.clientX)
    const onMove = (ev: PointerEvent) => apply(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function nudge(side: 'start' | 'end', delta: number) {
    stop()
    setSelection((current) =>
      side === 'start'
        ? resizeStart(current, current.start + delta, duration)
        : resizeEnd(current, current.end + delta, duration),
    )
  }

  async function confirm() {
    if (!buffer || !file || encoding) return
    stop()
    setEncoding(true)
    try {
      const audioB64 = await renderExcerpt(buffer, selection)
      onConfirm({ file, name: file.name, start: selection.start, end: selection.end, audioB64 })
    } catch {
      setError('The excerpt could not be prepared. Try another section or file.')
    } finally {
      setEncoding(false)
    }
  }

  if (!open && !visible) return null

  const length = selection.end - selection.start
  const selLeft = ((selection.start - view.start) / viewSpan) * 100
  const selWidth = (length / viewSpan) * 100
  const ready = buffer !== null && !error

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'color-mix(in srgb, var(--color-shade) 45%, transparent)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a style excerpt"
        style={{
          position: 'fixed',
          left: '50%', top: '50%',
          transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
          width: MODAL_W, maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100dvh - 32px)',
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          pointerEvents: visible ? 'auto' : 'none',
          display: 'flex',
        }}
      >
        <div data-frosted style={{
          background: 'color-mix(in srgb, var(--color-surface-sunken) 78%, transparent)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 40px 80px color-mix(in srgb, var(--color-shade) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 8%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 4%, transparent)',
          display: 'flex', flexDirection: 'column',
          width: '100%', minHeight: 0,
        }}>

          <div style={{
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 9, color: 'var(--color-ink-trace)', fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              Style excerpt
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                color: 'var(--color-ink-faint)', fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
              <p
                title={file?.name}
                style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                }}
              >
                {file?.name ?? 'Reference clip'}
              </p>
              {buffer && (
                <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--color-ink-faint)', flexShrink: 0 }}>
                  {formatTime(buffer.duration)}
                </span>
              )}
            </div>

            {error ? (
              <p className="text-danger" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>{error}</p>
            ) : !buffer ? (
              <div
                style={{
                  height: DETAIL_H + OVERVIEW_H + 12,
                  borderRadius: 12,
                  border: '1px solid color-mix(in srgb, var(--color-wash) 6%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: 'var(--color-ink-faint)', letterSpacing: '0.06em',
                }}
              >
                Reading audio…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  ref={detailRef}
                  onPointerDown={onDetailDown}
                  style={{
                    position: 'relative',
                    height: DETAIL_H,
                    borderRadius: 12,
                    border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                    background: 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
                    cursor: 'pointer',
                    touchAction: 'none',
                    userSelect: 'none',
                    margin: '0 12px',
                  }}
                >
                  <div style={{ position: 'absolute', inset: '8px 0', overflow: 'hidden' }}>
                    <Wave
                      values={detailPeaks}
                      height={DETAIL_H - 18}
                      highlight={{ start: (selection.start - view.start) / viewSpan, end: (selection.end - view.start) / viewSpan }}
                    />
                  </div>

                  <div
                    onPointerDown={onSelectionDown}
                    style={{
                      position: 'absolute',
                      top: -1, bottom: -1,
                      left: `${selLeft}%`,
                      width: `${selWidth}%`,
                      background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                      borderTop: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                      borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                  >
                    <Handle
                      side="start"
                      value={selection.start}
                      min={Math.max(0, selection.end - MAX_STYLE_S)}
                      max={selection.end - MIN_STYLE_S}
                      onPointerDown={(e) => beginDrag('start', e)}
                      onNudge={(d) => nudge('start', d)}
                    />
                    <Handle
                      side="end"
                      value={selection.end}
                      min={selection.start + MIN_STYLE_S}
                      max={Math.min(duration, selection.start + MAX_STYLE_S)}
                      onPointerDown={(e) => beginDrag('end', e)}
                      onNudge={(d) => nudge('end', d)}
                    />
                  </div>

                  {playhead !== null && playhead >= view.start && playhead <= view.end && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1,
                        left: `${((playhead - view.start) / viewSpan) * 100}%`,
                        background: 'var(--color-ink-bright)',
                        boxShadow: '0 0 8px color-mix(in srgb, var(--color-wash) 50%, transparent)',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    />
                  )}
                </div>

                <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--color-ink-ghost)', margin: '-6px 12px 0' }}>
                  <span>{formatTime(view.start)}</span>
                  <span>{formatTime(view.end)}</span>
                </div>

                <div
                  ref={overviewRef}
                  onPointerDown={onOverviewDown}
                  aria-hidden
                  title="Drag to move the excerpt through the whole clip"
                  style={{
                    position: 'relative',
                    height: OVERVIEW_H,
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
                    cursor: 'pointer',
                    touchAction: 'none',
                    userSelect: 'none',
                    overflow: 'hidden',
                    margin: '0 12px',
                  }}
                >
                  <div style={{ position: 'absolute', inset: '4px 0' }}>
                    <Wave
                      values={overviewPeaks}
                      height={OVERVIEW_H - 10}
                      highlight={{ start: selection.start / duration, end: selection.end / duration }}
                    />
                  </div>
                  {duration > view.end - view.start + 0.01 && (
                    <div
                      style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${(view.start / duration) * 100}%`,
                        width: `${((view.end - view.start) / duration) * 100}%`,
                        border: '1px solid color-mix(in srgb, var(--color-wash) 14%, transparent)',
                        borderRadius: 6,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {ready && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => (playing ? stop() : void play())}
                  aria-label={playing ? 'Stop' : 'Play the excerpt'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px 7px 10px', borderRadius: 999, cursor: 'pointer',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)',
                    background: playing
                      ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
                      : 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                    color: 'var(--color-accent-soft)', fontSize: 11.5, fontFamily: 'inherit',
                    transition: 'background 0.18s ease',
                  }}
                >
                  {playing ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4" /></svg>
                  )}
                  {playing ? 'Stop' : 'Play excerpt'}
                </button>

                <div className="tabular-nums" style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-ink-muted)', flexWrap: 'wrap' }}>
                  <span><span style={{ color: 'var(--color-ink-ghost)' }}>From </span>{formatTime(selection.start)}</span>
                  <span><span style={{ color: 'var(--color-ink-ghost)' }}>To </span>{formatTime(selection.end)}</span>
                  <span style={{ color: 'var(--color-accent-soft)' }}>{length.toFixed(1)}s</span>
                </div>
              </div>
            )}

            <p style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-ink-ghost)', margin: 0 }}>
              Pick {MIN_STYLE_S}–{MAX_STYLE_S} seconds that capture the sound you want. MusicGen-Style
              borrows its instruments and feel for the music layers; the excerpt itself is never
              played in the soundscape.
            </p>
          </div>

          <div style={{
            padding: '12px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
              esc to close · arrows nudge a focused handle
            </span>
            <button
              onClick={() => void confirm()}
              disabled={!ready || encoding}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.08em',
                cursor: !ready || encoding ? 'not-allowed' : 'pointer',
                border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                color: 'var(--color-accent-soft)',
                opacity: !ready || encoding ? 0.5 : 1,
                transition: 'all 0.18s ease',
                boxShadow: '0 0 14px color-mix(in srgb, var(--color-accent) 18%, transparent)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {encoding ? 'PREPARING…' : 'USE EXCERPT'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  )
}
