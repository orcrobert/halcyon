import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { densityToInterval, intervalToDensity } from '../hooks/eventScheduler'

interface Props {
  intervalMinS: number
  intervalMaxS: number
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onIntervalChange: (minS: number, maxS: number) => void
  onClose: () => void
}

const MODAL_W = 236
const MODAL_H = 116

function cadenceLabel(minS: number, maxS: number): string {
  const average = (minS + maxS) / 2
  if (average < 8) return 'every few seconds'
  if (average < 20) return 'every ten seconds or so'
  if (average < 45) return 'every half minute or so'
  return 'a few times a minute'
}

export function DensityModal({
  intervalMinS, intervalMaxS, open, anchorRef, onIntervalChange, onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)

  const reposition = useCallback(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    let x = rect.left + rect.width / 2 - MODAL_W / 2
    let y = rect.top - MODAL_H - 14
    if (y < 8) y = rect.bottom + 14
    x = Math.max(8, Math.min(window.innerWidth - MODAL_W - 8, x))
    y = Math.max(8, Math.min(window.innerHeight - MODAL_H - 8, y))
    setPos({ x, y })
  }, [anchorRef])

  useEffect(() => {
    if (!open) { setVisible(false); return }
    reposition()
    const id = requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const inside =
        containerRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      if (!inside) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open) return null

  const density = intervalToDensity(intervalMinS)

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: MODAL_W,
        padding: '14px 16px',
        borderRadius: 14,
        border: '1px solid var(--color-line-hover)',
        background: 'var(--color-surface-high)',
        boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 55%, transparent)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 0.16s ease, transform 0.16s ease',
        zIndex: 60,
      }}
    >
      <p
        className="text-[10px] uppercase tracking-wider text-ink-faint"
        style={{ margin: '0 0 10px 0', fontFamily: 'inherit' }}
      >
        How often
      </p>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={density}
        onChange={(e) => {
          const [minS, maxS] = densityToInterval(Number(e.target.value))
          onIntervalChange(minS, maxS)
        }}
        style={{ width: '100%', accentColor: 'var(--color-accent)' }}
      />

      <p
        className="text-[11px] text-ink-soft tabular-nums"
        style={{ margin: '8px 0 0 0', fontFamily: 'inherit' }}
      >
        {cadenceLabel(intervalMinS, intervalMaxS)}
      </p>
      <p
        className="text-[10px] text-ink-faint tabular-nums"
        style={{ margin: '2px 0 0 0', fontFamily: 'inherit' }}
      >
        every {Math.round(intervalMinS)}–{Math.round(intervalMaxS)} s
      </p>
    </div>,
    document.body,
  )
}
