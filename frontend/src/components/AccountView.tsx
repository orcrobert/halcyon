import { useCallback, useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../api/settings'
import { extractErrors } from '../api/errors'
import { useAuth } from '../auth/context'
import { GeneratorsCard } from './GeneratorsCard'
import { PromptEditorModal } from './PromptEditorModal'
import type { DecomposerProvider, Settings, SettingsUpdate } from '../types'

interface Props {
  onBack: () => void
}

interface Draft {
  decomposer_provider: string
  decomposer_model: string
  decomposer_base_url: string
  decomposer_api_key: string
}

const EMPTY_DRAFT: Draft = {
  decomposer_provider: '',
  decomposer_model: '',
  decomposer_base_url: '',
  decomposer_api_key: '',
}

const INPUT_CLASS =
  'w-full bg-surface-sunken border border-line rounded-xl text-ink placeholder:text-ink-ghost text-[13.5px] outline-none focus:border-accent/45 transition-colors'
const INPUT_STYLE: React.CSSProperties = { padding: '11px 13px', fontFamily: 'inherit' }
const LABEL_CLASS = 'text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold'

function toDraft(settings: Settings): Draft {
  return {
    decomposer_provider: settings.decomposer_provider ?? settings.defaults.decomposer_provider ?? '',
    decomposer_model: settings.decomposer_model ?? '',
    decomposer_base_url: settings.decomposer_base_url ?? '',
    decomposer_api_key: '',
  }
}

function initials(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]).join('')
  return (letters || source[0] || '?').toUpperCase()
}

