import { useEffect, useMemo, useState } from 'react'
import { listAtmospheres, deleteAtmosphere } from '../api/atmospheres'
import type { Atmosphere } from '../types'
import { resolveStage } from '../stages'

interface Props {
  open: boolean
  onClose: () => void
  onOpenAtmosphere: (id: number) => void
}

interface Group {
  label: string
  items: Atmosphere[]
}

function timestampOf(a: Atmosphere): number {
  return new Date(a.generated_at ?? a.created_at).getTime()
}

function formatBuild(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60).toString().padStart(2, '0')}s`
}

function groupByDate(items: Atmosphere[]): Group[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60_000
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60_000
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const buckets: Record<string, Atmosphere[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'This month': [],
    Older: [],
  }

  for (const a of items) {
    const t = timestampOf(a)
    if (t >= startOfToday) buckets.Today.push(a)
    else if (t >= startOfYesterday) buckets.Yesterday.push(a)
    else if (t >= startOfWeek) buckets['Previous 7 days'].push(a)
    else if (t >= startOfMonth) buckets['This month'].push(a)
    else buckets.Older.push(a)
  }

  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }))
}

export function HistoryPanel({ open, onClose, onOpenAtmosphere }: Props) {
  const [items, setItems] = useState<Atmosphere[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 640) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 260)
      return () => clearTimeout(t)
    }
  }, [open])

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

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...items].sort((a, b) => timestampOf(b) - timestampOf(a))
    if (!q) return sorted
    return sorted.filter((a) =>
      (a.title ?? '').toLowerCase().includes(q) ||
      a.prompt.toLowerCase().includes(q),
    )
  }, [items, query])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  async function handleDelete(id: number) {
    const prev = items
    setItems(items.filter((a) => a.id !== id))
    setConfirmingDelete(null)
    try {
      await deleteAtmosphere(id)
    } catch (e) {
      setItems(prev)
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (!mounted) return null

  const panelStyle: React.CSSProperties = isMobile
    ? {
        top: 12,
        bottom: 12,
        left: 12,
        right: 12,
        width: 'auto',
        borderRadius: '20px',
        transform: visible ? 'translateX(0)' : 'translateX(-110%)',
      }
    : {
        top: 16,
        bottom: 16,
        left: 16,
        width: 380,
        borderRadius: '20px',
        transform: visible ? 'translateX(0)' : 'translateX(calc(-100% - 24px))',
      }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: 'color-mix(in srgb, var(--color-shade) 55%, transparent)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          opacity: visible ? 1 : 0,
        }}
      />
      <aside
        className="fixed z-50 flex flex-col bg-surface-sunken border border-surface-hover overflow-hidden"
        style={{
          ...panelStyle,
          transition: 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '0 30px 80px color-mix(in srgb, var(--color-shade) 60%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 4%, transparent)',
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3" style={{ padding: '22px 22px 18px 22px' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent/[0.08] border border-accent/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-bright">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2 className="text-[15px] font-semibold text-wash/90 tracking-tight">History</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-wash/[0.04] transition"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Search */}
        <div style={{ padding: '0 22px 18px 22px' }}>
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search atmospheres..."
              className="w-full bg-surface border border-line rounded-xl text-ink placeholder:text-ink-ghost text-[13px] outline-none focus:border-accent/40 transition-colors"
              style={{ padding: '10px 14px 10px 38px', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-line) transparent', padding: '4px 14px 14px 14px' }}
        >
          {loading && (
            <div className="flex flex-col gap-2.5 px-2 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[60px] rounded-xl animate-pulse" style={{ background: 'color-mix(in srgb, var(--color-wash) 2.5%, transparent)' }} />
              ))}
            </div>
          )}

          {error && !loading && (
            <p className="px-2 py-4 text-[13px] text-danger-bright">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="px-4 pt-16 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-line flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ink-ghost">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] text-ink-soft mb-1.5">No atmospheres yet</p>
                <p className="text-[12px] text-ink-faint leading-relaxed">Generate one to start your history.</p>
              </div>
            </div>
          )}

          {!loading && !error && items.length > 0 && filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-[12px] text-ink-faint">
              No matches for "{query}"
            </p>
          )}

          {groups.map((group) => (
            <section key={group.label} className="pb-3">
              <div style={{ padding: '14px 10px 8px 10px' }}>
                <span className="text-[10px] uppercase tracking-[0.16em] text-ink-ghost font-semibold">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((a) => (
                  <HistoryRow
                    key={a.id}
                    atmosphere={a}
                    confirming={confirmingDelete === a.id}
                    onOpen={() => onOpenAtmosphere(a.id)}
                    onRequestDelete={() => setConfirmingDelete(a.id)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    onConfirmDelete={() => handleDelete(a.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <footer
            className="border-t border-line-soft text-[11px] text-ink-ghost"
            style={{ padding: '14px 22px' }}
          >
            {items.length} atmosphere{items.length === 1 ? '' : 's'}
          </footer>
        )}
      </aside>
    </>
  )
}

interface RowProps {
  atmosphere: Atmosphere
  confirming: boolean
  onOpen: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

function HistoryRow({ atmosphere: a, confirming, onOpen, onRequestDelete, onCancelDelete, onConfirmDelete }: RowProps) {
  const isReady = a.status === 'ready'
  const isFailed = a.status === 'failed'
  const isWorking = a.status === 'pending' || a.status === 'generating'
  const isReviewing = a.status === 'awaiting_review'

  if (confirming) {
    return (
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'color-mix(in srgb, var(--color-danger) 6%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-danger) 18%, transparent)',
        }}
      >
        <div className="flex items-center gap-3" style={{ padding: '10px 12px' }}>
          <div
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-danger) 22%, transparent)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-danger-bright">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-danger-soft/80 leading-tight" style={{ letterSpacing: '0.01em' }}>
              Delete this atmosphere?
            </div>
            <div className="text-[11px] text-ink-muted truncate" style={{ marginTop: '2px' }}>
              {a.title ?? a.prompt}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onCancelDelete() }}
              className="text-[11px] text-ink-dim hover:text-ink rounded-lg transition"
              style={{ padding: '6px 12px', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmDelete() }}
              className="text-[11px] font-semibold text-wash rounded-lg transition"
              style={{
                padding: '6px 14px',
                background: 'var(--color-danger-deep)',
                fontFamily: 'inherit',
                boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-danger) 35%, transparent), 0 4px 12px color-mix(in srgb, var(--color-danger) 18%, transparent)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-danger)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-danger-deep)' }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group relative rounded-xl transition-colors"
      style={{ padding: '10px 12px', background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-wash) 3%, transparent)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <button
        onClick={onOpen}
        disabled={isFailed}
        className="w-full text-left disabled:cursor-not-allowed flex items-start gap-3"
      >
        <div
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
          style={{
            background: isReady ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : isFailed ? 'color-mix(in srgb, var(--color-danger) 6%, transparent)' : 'color-mix(in srgb, var(--color-band-gamma) 6%, transparent)',
            border: `1px solid ${isReady ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : isFailed ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)' : 'color-mix(in srgb, var(--color-band-gamma) 15%, transparent)'}`,
          }}
        >
          {isReviewing ? (
            <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-pulse" />
          ) : isWorking ? (
            <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
          ) : isFailed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-danger-bright/70">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-bright">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0" style={{ paddingRight: '28px' }}>
          <div className={`text-[13px] truncate leading-snug ${isReady ? 'text-ink' : 'text-ink-muted'}`}>
            {a.title ?? a.prompt}
          </div>
          <div className="text-[11px] text-ink-faint truncate" style={{ marginTop: '3px' }}>
            {isReady && new Date(a.generated_at ?? a.created_at).toLocaleString(undefined, {
              hour: 'numeric', minute: '2-digit', hour12: false,
              month: 'short', day: 'numeric',
            })}
            {isReady && a.timings?.total_s != null && ` · built in ${formatBuild(a.timings.total_s)}`}
            {isFailed && (a.error ?? 'Failed')}
            {isReviewing && 'Awaiting review · click to open'}
            {isWorking && (a.status === 'generating' ? `Generating · ${resolveStage(a).label.toLowerCase()}` : 'Queued · click to follow')}
          </div>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onRequestDelete() }}
        className="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger-bright hover:bg-danger/[0.08] transition"
        aria-label="Delete"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  )
}
