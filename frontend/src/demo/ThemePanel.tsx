import { useEffect, useState } from 'react'
import { ThemeCard } from '../components/ThemeCard'
import { Toggle } from '../components/Toggle'
import { applyTheme, storeTheme, storedTheme } from '../themes'
import { applyReduceBlur, storeReduceBlur, storedReduceBlur } from '../effects'

export function ThemePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState(storedTheme)
  const [reduceBlur, setReduceBlur] = useState(storedReduceBlur)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function pickTheme(id: string) {
    setTheme(id)
    applyTheme(id)
    storeTheme(id)
  }

  function toggleBlur() {
    const next = !reduceBlur
    setReduceBlur(next)
    applyReduceBlur(next)
    storeReduceBlur(next)
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto"
      style={{ zIndex: 9998, padding: '48px 16px', background: 'color-mix(in srgb, var(--color-shade) 55%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full flex flex-col gap-3" style={{ maxWidth: '720px' }}>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-full border border-line bg-surface text-ink-dim hover:text-ink hover:border-line-active transition"
            style={{ width: 30, height: 30, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        <ThemeCard value={theme} onChange={pickTheme} />

        <button
          type="button"
          onClick={toggleBlur}
          className="flex items-center justify-between gap-4 rounded-2xl border border-surface-hover bg-surface text-left"
          style={{ padding: '18px 22px', fontFamily: 'inherit' }}
        >
          <span className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ink">Reduce blur</span>
            <span className="text-[11.5px] text-ink-faint leading-relaxed">
              Drop the frosted-glass panels and soft glows if the page stutters.
            </span>
          </span>
          <Toggle on={reduceBlur} />
        </button>

        <p className="text-center text-[11px] text-ink-ghost">Kept in this browser only.</p>
      </div>
    </div>
  )
}
