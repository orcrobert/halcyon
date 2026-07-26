import { useCallback, useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../api/settings'
import { extractErrors } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import type { DecomposerProvider, Settings, SettingsUpdate } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface Draft {
  generator_url: string
  decomposer_provider: string
  decomposer_model: string
  decomposer_base_url: string
  decomposer_api_key: string
}

const EMPTY_DRAFT: Draft = {
  generator_url: '',
  decomposer_provider: '',
  decomposer_model: '',
  decomposer_base_url: '',
  decomposer_api_key: '',
}

function toDraft(settings: Settings): Draft {
  return {
    generator_url: settings.generator_url ?? '',
    decomposer_provider: settings.decomposer_provider ?? settings.defaults.decomposer_provider ?? '',
    decomposer_model: settings.decomposer_model ?? '',
    decomposer_base_url: settings.decomposer_base_url ?? '',
    decomposer_api_key: '',
  }
}

export function AccountPanel({ open, onClose }: Props) {
  const { state, logout } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
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
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSaved(false)
    getSettings()
      .then((res) => {
        if (cancelled) return
        setSettings(res)
        setDraft(toDraft(res))
      })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
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
      generator_url: draft.generator_url.trim(),
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

  if (!mounted) return null

  const panelStyle: React.CSSProperties = isMobile
    ? {
        top: 12,
        bottom: 12,
        left: 12,
        right: 12,
        width: 'auto',
        borderRadius: '20px',
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
      }
    : {
        top: 16,
        bottom: 16,
        right: 16,
        width: 420,
        borderRadius: '20px',
        transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
      }

  const user = state.status === 'authed' ? state.user : null

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          opacity: visible ? 1 : 0,
        }}
      />
      <aside
        className="fixed z-50 flex flex-col bg-[#0a0b12] border border-[#1a1b2a] overflow-hidden"
        style={{
          ...panelStyle,
          transition: 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.04)',
        }}
      >
        <header className="flex items-center justify-between gap-3" style={{ padding: '22px 22px 18px 22px' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-500/[0.08] border border-indigo-500/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-white/90 tracking-tight leading-tight">Account</h2>
              {user && (
                <p className="text-[11px] text-slate-600 truncate leading-tight" style={{ marginTop: '2px' }}>
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition shrink-0"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e2035 transparent', padding: '0 22px 22px 22px' }}
        >
          {loading && (
            <div className="flex flex-col gap-3 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[62px] rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.025)' }} />
              ))}
            </div>
          )}

          {!loading && settings && (
            <div className="flex flex-col gap-6">
              <Section
                title="Generator"
                hint="The audio-synthesis service you run. Leave blank to use this instance's default."
              >
                <Field
                  label="Generator URL"
                  value={draft.generator_url}
                  placeholder={settings.defaults.generator_url ?? 'http://localhost:9000'}
                  onChange={(v) => set('generator_url', v)}
                />
              </Section>

              <Section
                title="Decomposer"
                hint="The language model that turns your prompt into layered elements."
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600 font-semibold">
                    Provider
                  </span>
                  <select
                    value={draft.decomposer_provider}
                    onChange={(e) => set('decomposer_provider', e.target.value)}
                    className="w-full bg-[#0d0e18] border border-[#1e2035] rounded-xl text-slate-200 text-[13px] outline-none focus:border-indigo-500/40 transition-colors"
                    style={{ padding: '10px 12px', fontFamily: 'inherit' }}
                  >
                    {settings.providers.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </label>

                <Field
                  label="Model"
                  value={draft.decomposer_model}
                  placeholder={provider?.default_model ?? ''}
                  onChange={(v) => set('decomposer_model', v)}
                />

                {provider?.key !== 'gemini' && (
                  <Field
                    label="Base URL"
                    value={draft.decomposer_base_url}
                    placeholder={provider?.default_base_url ?? ''}
                    onChange={(v) => set('decomposer_base_url', v)}
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600 font-semibold">
                      API key
                    </span>
                    {settings.decomposer_api_key_set && (
                      <button
                        onClick={handleClearKey}
                        disabled={saving}
                        className="text-[11px] text-slate-500 hover:text-red-400 transition disabled:opacity-40"
                        style={{ fontFamily: 'inherit' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    autoComplete="off"
                    value={draft.decomposer_api_key}
                    onChange={(e) => set('decomposer_api_key', e.target.value)}
                    placeholder={settings.decomposer_api_key_set ? 'Stored — type to replace' : 'Not set'}
                    className="w-full bg-[#0d0e18] border border-[#1e2035] rounded-xl text-slate-200 placeholder:text-slate-700 text-[13px] outline-none focus:border-indigo-500/40 transition-colors"
                    style={{ padding: '10px 12px', fontFamily: 'inherit' }}
                  />
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {provider?.requires_api_key
                      ? 'Stored encrypted and never shown again.'
                      : 'Optional for local servers.'}
                  </p>
                </div>
              </Section>

              {error && (
                <p className="text-[12px] text-red-400 leading-relaxed">{error}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 text-[13px] font-medium text-white rounded-xl transition disabled:opacity-50"
                  style={{
                    padding: '11px 16px',
                    background: 'rgb(79, 70, 229)',
                    fontFamily: 'inherit',
                    boxShadow: '0 0 0 1px rgba(99,102,241,0.35), 0 4px 12px rgba(99,102,241,0.18)',
                  }}
                >
                  {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
                </button>
                <button
                  onClick={logout}
                  className="text-[13px] text-slate-400 hover:text-slate-200 border border-[#1d1e2e] hover:border-[#2a2b40] rounded-xl transition"
                  style={{ padding: '11px 16px', fontFamily: 'inherit' }}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[13px] font-semibold text-slate-300 tracking-tight">{title}</h3>
        <p className="text-[11px] text-slate-600 leading-relaxed" style={{ marginTop: '3px' }}>{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600 font-semibold">{label}</span>
      <input
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d0e18] border border-[#1e2035] rounded-xl text-slate-200 placeholder:text-slate-700 text-[13px] outline-none focus:border-indigo-500/40 transition-colors"
        style={{ padding: '10px 12px', fontFamily: 'inherit' }}
      />
    </label>
  )
}
