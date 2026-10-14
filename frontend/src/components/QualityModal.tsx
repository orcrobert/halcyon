import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { describeIssues } from '../quality'
import type { Element } from '../types'
import { Toggle } from './Toggle'

interface Props {
  open: boolean
  layers: Element[]
  submitting: boolean
  onRerender: (layers: Element[]) => void
  onKeep: () => void
}

const MODAL_W = 460

export function QualityModal({ open, layers, submitting, onRerender, onKeep }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => {
      cancelAnimationFrame(id)
      setVisible(false)
      setSkipped(new Set())
    }
  }, [open])

  useEffect(() => {
    if (!open || submitting) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) onKeep()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onKeep()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, submitting, onKeep])

  if (!open && !visible) return null

  const chosen = layers.filter((layer) => !skipped.has(layer.id))

  function toggle(id: number) {
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'color-mix(in srgb, var(--color-shade) 45%, transparent)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      <div style={{
        position: 'fixed',
        left: '50%', top: '50%',
        transform: visible
          ? 'translate(-50%, -50%) scale(1)'
          : 'translate(-50%, -50%) scale(0.96)',
        width: MODAL_W, maxWidth: 'calc(100vw - 32px)',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}>
        <div data-frosted ref={containerRef} role="dialog" aria-label="Layers that may need another take" style={{
          background: 'color-mix(in srgb, var(--color-surface-sunken) 78%, transparent)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 40px 80px color-mix(in srgb, var(--color-shade) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 8%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 4%, transparent)',
          display: 'flex', flexDirection: 'column',
        }}>

          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}>
            <span style={{
              fontSize: 9,
              color: 'var(--color-ink-trace)',
              fontFamily: 'inherit',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}>
              Quality check
            </span>
          </div>

          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{
              fontSize: 12, lineHeight: 1.6, color: 'var(--color-ink-muted)',
              fontFamily: 'inherit', fontWeight: 300, margin: 0,
            }}>
              {layers.length === 1
                ? 'One layer did not come out clean. Render it again?'
                : `${layers.length} layers did not come out clean. Render them again?`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {layers.map((layer) => {
                const on = !skipped.has(layer.id)
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggle(layer.id)}
                    disabled={submitting}
                    aria-pressed={on}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 10,
                      border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                      background: on
                        ? 'color-mix(in srgb, var(--color-accent) 7%, transparent)'
                        : 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                      transition: 'background 0.18s ease',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 13, fontWeight: 600,
                        color: on ? 'var(--color-ink)' : 'var(--color-ink-faint)',
                      }}>
                        {layer.label}
                      </span>
                      <span style={{
                        display: 'block', fontSize: 11, fontWeight: 300, marginTop: 2,
                        color: 'var(--color-ink-muted)',
                      }}>
                        {describeIssues(layer.quality?.issues ?? [])}
                      </span>
                    </span>
                    <Toggle on={on} />
                  </button>
                )
              })}
            </div>

            <p style={{
              fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-ink-ghost)',
              fontFamily: 'inherit', margin: 0,
            }}>
              Each chosen layer is generated again from the same prompt and the mix is rebalanced around it. You can keep listening meanwhile.
            </p>
          </div>

          <div style={{
            padding: '12px 18px',
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}>
            <button
              onClick={onKeep}
              disabled={submitting}
              style={{
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.08em',
                cursor: submitting ? 'not-allowed' : 'pointer',
                border: '1px solid color-mix(in srgb, var(--color-wash) 9%, transparent)',
                background: 'transparent',
                color: 'var(--color-ink-dim)',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              KEEP AS IS
            </button>
            <button
              onClick={() => onRerender(chosen)}
              disabled={submitting || chosen.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.08em',
                cursor: submitting || chosen.length === 0 ? 'not-allowed' : 'pointer',
                border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                color: 'var(--color-accent-soft)',
                opacity: submitting || chosen.length === 0 ? 0.5 : 1,
                transition: 'all 0.18s ease',
                boxShadow: '0 0 14px color-mix(in srgb, var(--color-accent) 18%, transparent)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {chosen.length > 1 ? `RE-RENDER ${chosen.length}` : 'RE-RENDER'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  )
}
