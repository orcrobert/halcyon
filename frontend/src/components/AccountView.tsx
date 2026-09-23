import { useCallback, useEffect, useRef, useState } from 'react'
import { getSettings, updateSettings } from '../api/settings'
import { extractErrors } from '../api/errors'
import { useAuth } from '../auth/context'
import { GeneratorsCard } from './GeneratorsCard'
import { PromptEditorModal } from './PromptEditorModal'
import { ThemeCard } from './ThemeCard'
import { Toggle } from './Toggle'
import { DEFAULT_THEME, applyTheme, storeTheme, storedTheme } from '../themes'
import { applyReduceBlur, storeReduceBlur } from '../effects'
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

type SectionId = 'model' | 'generator' | 'appearance' | 'account'

interface Section {
  id: SectionId
  label: string
  caption: string
  title: string
  hint: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'model',
    label: 'Language model',
    caption: 'Decomposer and review',
    title: 'Language model',
    hint: 'The model that splits a prompt into layers, and whether you check its work first.',
    icon: (
      <>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </>
    ),
  },
  {
    id: 'generator',
    label: 'Audio generator',
    caption: 'Where layers are rendered',
    title: 'Audio generator',
    hint: 'The GPU service that turns each layer into sound.',
    icon: (
      <>
        <line x1="4" y1="10" x2="4" y2="14" />
        <line x1="8" y1="6" x2="8" y2="18" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="16" y1="7" x2="16" y2="17" />
        <line x1="20" y1="10" x2="20" y2="14" />
      </>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    caption: 'Theme and performance',
    title: 'Appearance',
    hint: 'How Halcyon looks, and how much it asks of your graphics card.',
    icon: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  },
  {
    id: 'account',
    label: 'Account',
    caption: 'Profile and session',
    title: 'Account',
    hint: 'Who you are signed in as.',
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
]

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
const AVATAR_STYLE: React.CSSProperties = {
  background: 'linear-gradient(150deg, color-mix(in srgb, var(--color-accent) 20%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
}

function toDraft(settings: Settings): Draft {
  return {
    decomposer_provider: settings.decomposer_provider ?? settings.defaults.decomposer_provider ?? '',
    decomposer_model: settings.decomposer_model ?? '',
    decomposer_base_url: settings.decomposer_base_url ?? '',
    decomposer_api_key: '',
  }
}

function isDirty(draft: Draft, settings: Settings | null): boolean {
  if (!settings) return false
  const stored = toDraft(settings)
  return (
    draft.decomposer_provider !== stored.decomposer_provider ||
    draft.decomposer_model.trim() !== stored.decomposer_model ||
    draft.decomposer_base_url.trim() !== stored.decomposer_base_url ||
    draft.decomposer_api_key.trim() !== ''
  )
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
  const [theme, setTheme] = useState<string>(storedTheme)
  const [section, setSection] = useState<SectionId>('model')
  const tabRefs = useRef<Partial<Record<SectionId, HTMLButtonElement | null>>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getSettings()
      .then((res) => {
        if (cancelled) return
        setSettings(res)
        setDraft(toDraft(res))
        const active = res.theme ?? DEFAULT_THEME
        setTheme(active)
        applyTheme(active)
        storeTheme(active)
        applyReduceBlur(res.reduce_blur)
        storeReduceBlur(res.reduce_blur)
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

  function selectSection(id: SectionId) {
    if (id === section) return
    setSection(id)
    if (settings) setError(null)
  }

  function handleTabKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    let target: number | null = step ? (index + step + SECTIONS.length) % SECTIONS.length : null
    if (e.key === 'Home') target = 0
    if (e.key === 'End') target = SECTIONS.length - 1
    if (target === null) return
    e.preventDefault()
    const next = SECTIONS[target].id
    selectSection(next)
    tabRefs.current[next]?.focus()
  }

  async function handleTheme(id: string) {
    setTheme(id)
    applyTheme(id)
    storeTheme(id)
    setError(null)
    try {
      setSettings(await updateSettings({ theme: id }))
    } catch (e) {
      setError(extractErrors(e).message)
    }
  }

  async function handleReviewToggle() {
    if (!settings) return
    const next = !settings.review_decomposition
    setSettings({ ...settings, review_decomposition: next })
    setError(null)
    try {
      setSettings(await updateSettings({ review_decomposition: next }))
    } catch (e) {
      setSettings((current) => (current ? { ...current, review_decomposition: !next } : current))
      setError(extractErrors(e).message)
    }
  }

  async function handleReduceBlurToggle() {
    if (!settings) return
    const next = !settings.reduce_blur
    setSettings({ ...settings, reduce_blur: next })
    applyReduceBlur(next)
    storeReduceBlur(next)
    setError(null)
    try {
      setSettings(await updateSettings({ reduce_blur: next }))
    } catch (e) {
      setSettings((current) => (current ? { ...current, reduce_blur: !next } : current))
      applyReduceBlur(!next)
      storeReduceBlur(!next)
      setError(extractErrors(e).message)
    }
  }

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
  const dirty = isDirty(draft, settings)
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

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
        className="relative flex flex-col [--gutter:16px] sm:[--gutter:24px]"
        style={{ maxWidth: '1000px', margin: '0 auto', padding: '28px var(--gutter) 80px' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 self-start text-[12px] text-ink-muted hover:text-ink-soft transition-colors"
          style={{ marginBottom: '28px', fontFamily: 'inherit' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        <div className="flex flex-col md:grid md:grid-cols-[236px_minmax(0,1fr)] md:gap-10 lg:gap-14">
          <aside className="flex flex-col md:sticky md:top-8 md:self-start">
            <div className="flex items-center gap-3 min-w-0" style={{ marginBottom: '20px', padding: '0 4px' }}>
              <div
                className="flex items-center justify-center rounded-xl text-[13px] font-semibold text-accent-pale shrink-0"
                style={{ width: '40px', height: '40px', ...AVATAR_STYLE }}
              >
                {user ? initials(user.name, user.email) : '·'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-semibold text-wash/95 tracking-tight leading-tight truncate">
                  {user?.name || 'Account'}
                </span>
                <span className="text-[11.5px] text-ink-muted truncate" style={{ marginTop: '3px' }}>
                  {user?.email}
                </span>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Settings sections"
              className="flex gap-1.5 overflow-x-auto [--bleed:var(--gutter)] md:[--bleed:0px] md:flex-col md:gap-1 md:overflow-visible"
              style={{
                margin: '0 calc(-1 * var(--bleed))',
                padding: '0 var(--bleed) 4px',
                scrollbarWidth: 'none',
              }}
            >
                {SECTIONS.map((s, i) => {
                  const selected = s.id === section
                  const flagged = s.id === 'model' && dirty
                  return (
                    <button
                      key={s.id}
                      ref={(el) => { tabRefs.current[s.id] = el }}
                      type="button"
                      role="tab"
                      id={`account-tab-${s.id}`}
                      aria-selected={selected}
                      aria-controls={`account-panel-${s.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => selectSection(s.id)}
                      onKeyDown={(e) => handleTabKey(e, i)}
                      className={`group relative flex items-center gap-2.5 shrink-0 rounded-xl border text-left transition-colors outline-none focus-visible:border-accent/60 ${
                        selected
                          ? 'bg-surface-raised border-line-hover'
                          : 'border-transparent hover:bg-surface-hover/60'
                      }`}
                      style={{ padding: '8px 12px 8px 8px', fontFamily: 'inherit' }}
                    >
                      <span
                        className={`flex items-center justify-center rounded-lg shrink-0 transition-colors ${
                          selected ? 'text-accent-bright' : 'text-ink-faint group-hover:text-ink-soft'
                        }`}
                        style={{
                          width: '28px',
                          height: '28px',
                          background: selected
                            ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                            : 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          {s.icon}
                        </svg>
                      </span>
                      <span className="flex flex-col min-w-0 md:flex-1">
                        <span className={`text-[13px] whitespace-nowrap ${selected ? 'text-ink-bright font-medium' : 'text-ink-soft'}`}>
                          {s.label}
                        </span>
                        <span className="hidden md:block text-[11px] text-ink-faint truncate" style={{ marginTop: '1px' }}>
                          {s.caption}
                        </span>
                      </span>
                      {flagged && (
                        <span
                          aria-label="Unsaved changes"
                          className="rounded-full shrink-0"
                          style={{ width: '6px', height: '6px', background: 'var(--color-warn)' }}
                        />
                      )}
                    </button>
                  )
                })}
            </div>
          </aside>

          <main className="flex flex-col min-w-0" style={{ paddingTop: '12px' }}>
            <header style={{ marginBottom: '22px' }}>
              <h1 className="text-[21px] font-semibold text-wash/95 tracking-tight leading-tight">{active.title}</h1>
              <p className="text-[12.5px] text-ink-muted leading-relaxed" style={{ marginTop: '6px' }}>
                {active.hint}
              </p>
            </header>

            {error && (
              <p
                role="alert"
                className="text-[12.5px] text-danger-bright leading-relaxed rounded-xl bg-surface-danger"
                style={{ padding: '10px 13px', marginBottom: '16px' }}
              >
                {error}
              </p>
            )}

            {loading && (
              <div className="flex flex-col gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-2xl animate-pulse" style={{ height: '150px', background: 'color-mix(in srgb, var(--color-wash) 2.2%, transparent)' }} />
                ))}
              </div>
            )}

            {!loading && settings && (
              <>
                <Panel id="model" active={section}>
                  <Card
                    title="Decomposer"
                    hint="The language model that turns your prompt into layered elements."
                  >
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
                        style={{
                          padding: '10px 20px',
                          background: 'var(--color-accent-deep)',
                          fontFamily: 'inherit',
                          boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent), 0 6px 18px color-mix(in srgb, var(--color-accent) 20%, transparent)',
                        }}
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </Card>

                  <Card
                    title="Instructions"
                    hint="The rules the model follows when it splits a scene into layers."
                  >
                    <button
                      onClick={() => { setPromptError(null); setPromptOpen(true) }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken hover:border-accent/40 transition-colors text-left"
                      style={{ padding: '12px 14px', fontFamily: 'inherit' }}
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
                  </Card>

                  <Card
                    title="Workflow"
                    hint="How a prompt becomes a soundscape."
                  >
                    <SwitchRow
                      on={settings.review_decomposition}
                      onToggle={handleReviewToggle}
                      label="Review layers before generating"
                      description="Pause after the language model splits the scene, so you can edit the layers by hand or ask it for changes before any audio is rendered."
                    />
                  </Card>
                </Panel>

                <Panel id="generator" active={section}>
                  <GeneratorsCard />
                </Panel>

                <Panel id="appearance" active={section}>
                  <ThemeCard value={theme} onChange={handleTheme} />

                  <Card
                    title="Performance"
                    hint="Trade some polish for a smoother interface."
                  >
                    <SwitchRow
                      on={settings.reduce_blur}
                      onToggle={handleReduceBlurToggle}
                      label="Reduce blur"
                      description="Drop the frosted-glass panels and soft glows. Helps when the page stutters, for example while a language model runs on the same machine and keeps the GPU busy."
                    />
                  </Card>
                </Panel>

                <Panel id="account" active={section}>
                  <Card title="Profile" hint="The name and email this account was created with.">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className="flex items-center justify-center rounded-2xl text-[15px] font-semibold text-accent-pale shrink-0"
                        style={{ width: '52px', height: '52px', ...AVATAR_STYLE }}
                      >
                        {user ? initials(user.name, user.email) : '·'}
                      </div>
                      <div className="grid gap-3 min-w-0 flex-1 sm:grid-cols-2">
                        <ReadOnly label="Name" value={user?.name || '—'} />
                        <ReadOnly label="Email" value={user?.email || '—'} />
                      </div>
                    </div>
                  </Card>

                  <Card title="Session" hint="Sign out of Halcyon on this device. Your soundscapes and settings stay saved.">
                    <div className="flex">
                      <button
                        onClick={logout}
                        className="flex items-center gap-2 rounded-xl border border-line bg-surface-sunken text-[13px] text-ink-soft hover:text-danger-bright hover:border-danger/50 transition-colors"
                        style={{ padding: '10px 16px', fontFamily: 'inherit' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </Card>
                </Panel>
              </>
            )}
          </main>
        </div>
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

function Panel({ id, active, children }: { id: SectionId; active: SectionId; children: React.ReactNode }) {
  const shown = id === active
  return (
    <section
      role="tabpanel"
      id={`account-panel-${id}`}
      aria-labelledby={`account-tab-${id}`}
      hidden={!shown}
      className="flex flex-col gap-4"
      style={shown ? { animation: 'fade-in 0.25s ease-out' } : undefined}
    >
      {children}
    </section>
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

function SwitchRow({
  on,
  onToggle,
  label,
  description,
}: {
  on: boolean
  onToggle: () => void
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 rounded-xl text-left bg-surface-sunken border border-line hover:border-line-hover transition-colors"
      style={{ padding: '12px 14px', fontFamily: 'inherit' }}
    >
      <span className="flex flex-col gap-1 min-w-0">
        <span className={`text-[13px] ${on ? 'text-ink-bright' : 'text-ink-soft'}`}>{label}</span>
        <span className="text-[11px] text-ink-faint leading-snug">{description}</span>
      </span>
      <Toggle on={on} />
    </button>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={LABEL_CLASS}>{label}</span>
      <span className="text-[13.5px] text-ink-soft truncate">{value}</span>
    </div>
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