export function AccountView({ onBack }: Props) {
  const { state, logout } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [revealKey, setRevealKey] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getSettings()
      .then((res) => {
        if (cancelled) return
        setSettings(res)
        setDraft(toDraft(res))
      })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !promptOpen) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, promptOpen])

  const set = useCallback((field: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setSaved(false)
  }, [])

  const provider: DecomposerProvider | undefined = settings?.providers.find(
    (p) => p.key === draft.decomposer_provider,
  )

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setError(null)

    const patch: SettingsUpdate = {
      decomposer_provider: draft.decomposer_provider,
      decomposer_model: draft.decomposer_model.trim(),
      decomposer_base_url: draft.decomposer_base_url.trim(),
    }
    if (draft.decomposer_api_key.trim()) {
      patch.decomposer_api_key = draft.decomposer_api_key.trim()
    }

    try {
      const next = await updateSettings(patch)
      setSettings(next)
      setDraft(toDraft(next))
      setSaved(true)
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePrompt(text: string) {
    if (!settings) return
    setPromptSaving(true)
    setPromptError(null)

    const trimmed = text.trim()
    const isDefault = trimmed === settings.defaults.decomposer_prompt.trim()

    try {
      const next = await updateSettings({ decomposer_prompt: isDefault ? '' : trimmed })
      setSettings(next)
      setPromptOpen(false)
    } catch (e) {
      setPromptError(extractErrors(e).message)
    } finally {
      setPromptSaving(false)
    }
  }

  async function handleClearKey() {
    setSaving(true)
    setError(null)
    try {
      const next = await updateSettings({ decomposer_api_key: '' })
      setSettings(next)
      setDraft(toDraft(next))
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setSaving(false)
    }
  }

  const user = state.status === 'authed' ? state.user : null
  const showBaseUrl = provider ? provider.key !== 'gemini' : false

  return (
    <div className="relative min-h-screen w-full">
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '460px',
          background:
            'radial-gradient(ellipse 60% 100% at 50% 0%, color-mix(in srgb, var(--color-accent) 9%, transparent), color-mix(in srgb, var(--color-accent) 0%, transparent) 72%)',
        }}
      />

      <div
        className="relative flex flex-col"
        style={{ maxWidth: '620px', margin: '0 auto', padding: '32px 24px 80px 24px' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 self-start text-[12px] text-ink-muted hover:text-ink-soft transition-colors"
          style={{ marginBottom: '44px', fontFamily: 'inherit' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        <header className="flex flex-col items-center text-center" style={{ marginBottom: '44px' }}>
          <div
            className="flex items-center justify-center rounded-2xl text-[15px] font-semibold text-accent-pale"
            style={{
              width: '52px',
              height: '52px',
              marginBottom: '16px',
              background: 'linear-gradient(150deg, color-mix(in srgb, var(--color-accent) 20%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            }}
          >
            {user ? initials(user.name, user.email) : '·'}
          </div>
          <h1 className="text-[21px] font-semibold text-wash/95 tracking-tight leading-tight">
            {user?.name || 'Account'}
          </h1>
          <p className="text-[12.5px] text-ink-muted" style={{ marginTop: '5px' }}>
            {user?.email}
          </p>
        </header>

        {loading && (
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl animate-pulse" style={{ height: '150px', background: 'color-mix(in srgb, var(--color-wash) 2.2%, transparent)' }} />
            ))}
          </div>
        )}

        {!loading && settings && (
          <div className="flex flex-col gap-4">
            <GeneratorsCard />

            <Card
              title="Decomposer"
              hint="The language model that turns your prompt into layered elements."
            >
              <label className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>Provider</span>
                <select
                  name="halcyon-decomposer-provider"
                  autoComplete="off"
                  value={draft.decomposer_provider}
                  onChange={(e) => set('decomposer_provider', e.target.value)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                >
                  {settings.providers.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </label>

              <Field
                label="Model"
                name="halcyon-decomposer-model"
                value={draft.decomposer_model}
                placeholder={provider?.default_model ?? ''}
                onChange={(v) => set('decomposer_model', v)}
              />

              {showBaseUrl && (
                <Field
                  label="Base URL"
                  name="halcyon-decomposer-base-url"
                  value={draft.decomposer_base_url}
                  placeholder={provider?.default_base_url ?? ''}
                  onChange={(v) => set('decomposer_base_url', v)}
                />
              )}

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={LABEL_CLASS}>API key</span>
                  {settings.decomposer_api_key_set && (
                    <button
                      onClick={handleClearKey}
                      disabled={saving}
                      className="text-[11px] text-ink-muted hover:text-danger-bright transition disabled:opacity-40"
                      style={{ fontFamily: 'inherit' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    name="halcyon-decomposer-secret"
                    autoComplete="off"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-bwignore
                    data-form-type="other"
                    value={draft.decomposer_api_key}
                    onChange={(e) => set('decomposer_api_key', e.target.value)}
                    placeholder={settings.decomposer_api_key_set ? 'Stored — type to replace' : 'Not set'}
                    className={INPUT_CLASS}
                    style={{
                      ...INPUT_STYLE,
                      paddingRight: '58px',
                      WebkitTextSecurity: revealKey ? 'none' : 'disc',
                      textSecurity: revealKey ? 'none' : 'disc',
                    } as React.CSSProperties}
                  />
                  {draft.decomposer_api_key && (
                    <button
                      type="button"
                      onClick={() => setRevealKey((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center text-[11px] text-ink-faint hover:text-ink-soft transition-colors"
                      style={{ paddingRight: '13px', fontFamily: 'inherit' }}
                    >
                      {revealKey ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
                <p className="text-[11.5px] text-ink-faint leading-relaxed">
                  {provider?.requires_api_key
                    ? 'Stored encrypted and never shown again.'
                    : 'Optional for local servers.'}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>System prompt</span>
                <button
                  onClick={() => { setPromptError(null); setPromptOpen(true) }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken hover:border-accent/40 transition-colors text-left"
                  style={{ padding: '11px 13px', fontFamily: 'inherit' }}
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-[13px] text-ink-soft">
                      {settings.decomposer_prompt ? 'Custom prompt' : 'Default prompt'}
                    </span>
                    <span className="text-[11px] text-ink-faint truncate">
                      {settings.decomposer_prompt
                        ? 'Your own decomposition rules'
                        : 'The rules Halcyon ships with'}
                    </span>
                  </span>
                  <span className="text-[11px] text-accent-soft/80 shrink-0">Edit</span>
                </button>
              </div>
            </Card>

            {error && <p className="text-[12.5px] text-danger-bright leading-relaxed">{error}</p>}

            <div
              className="flex items-center justify-between gap-3"
              style={{ marginTop: '6px', paddingTop: '18px', borderTop: '1px solid var(--color-line-soft)' }}
            >
              <button
                onClick={logout}
                className="text-[12.5px] text-ink-muted hover:text-danger-bright transition-colors"
                style={{ fontFamily: 'inherit' }}
              >
                Sign out
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[13px] font-medium text-wash rounded-xl transition disabled:opacity-50"
                style={{
                  padding: '11px 22px',
                  background: 'var(--color-accent-deep)',
                  fontFamily: 'inherit',
                  boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent), 0 6px 18px color-mix(in srgb, var(--color-accent) 20%, transparent)',
                }}
              >
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {!loading && !settings && error && (
          <p className="text-[13px] text-danger-bright leading-relaxed">{error}</p>
        )}
      </div>

      {settings && (
        <PromptEditorModal
          open={promptOpen}
          value={settings.decomposer_prompt ?? settings.defaults.decomposer_prompt}
          defaultValue={settings.defaults.decomposer_prompt}
          saving={promptSaving}
          error={promptError}
          onSave={handleSavePrompt}
          onClose={() => setPromptOpen(false)}
        />
      )}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-surface-hover bg-surface flex flex-col gap-4"
      style={{ padding: '22px', boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 30%, transparent)' }}
    >
      <div>
        <h2 className="text-[14px] font-semibold text-ink tracking-tight">{title}</h2>
        <p className="text-[11.5px] text-ink-faint leading-relaxed" style={{ marginTop: '4px' }}>{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  name,
  value,
  placeholder,
  onChange,
}: {
  label: string
  name: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-2 min-w-0">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type="text"
        name={name}
        spellCheck={false}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
        style={INPUT_STYLE}
      />
    </label>
  )
}
