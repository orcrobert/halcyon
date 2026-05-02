import { useEffect, useState } from 'react'
import { listAtmospheres, deleteAtmosphere } from '../api/atmospheres'
import type { Atmosphere } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onOpenAtmosphere: (id: number) => void
}

const STATUS_COLOR: Record<Atmosphere['status'], string> = {
  pending: 'bg-amber-400/60',
  generating: 'bg-amber-400/60',
  ready: 'bg-emerald-400/60',
  failed: 'bg-red-400/60',
}

export function HistoryPanel({ open, onClose, onOpenAtmosphere }: Props) {
  const [items, setItems] = useState<Atmosphere[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    listAtmospheres()
      .then((res) => { if (!cancelled) setItems(res.data) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  async function handleDelete(id: number) {
    const prev = items
    setItems(items.filter((a) => a.id !== id))
    try {
      await deleteAtmosphere(id)
    } catch (e) {
      setItems(prev)
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
      />
      <aside className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-[#0a0b12] border-l border-white/5 z-50 flex flex-col">
        <header className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-sm font-medium text-white/80">Your atmospheres</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 text-xl leading-none">×</button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="px-6 py-4 text-xs text-white/40">Loading…</p>}
          {error && <p className="px-6 py-4 text-xs text-red-400">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="px-6 py-4 text-xs text-white/40">No atmospheres yet.</p>
          )}
          {items.map((a) => (
            <div
              key={a.id}
              className="group px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition flex items-start gap-3"
            >
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[a.status]}`}
                title={a.status}
              />
              <button
                onClick={() => onOpenAtmosphere(a.id)}
                disabled={a.status !== 'ready'}
                className="flex-1 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm text-white/85 truncate">
                  {a.title ?? a.prompt}
                </div>
                <div className="text-xs text-white/40 truncate mt-0.5">
                  {a.status === 'ready'
                    ? new Date(a.generated_at ?? a.created_at).toLocaleString()
                    : a.status === 'failed'
                    ? (a.error ?? 'Failed')
                    : a.status}
                </div>
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 text-xs transition"
                title="Delete"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
