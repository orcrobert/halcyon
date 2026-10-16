import { useEffect, useState } from 'react'
import { checkForUpdate, getUpdateStatus, serverVersion, setAutoUpdate, startUpdate } from '../api/updates'
import { extractErrors } from '../api/errors'
import { updateBlocker } from '../updates'
import { Card, SwitchRow } from './AccountCard'
import { PRIMARY_BUTTON_STYLE } from './accountStyles'
import type { UpdateStatus } from '../types'

const POLL_MS = 3000

const QUIET_BUTTON_CLASS =
  'flex items-center gap-2 rounded-xl border border-line bg-surface-sunken text-[13px] text-ink-soft hover:text-ink-bright hover:border-line-hover transition-colors disabled:opacity-50'
const QUIET_BUTTON_STYLE: React.CSSProperties = { padding: '9px 15px', fontFamily: 'inherit' }

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'never'
}

function Command({ children }: { children: string }) {
  return (
    <code
      className="block rounded-xl border border-line bg-surface-sunken text-[12px] text-ink-soft break-all"
      style={{ padding: '10px 13px', fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </code>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px] text-ink-faint">{label}</span>
      <span className="text-[13px] text-ink tabular-nums text-right">{value}</span>
    </div>
  )
}

export function UpdatesPanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUpdateStatus()
      .then((res) => {
        if (cancelled) return
        setStatus(res)
        setWaiting(res.updating)
      })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
    return () => { cancelled = true }
  }, [])

  const running = status?.current

  useEffect(() => {
    if (!waiting || !running) return
    const timer = window.setInterval(async () => {
      const version = await serverVersion()
      if (version && version !== running) {
        window.location.reload()
        return
      }
      if (!version) return
      try {
        const next = await getUpdateStatus()
        setStatus(next)
        if (!next.updating) setWaiting(false)
      } catch {
        return
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting, running])

  async function run(action: () => Promise<UpdateStatus>) {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate() {
    setBusy(true)
    setError(null)
    try {
      setStatus(await startUpdate())
      setWaiting(true)
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <Card title="Version" hint="Which release this server runs.">
        <p className="text-[12px] text-ink-faint">{error ?? 'Checking…'}</p>
      </Card>
    )
  }

  const blocker = updateBlocker(status)
  const newer = status.latest && (status.update_available || status.pinned)
  const latestLabel = status.latest ?? (status.check_error ? 'unknown' : 'checking')

  return (
    <>
      <Card title="Version" hint="Which release this server runs, and the newest one published.">
        <div className="flex flex-col gap-2">
          <Row label="Running" value={status.current} />
          <Row label="Newest release" value={latestLabel} />
          <Row label="Image tag" value={status.track} />
          <Row label="Last checked" value={when(status.checked_at)} />
        </div>
        {status.check_error && (
          <p className="text-[11.5px] text-danger-bright leading-relaxed">{status.check_error}</p>
        )}
        {!newer && status.latest && status.current !== 'dev' && (
          <p className="text-[12px] text-ink-muted">Halcyon is up to date.</p>
        )}
        {status.current === 'dev' && (
          <p className="text-[12px] text-ink-muted">This is a development build, so it never offers updates.</p>
        )}
        <div className="flex">
          <button
            onClick={() => void run(checkForUpdate)}
            disabled={busy || waiting}
            className={QUIET_BUTTON_CLASS}
            style={QUIET_BUTTON_STYLE}
          >
            Check now
          </button>
        </div>
      </Card>

      {newer && (
        <Card
          title={`Halcyon ${status.latest}`}
          hint={status.published_at ? `Released ${when(status.published_at)}` : 'A newer release is available.'}
        >
          {status.major && (
            <p className="text-[12px] text-warn leading-relaxed">
              This is a major release and may change how things work. Read the notes before updating.
            </p>
          )}
          {status.notes && (
            <div
              className="rounded-xl border border-line bg-surface-sunken text-[12px] text-ink-soft leading-relaxed overflow-y-auto"
              style={{ padding: '12px 14px', maxHeight: 260, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {status.notes}
            </div>
          )}
          {status.release_url && (
            <a
              href={status.release_url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-accent-pale hover:text-ink-bright transition-colors self-start"
            >
              View on GitHub
            </a>
          )}

          {blocker === 'pinned' && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-ink-muted leading-relaxed">
                This server is pinned to the image tag <span className="text-ink">{status.track}</span>, which
                does not include {status.latest}. Set <span className="text-ink">HALCYON_TAG</span> in the
                server's <span className="text-ink">.env</span> to a newer line or remove it, then run:
              </p>
              <Command>docker compose pull && docker compose up -d</Command>
            </div>
          )}

          {blocker === 'missing' && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-ink-muted leading-relaxed">
                To update, run this next to the server's compose.yaml:
              </p>
              <Command>docker compose pull && docker compose up -d</Command>
              <p className="text-[12px] text-ink-muted leading-relaxed">
                For one-click and automatic updates, start the updater once:
              </p>
              <Command>docker compose --profile updates up -d</Command>
            </div>
          )}

          {!blocker && (
            <div className="flex flex-col gap-2">
              {waiting ? (
                <p className="flex items-center gap-2 text-[12px] text-ink-muted" role="status">
                  <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  </svg>
                  Updating. Halcyon restarts and this page reloads when it is back.
                </p>
              ) : (
                <div className="flex">
                  <button
                    onClick={() => void handleUpdate()}
                    disabled={busy}
                    className="text-[13px] font-medium text-wash rounded-xl transition disabled:opacity-50"
                    style={PRIMARY_BUTTON_STYLE}
                  >
                    {busy ? 'Starting…' : `Update to ${status.latest}`}
                  </button>
                </div>
              )}
              {status.update_error && !waiting && (
                <p className="text-[11.5px] text-danger-bright leading-relaxed">{status.update_error}</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card
        title="Automatic updates"
        hint={
          status.updater === 'ready'
            ? 'Checks every six hours and installs minor and patch releases while nothing is generating. Major releases always wait for you.'
            : 'Needs the updater service. Start it with the updates profile to turn this on.'
        }
      >
        {status.updater === 'ready' && (
          <SwitchRow
            on={status.auto_update}
            onToggle={() => void run(() => setAutoUpdate(!status.auto_update))}
            label="Install updates automatically"
            description={status.auto_update ? 'On' : 'Off. You will see a notice when a release is out.'}
          />
        )}
      </Card>

      {error && <p className="text-[12px] text-danger-bright leading-relaxed">{error}</p>}
    </>
  )
}
