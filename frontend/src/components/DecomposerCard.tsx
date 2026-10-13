import { useEffect, useState } from 'react'
import { updateSettings } from '../api/settings'
import { extractErrors } from '../api/errors'
import { Card, Field } from './AccountCard'
import { INPUT_CLASS, INPUT_STYLE, LABEL_CLASS, PRIMARY_BUTTON_STYLE } from './accountStyles'
import type { DecomposerProvider, Settings, SettingsUpdate } from '../types'

interface Draft {
  decomposer_provider: string
  decomposer_model: string
  decomposer_base_url: string
  decomposer_api_key: string
}

interface Props {
  settings: Settings
  onSaved: (next: Settings) => void
  onDirtyChange?: (dirty: boolean) => void
  userId?: number
  hint?: string
}

function toDraft(settings: Settings): Draft {
  return {
    decomposer_provider: settings.decomposer_provider ?? settings.defaults.decomposer_provider ?? '',
    decomposer_model: settings.decomposer_model ?? '',
    decomposer_base_url: settings.decomposer_base_url ?? '',
    decomposer_api_key: '',
  }
}

function isDirty(draft: Draft, settings: Settings): boolean {
  const stored = toDraft(settings)
  return (
    draft.decomposer_provider !== stored.decomposer_provider ||
    draft.decomposer_model.trim() !== stored.decomposer_model ||
    draft.decomposer_base_url.trim() !== stored.decomposer_base_url ||
    draft.decomposer_api_key.trim() !== ''
  )
}

export function DecomposerCard({
  settings,
  onSaved,
  onDirtyChange,
  userId,
  hint = 'The language model that turns your prompt into layered elements.',
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealKey, setRevealKey] = useState(false)

  const dirty = isDirty(draft, settings)
  const provider: DecomposerProvider | undefined = settings.providers.find(
    (p) => p.key === draft.decomposer_provider,
  )
  const showBaseUrl = provider?.uses_base_url ?? false

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function set(field: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
    setSaved(false)
  }

  async function save(patch: SettingsUpdate) {
    setSaving(true)
    setError(null)
    try {
      const next = await updateSettings(patch, userId)
      onSaved(next)
      setDraft(toDraft(next))
      return true
    } catch (e) {
      setError(extractErrors(e).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const patch: SettingsUpdate = {
      decomposer_provider: draft.decomposer_provider,
      decomposer_model: draft.decomposer_model.trim(),
      decomposer_base_url: draft.decomposer_base_url.trim(),
    }
    if (draft.decomposer_api_key.trim()) {
      patch.decomposer_api_key = draft.decomposer_api_key.trim()
    }
    if (await save(patch)) setSaved(true)
  }

  return (
    <Card title="Decomposer" hint={hint}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 min-w-0">
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
              <option key={p.key} value={p.key} disabled={!p.available}>
                {p.available ? p.label : `${p.label} (unavailable on this server)`}
              </option>
            ))}
          </select>
          {provider && !provider.available && (
            <span className="text-[11.5px] text-danger-bright leading-relaxed">
              Turned off on this server. Pick another provider, or set DECOMPOSER_ALLOW_CLI=true and rebuild.
            </span>
          )}
        </label>

        <Field
          label="Model"
          name="halcyon-decomposer-model"
          value={draft.decomposer_model}
          placeholder={provider?.default_model || 'CLI default'}
          suggestions={provider?.suggested_models}
          onChange={(v) => set('decomposer_model', v)}
        />
      </div>

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
          <span className={LABEL_CLASS}>{provider?.key_label ?? 'API key'}</span>
          {settings.decomposer_api_key_set && (
            <button
              onClick={() => void save({ decomposer_api_key: '' })}
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
          {provider?.key_hint
            ? `${provider.key_hint} Stored encrypted and never shown again.`
            : provider?.requires_api_key
              ? 'Stored encrypted and never shown again.'
              : 'Optional for local servers.'}
        </p>
      </div>

      {error && <p role="alert" className="text-[12px] text-danger-bright leading-relaxed">{error}</p>}

      <div
        className="flex flex-wrap items-center justify-end gap-3"
        style={{ paddingTop: '16px', borderTop: '1px solid var(--color-line-soft)' }}
      >
        <span className="text-[11.5px] text-ink-faint flex-1">
          {dirty ? 'Unsaved changes' : saved ? 'All changes saved' : ''}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="text-[13px] font-medium text-wash rounded-xl transition disabled:opacity-50"
          style={PRIMARY_BUTTON_STYLE}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Card>
  )
}
