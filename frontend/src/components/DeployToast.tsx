import { useEffect, useMemo, useRef, useState } from 'react'
import { deployGenerator } from '../api/generators'
import { extractErrors } from '../api/errors'
import { refreshGenerators, setGenerators, useGenerators } from '../hooks/generatorStore'
import type { Generator } from '../types'

interface Props {
  onOpenSettings: () => void
}

const POLL_MS = 3000
const SUCCESS_MS = 5000
const OFFSET_VAR = '--deploy-toast-offset'

function elapsed(since: string | null, now: number): string {
  if (!since) return ''
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function pendingLabel(count: number): string {
  return count === 1 ? '1 setting changed' : `${count} settings changed`
}

export function DeployToast({ onOpenSettings }: Props) {
  const list = useGenerators()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedFailure, setDismissedFailure] = useState<string | null>(null)
  const [justDeployed, setJustDeployed] = useState<string | null>(null)
  const previous = useRef<Map<number, Generator['deploy_status']>>(new Map())
  const toastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refreshGenerators().catch(() => undefined)
    return () => setGenerators(null)
  }, [])

  const deployable = useMemo(
    () => (list?.generators ?? []).filter((g) => g.kind === 'modal'),
    [list],
  )
  const deploying = deployable.find((g) => g.deploy_status === 'deploying')
  const pending = deployable.find((g) => g.pending_changes.length > 0 && g.deploy_status !== 'deploying')
  const failed = deployable.find(
    (g) => g.deploy_status === 'failed' && `${g.id}:${g.deploy_started_at}` !== dismissedFailure,
  )

  useEffect(() => {
    if (!deploying) return
    const poll = window.setInterval(() => {
      refreshGenerators().catch(() => undefined)
    }, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [deploying])

  useEffect(() => {
    const seen = previous.current
    for (const generator of deployable) {
      if (seen.get(generator.id) === 'deploying' && generator.deploy_status === 'ready') {
        setJustDeployed(generator.name)
      }
    }
    previous.current = new Map(deployable.map((g) => [g.id, g.deploy_status]))
  }, [deployable])

  useEffect(() => {
    if (!justDeployed) return
    const timer = window.setTimeout(() => setJustDeployed(null), SUCCESS_MS)
    return () => window.clearTimeout(timer)
  }, [justDeployed])

  async function redeploy(generator: Generator) {
    setBusy(true)
    setError(null)
    try {
      setGenerators(await deployGenerator(generator.id))
      setNow(Date.now())
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setBusy(false)
    }
  }

  const target = deploying ?? pending ?? failed ?? null
  const showSuccess = !target && justDeployed !== null
  const visible = target !== null || showSuccess

  useEffect(() => {
    const root = document.documentElement
    const node = toastRef.current
    if (!visible || !node) {
      root.style.removeProperty(OFFSET_VAR)
      return
    }
    const apply = () => root.style.setProperty(OFFSET_VAR, `${node.offsetHeight + 12}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [visible])

  if (!visible) return null

  let tone: 'accent' | 'danger' | 'success' = 'accent'
  let title = ''
  let body = ''
  let action: { label: string; run: () => void } | null = null
  let dismiss: (() => void) | null = null

  if (deploying) {
    title = `Deploying ${deploying.name}`
    body = `Building and starting the generator on Modal · ${elapsed(deploying.deploy_started_at, now)}`
  } else if (pending) {
    title = 'Redeploy needed'
    body = `${pendingLabel(pending.pending_changes.length)} on ${pending.name}. They apply after the next deploy.`
    action = { label: busy ? 'Starting…' : 'Redeploy', run: () => void redeploy(pending) }
  } else if (failed) {
    tone = 'danger'
    title = 'Deploy failed'
    body = failed.deploy_error ?? 'modal deploy did not finish.'
    action = { label: busy ? 'Starting…' : 'Retry', run: () => void redeploy(failed) }
    dismiss = () => setDismissedFailure(`${failed.id}:${failed.deploy_started_at}`)
  } else {
    tone = 'success'
    title = 'Deployed'
    body = `${justDeployed} is live with your latest settings.`
    dismiss = () => setJustDeployed(null)
  }

  const toneColor = tone === 'danger'
    ? 'var(--color-danger)'
    : tone === 'success'
      ? 'var(--color-success)'
      : 'var(--color-accent)'

  return (
    <div
      ref={toastRef}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live="polite"
      data-frosted
      className="fixed z-[35] left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
      style={{
        display: 'flex',
        gap: 12,
        padding: '13px 14px',
        borderRadius: 14,
        border: `1px solid color-mix(in srgb, ${toneColor} 38%, transparent)`,
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
          background: `color-mix(in srgb, ${toneColor} 16%, transparent)`,
          color: toneColor,
        }}
      >
        {deploying ? (
          <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
        ) : tone === 'success' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : tone === 'danger' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <line x1="12" y1="7" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12" y2="17.01" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        )}
      </span>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
          {dismiss && (
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 text-ink-faint hover:text-ink transition-colors"
              style={{ fontFamily: 'inherit', lineHeight: 1, fontSize: 14, marginTop: -1 }}
            >
              ×
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-ink-muted leading-relaxed break-words tabular-nums" style={{ margin: 0 }}>
          {body}
        </p>
        {error && (
          <p className="text-[11.5px] text-danger-bright leading-relaxed" style={{ margin: 0 }}>{error}</p>
        )}
        {(action || target) && (
          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6 }}>
            {action && (
              <button
                onClick={action.run}
                disabled={busy}
                className="text-[12px] font-medium text-wash rounded-lg transition disabled:opacity-50"
                style={{
                  padding: '6px 14px',
                  background: tone === 'danger' ? 'var(--color-danger-deep)' : 'var(--color-accent-deep)',
                  boxShadow: `0 0 0 1px color-mix(in srgb, ${toneColor} 40%, transparent)`,
                  fontFamily: 'inherit',
                }}
              >
                {action.label}
              </button>
            )}
            {target && (
              <button
                onClick={onOpenSettings}
                className="text-[12px] text-ink-muted hover:text-ink-soft transition-colors"
                style={{ fontFamily: 'inherit' }}
              >
                {deploying ? 'View log' : 'Settings'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
