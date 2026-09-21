import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  prompt: string
  onClose: () => void
}

const MODAL_W = 520

export function PromptModal({ open, prompt, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) { setVisible(false); return }
    setCopied(false)
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = prompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  if (!open && !visible) return null

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
        <div data-frosted ref={containerRef} style={{
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 9,
                color: 'var(--color-ink-trace)',
                fontFamily: 'inherit',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}>
                Original Prompt
              </span>
            </div>
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

          <div style={{ padding: '20px 22px' }}>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--color-ink-soft)',
                fontFamily: 'inherit',
                fontWeight: 300,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                userSelect: 'text',
              }}
            >
              {prompt}
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
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.08em',
                cursor: 'pointer',
                border: copied
                  ? '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)'
                  : '1px solid color-mix(in srgb, var(--color-wash) 10%, transparent)',
                background: copied
                  ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
                  : 'color-mix(in srgb, var(--color-wash) 4%, transparent)',
                color: copied ? 'var(--color-accent-soft)' : 'var(--color-ink-dim)',
                transition: 'all 0.18s ease',
                boxShadow: copied ? '0 0 14px color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'none',
              }}
            >
              {copied ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  COPIED
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  COPY
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  )
}
