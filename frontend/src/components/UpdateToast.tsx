import { useEffect, useState } from 'react'
import { getUpdateStatus } from '../api/updates'
import { useAuth } from '../auth/context'
import { dismissVersion, dismissedVersion, toastVersion } from '../updates'
import type { UpdateStatus } from '../types'

interface Props {
  onOpenSettings: () => void
}

export function UpdateToast({ onOpenSettings }: Props) {
  const { state } = useAuth()
  const isAdmin = state.status === 'authed' && state.user.is_admin
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(dismissedVersion)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    getUpdateStatus()
      .then((res) => { if (!cancelled) setStatus(res) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [isAdmin])

  const version = isAdmin ? toastVersion(status, dismissed) : null
  if (!version) return null

  function dismiss() {
    if (!version) return
    dismissVersion(version)
    setDismissed(version)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-frosted
      className="fixed z-[34] left-4 right-4 sm:left-auto sm:right-6 sm:w-[380px]"
      style={{
        bottom: 'calc(20px + var(--deploy-toast-offset, 0px))',
        display: 'flex',
        gap: 12,
        padding: '13px 14px',
        borderRadius: 14,
        border: '1px solid color-mix(in srgb, var(--color-accent) 38%, transparent)',
        background: 'color-mix(in srgb, var(--color-surface-high) 90%, transparent)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        boxShadow: '0 24px 48px color-mix(in srgb, var(--color-shade) 55%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          marginTop: 1,
          background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
          color: 'var(--color-accent)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </span>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">Halcyon {version} is available</span>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-ink-faint hover:text-ink transition-colors"
            style={{ fontFamily: 'inherit', lineHeight: 1, fontSize: 14, marginTop: -1 }}
          >
            ×
          </button>
        </div>
        <p className="text-[11.5px] text-ink-muted leading-relaxed tabular-nums" style={{ margin: 0 }}>
          This server runs {status?.current}.{status?.major ? ' This is a major release.' : ''}
        </p>
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6 }}>
          <button
            onClick={() => {
              dismiss()
              onOpenSettings()
            }}
            className="text-[12px] font-medium text-wash rounded-lg transition"
            style={{
              padding: '6px 14px',
              background: 'var(--color-accent-deep)',
              boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent)',
              fontFamily: 'inherit',
            }}
          >
            View update
          </button>
        </div>
      </div>
    </div>
  )
}
