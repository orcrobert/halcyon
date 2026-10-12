import { useEffect, useRef, useState } from 'react'
import { Toggle } from './Toggle'
import type {
  DeployCapability,
  Generator,
  GeneratorKind,
  GeneratorOptionSpec,
  GeneratorOptionValue,
} from '../types'

const INPUT_CLASS =
  'w-full bg-surface-sunken border border-line rounded-xl text-ink placeholder:text-ink-ghost text-[12.5px] outline-none focus:border-accent/45 transition-colors disabled:opacity-50'
const INPUT_STYLE: React.CSSProperties = { padding: '8px 11px', fontFamily: 'inherit' }
const HEADING_CLASS = 'text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold'
const MODAL_TOKENS_URL = 'https://modal.com/settings/tokens'

interface Props {
  kind: GeneratorKind
  generator: Generator | undefined
  specs: GeneratorOptionSpec[]
  deploy: DeployCapability
  busy: boolean
  onChange: (key: string, value: GeneratorOptionValue | null) => void
  onDeploy: () => void
  onSaveToken: (tokenId: string, tokenSecret: string) => Promise<boolean>
  onRemoveToken: () => void
  draftOptions: Record<string, GeneratorOptionValue>
}

function relative(iso: string | null, now: number): string {
  if (!iso) return ''
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

function clock(iso: string | null, now: number): string {
  if (!iso) return '0:00'
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function NumberInput({
  spec, value, disabled, onCommit,
}: {
  spec: GeneratorOptionSpec
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(value)

  function commit() {
    setEditing(false)
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) return
    const lo = spec.minimum ?? -Infinity
    const hi = spec.maximum ?? Infinity
    const clamped = Math.min(hi, Math.max(lo, parsed))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={spec.minimum ?? undefined}
        max={spec.maximum ?? undefined}
        step={spec.step ?? undefined}
        value={shown}
        disabled={disabled}
        onFocus={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={`${INPUT_CLASS} tabular-nums`}
        style={{ ...INPUT_STYLE, paddingRight: spec.unit ? 52 : 11 }}
      />
      {spec.unit && (
        <span
          className="absolute inset-y-0 right-0 flex items-center text-[11px] text-ink-faint pointer-events-none"
          style={{ paddingRight: 12 }}
        >
          {spec.unit}
        </span>
      )}
    </div>
  )
}

function OptionField({
  spec, value, pending, disabled, onChange,
}: {
  spec: GeneratorOptionSpec
  value: GeneratorOptionValue
  pending: boolean
  disabled: boolean
  onChange: (value: GeneratorOptionValue | null) => void
}) {
  const changed = value !== spec.default

  const header = (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] text-ink-soft truncate">{spec.label}</span>
        {pending && (
          <span
            className="shrink-0 text-[9.5px] uppercase tracking-[0.12em] rounded-full"
            title="Changed since the last deploy"
            style={{
              padding: '1px 7px',
              color: 'var(--color-warn)',
              background: 'color-mix(in srgb, var(--color-warn) 12%, transparent)',
            }}
          >
            Redeploy
          </span>
        )}
      </span>
      {changed && (
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="shrink-0 text-[10.5px] text-ink-faint hover:text-ink-soft transition-colors disabled:opacity-40"
          style={{ fontFamily: 'inherit' }}
        >
          Default
        </button>
      )}
    </div>
  )

  if (spec.kind === 'toggle') {
    return (
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        {header}
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={spec.label}
          disabled={disabled}
          onClick={() => onChange(!value)}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken text-left transition disabled:opacity-50"
          style={{ padding: '9px 12px', fontFamily: 'inherit' }}
        >
          <span className="text-[11.5px] text-ink-faint leading-snug">{spec.hint}</span>
          <Toggle on={Boolean(value)} />
        </button>
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      {header}
      {spec.kind === 'choice' ? (
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        >
          {spec.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      ) : (
        <NumberInput
          spec={spec}
          value={Number(value)}
          disabled={disabled}
          onCommit={(next) => onChange(next)}
        />
      )}
      <span className="text-[10.5px] text-ink-faint leading-snug">{spec.hint}</span>
    </label>
  )
}

function TokenForm({
  deploy, busy, onSave, onRemove,
}: {
  deploy: DeployCapability
  busy: boolean
  onSave: (tokenId: string, tokenSecret: string) => Promise<boolean>
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(deploy.credentials === null)
  const [tokenId, setTokenId] = useState('')
  const [secret, setSecret] = useState('')

  async function save() {
    if (!tokenId.trim() || !secret.trim()) return
    if (await onSave(tokenId.trim(), secret.trim())) {
      setTokenId('')
      setSecret('')
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-sunken" style={{ padding: '9px 12px' }}>
        <span className="flex items-center gap-2 text-[11.5px] text-ink-muted">
          <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--color-success)' }} />
          {deploy.credentials === 'user' ? 'Your Modal token is saved' : "Using this server's Modal token"}
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-ink-muted hover:text-ink-soft transition-colors"
            style={{ fontFamily: 'inherit' }}
          >
            {deploy.credentials === 'user' ? 'Replace' : 'Use my own'}
          </button>
          {deploy.credentials === 'user' && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-[11px] text-ink-faint hover:text-danger-bright transition-colors disabled:opacity-40"
              style={{ fontFamily: 'inherit' }}
            >
              Remove
            </button>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          name="halcyon-modal-token-id"
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore
          data-form-type="other"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="Token ID (ak-…)"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
        <input
          type="text"
          name="halcyon-modal-token-secret"
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore
          data-form-type="other"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          placeholder="Token secret (as-…)"
          className={INPUT_CLASS}
          style={{ ...INPUT_STYLE, WebkitTextSecurity: 'disc', textSecurity: 'disc' } as React.CSSProperties}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10.5px] text-ink-faint leading-snug">
          Create one at{' '}
          <a href={MODAL_TOKENS_URL} target="_blank" rel="noreferrer" className="text-accent-soft/80 hover:text-accent-soft">
            modal.com/settings/tokens
          </a>
          . Stored encrypted and never shown again.
        </span>
        <span className="flex items-center gap-3">
          {deploy.credentials !== null && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] text-ink-faint hover:text-ink-soft transition-colors"
              style={{ fontFamily: 'inherit' }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !tokenId.trim() || !secret.trim()}
            className="text-[11.5px] font-medium text-wash rounded-lg transition disabled:opacity-40"
            style={{ padding: '6px 12px', background: 'var(--color-accent-deep)', fontFamily: 'inherit' }}
          >
            Save token
          </button>
        </span>
      </div>
    </div>
  )
}

export function GeneratorOptionsPanel({
  kind, generator, specs, deploy, busy, onChange, onDeploy, onSaveToken, onRemoveToken, draftOptions,
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [logChoice, setLogChoice] = useState<boolean | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const applicable = specs.filter((spec) => spec.hosts.length === 0 || spec.hosts.includes(kind))
  const deploySpecs = applicable.filter((spec) => spec.scope === 'deploy')
  const requestSpecs = applicable.filter((spec) => spec.scope === 'request')
  const values: Record<string, GeneratorOptionValue> = generator?.options ?? draftOptions
  const pending = new Set(generator?.pending_changes ?? [])
  const deploying = generator?.deploy_status === 'deploying'
  const deployable = kind === 'modal'
  const showLog = logChoice ?? deploying

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), deploying ? 1000 : 30000)
    return () => window.clearInterval(timer)
  }, [deploying])

  useEffect(() => {
    const node = logRef.current
    if (node && deploying) node.scrollTop = node.scrollHeight
  }, [generator?.deploy_log, deploying, showLog])

  const valueOf = (spec: GeneratorOptionSpec) => values[spec.key] ?? spec.default

  let deployLabel = generator ? (pending.size > 0 || generator.deploy_status === 'failed' ? 'Redeploy' : 'Deploy again') : 'Create and deploy'
  if (deploying) deployLabel = `Deploying… ${clock(generator?.deploy_started_at ?? null, now)}`
  const deployBlocked = !deploy.available || deploy.credentials === null
  const highlight = !deploying && !deployBlocked && (!generator || pending.size > 0 || generator.deploy_status === 'failed')

  return (
    <div className="flex flex-col gap-5" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-line-soft)' }}>
      {deployable && (
        <div className="flex flex-col gap-2.5">
          <span className={HEADING_CLASS}>Modal account</span>
          {deploy.available ? (
            <TokenForm
              key={deploy.credentials ?? 'none'}
              deploy={deploy}
              busy={busy}
              onSave={onSaveToken}
              onRemove={onRemoveToken}
            />
          ) : (
            <p className="text-[11.5px] text-ink-faint leading-relaxed">
              This server has no copy of <span className="font-mono text-ink-muted">generators/</span> to deploy from.
              Deploy with <span className="font-mono text-ink-muted">modal deploy</span> from a checkout and paste the URL above.
            </p>
          )}
        </div>
      )}

      {deployable && deploySpecs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={HEADING_CLASS}>Deployment</span>
            <span className="text-[10.5px] text-ink-faint">Baked into the Modal app. Changes apply after a redeploy.</span>
          </div>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {deploySpecs.map((spec) => (
              <OptionField
                key={spec.key}
                spec={spec}
                value={valueOf(spec)}
                pending={pending.has(spec.key)}
                disabled={busy || deploying}
                onChange={(value) => onChange(spec.key, value)}
              />
            ))}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl"
            style={{
              padding: '10px 12px',
              background: highlight
                ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
                : 'color-mix(in srgb, var(--color-wash) 2%, transparent)',
              border: `1px solid ${highlight ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-line-soft)'}`,
            }}
          >
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-[12px] text-ink-soft">
                {deploying
                  ? 'Deploy running'
                  : generator?.deploy_status === 'failed'
                    ? 'Last deploy failed'
                    : pending.size > 0
                      ? `${pending.size} change${pending.size === 1 ? '' : 's'} waiting for a redeploy`
                      : generator?.deployed_at
                        ? `Deployed ${relative(generator.deployed_at, now)}`
                        : generator
                          ? 'Not deployed from here yet'
                          : 'No Modal app yet'}
              </span>
              {generator?.deploy_status === 'failed' && generator.deploy_error && (
                <span className="text-[11px] text-danger-bright leading-snug break-words">{generator.deploy_error}</span>
              )}
              {deployBlocked && deploy.available && (
                <span className="text-[11px] text-ink-faint">Save a Modal token to deploy.</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {generator?.deploy_log && (
                <button
                  type="button"
                  onClick={() => setLogChoice(!showLog)}
                  className="text-[11.5px] text-ink-muted hover:text-ink-soft transition-colors"
                  style={{ fontFamily: 'inherit' }}
                >
                  {showLog ? 'Hide log' : 'Show log'}
                </button>
              )}
              <button
                type="button"
                onClick={onDeploy}
                disabled={busy || deploying || deployBlocked}
                className="text-[12px] font-medium rounded-lg transition disabled:opacity-50 tabular-nums"
                style={{
                  padding: '7px 14px',
                  fontFamily: 'inherit',
                  color: highlight ? 'var(--color-wash)' : 'var(--color-ink-soft)',
                  background: highlight ? 'var(--color-accent-deep)' : 'color-mix(in srgb, var(--color-wash) 5%, transparent)',
                  boxShadow: highlight
                    ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent)'
                    : '0 0 0 1px var(--color-line)',
                }}
              >
                {deployLabel}
              </button>
            </div>
          </div>

          {showLog && generator?.deploy_log && (
            <pre
              ref={logRef}
              className="font-mono text-[10.5px] text-ink-muted rounded-xl border border-line bg-surface-sunken"
              style={{
                margin: 0,
                padding: '10px 12px',
                maxHeight: 240,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.55,
              }}
            >
              {generator.deploy_log}
            </pre>
          )}
        </div>
      )}

      {requestSpecs.length > 0 && (generator || deployable) && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={HEADING_CLASS}>Per request</span>
            <span className="text-[10.5px] text-ink-faint">Sent with every generation. No redeploy needed.</span>
          </div>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {requestSpecs.map((spec) => (
              <OptionField
                key={spec.key}
                spec={spec}
                value={valueOf(spec)}
                pending={false}
                disabled={busy}
                onChange={(value) => onChange(spec.key, value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
