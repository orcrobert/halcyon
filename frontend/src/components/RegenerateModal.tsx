import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Element } from '../types'

interface Props {
  open: boolean
  element: Element | null
  submitting: boolean
  onSubmit: (feedback: string) => void
  onClose: () => void
}

const MODAL_W = 520

export function RegenerateModal({ open, element, submitting, onSubmit, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [visible, setVisible] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      setVisible(true)
      textareaRef.current?.focus()
    })
    return () => {
      cancelAnimationFrame(id)
      setVisible(false)
      setFeedback('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if ((!open && !visible) || !element) return null

  const trimmed = feedback.trim()

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
        <div ref={containerRef} style={{
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}>
            <span style={{
              fontSize: 9,
              color: 'var(--color-ink-trace)',
              fontFamily: 'inherit',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}>
              Regenerate layer
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

          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{
                fontSize: 14, fontWeight: 600, color: 'var(--color-ink)',
                fontFamily: 'inherit', margin: 0,
              }}>
                {element.label}
              </p>
              <p style={{
                fontSize: 11, lineHeight: 1.6, color: 'var(--color-ink-muted)',
                fontFamily: 'inherit', fontWeight: 300, margin: '6px 0 0 0',
              }}>
                {element.prompt}
              </p>
            </div>

            <div style={{
              borderRadius: 12,
              border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
              background: 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
            }}>
              <textarea
                ref={textareaRef}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={submitting}
                rows={4}
                maxLength={2000}
                placeholder="What didn't work about this layer?"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  color: 'var(--color-ink-soft)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  fontWeight: 300,
                  padding: '14px 16px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <p style={{
              fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-ink-ghost)',
              fontFamily: 'inherit', margin: 0,
            }}>
              {trimmed
                ? 'The layer is rewritten from your notes, generated again, and the mix is rebalanced around it.'
                : 'Leave this empty to generate the same layer again, without rewriting it.'}
            </p>
          </div>

          <div style={{
            padding: '12px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}>
            <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
              esc to close
            </span>
            <button
              onClick={() => onSubmit(feedback)}
              disabled={submitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.08em',
                cursor: submitting ? 'not-allowed' : 'pointer',
                border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                color: 'var(--color-accent-soft)',
                opacity: submitting ? 0.5 : 1,
                transition: 'all 0.18s ease',
                boxShadow: '0 0 14px color-mix(in srgb, var(--color-accent) 18%, transparent)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {trimmed ? 'REWRITE' : 'REGENERATE'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  )
}
