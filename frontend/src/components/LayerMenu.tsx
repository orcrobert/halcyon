import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  deletable: boolean
  onRegenerate: () => void
  onDelete: () => void
  onFrequency?: () => void
  onClose: () => void
}

const MENU_W = 208
const MENU_H = 190

export function LayerMenu({ open, anchorRef, deletable, onRegenerate, onDelete, onFrequency, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return

    function reposition() {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let x = rect.left + rect.width / 2 - MENU_W / 2
      let y = rect.bottom + 10
      if (y + MENU_H > vh - 8) y = rect.top - MENU_H - 10
      x = Math.max(8, Math.min(vw - MENU_W - 8, x))
      y = Math.max(8, Math.min(vh - MENU_H - 8, y))
      setPos({ x, y })
    }

    reposition()
    const id = requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      setVisible(false)
      setConfirming(false)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const inside =
        containerRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      if (!inside) onClose()
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
  }, [open, anchorRef, onClose])

  if (!open && !visible) return null

  const rowStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 11px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    textAlign: 'left',
    transition: 'background 0.15s, color 0.15s',
  }

  return createPortal(
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MENU_W,
      zIndex: 9999,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.96)',
      transition: 'opacity 0.18s ease, transform 0.18s ease',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <div ref={containerRef} style={{
        background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)',
        backdropFilter: 'blur(40px) saturate(180%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.05)',
        border: '1px solid color-mix(in srgb, var(--color-wash) 10%, transparent)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 40px 100px color-mix(in srgb, var(--color-shade) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 8%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 6%, transparent)',
      }}>

        <div style={{
          padding: '11px 14px 8px',
          borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--color-ink-trace)', fontFamily: 'inherit', letterSpacing: '0.18em' }}>
            LAYER
          </span>
        </div>

        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={() => { onClose(); onRegenerate() }}
            style={{ ...rowStyle, color: 'var(--color-ink-soft)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg className="stroke-accent-bright" width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Regenerate
          </button>

          {onFrequency && (
            <button
              onClick={() => { onClose(); onFrequency() }}
              style={{ ...rowStyle, color: 'var(--color-ink-soft)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg className="stroke-accent-bright" width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15.5 14" />
              </svg>
              How often
            </button>
          )}

          <button
            onClick={() => {
              if (!confirming) { setConfirming(true); return }
              onClose()
              onDelete()
            }}
            disabled={!deletable}
            title={deletable ? undefined : 'An atmosphere needs at least one layer'}
            style={{
              ...rowStyle,
              color: confirming ? 'var(--color-danger-soft)' : 'var(--color-ink-dim)',
              background: confirming ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'transparent',
              opacity: deletable ? 1 : 0.35,
              cursor: deletable ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => {
              if (deletable && !confirming) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
            }}
            onMouseLeave={(e) => {
              if (!confirming) e.currentTarget.style.background = 'transparent'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: confirming ? 'var(--color-danger-bright)' : 'var(--color-ink-muted)', flexShrink: 0 }}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {confirming ? 'Delete for good?' : 'Delete'}
          </button>
        </div>

        <div style={{
          padding: '8px 14px 10px',
          borderTop: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
        }}>
          <span style={{ fontSize: 9.5, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', lineHeight: 1.5 }}>
            {confirming ? 'This removes the audio too.' : 'esc to close'}
          </span>
        </div>

      </div>
    </div>,
    document.body,
  )
}
