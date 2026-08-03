import { useEffect, useState } from 'react'
import {
  activateGenerator,
  createGenerator,
  deleteGenerator,
  listGenerators,
  testGenerator,
  updateGenerator,
} from '../api/generators'
import { extractErrors } from '../api/errors'
import type {
  Generator,
  GeneratorHost,
  GeneratorList,
  GeneratorProbe,
  GeneratorStatus,
} from '../types'

const INPUT_CLASS =
  'w-full bg-[#0b0c15] border border-[#1e2035] rounded-xl text-slate-200 placeholder:text-slate-700 text-[12.5px] outline-none focus:border-indigo-500/45 transition-colors'
const INPUT_STYLE: React.CSSProperties = { padding: '9px 12px', fontFamily: 'inherit' }

const STATUS_COLOR: Record<GeneratorStatus, string> = {
  ok: 'rgb(52, 211, 153)',
  unreachable: 'rgb(248, 113, 113)',
  error: 'rgb(251, 191, 36)',
}

const STATUS_LABEL: Record<GeneratorStatus, string> = {
  ok: 'Reachable',
  unreachable: 'Unreachable',
  error: 'Responded with an error',
}

function reportOf(generator: Generator | undefined): string | null {
  const reported = generator?.reported
  if (!reported) return null
  const models = [reported.audiogen_model, reported.musicgen_model]
    .filter(Boolean)
    .map((m) => (m as string).split('/').pop())
  if (!models.length) return null
  return `${models.join(' · ')}${reported.duration ? ` · ${reported.duration}s` : ''}`
}

export function GeneratorsCard() {
  const [list, setList] = useState<GeneratorList | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probes, setProbes] = useState<Record<number, GeneratorProbe>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    listGenerators()
      .then((res) => { if (!cancelled) setList(res) })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function run<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(key)
    setError(null)
    try {
      return await action()
    } catch (e) {
      setError(extractErrors(e).message)
      return null
    } finally {
      setBusy(null)
    }
  }

  function saved(host: GeneratorHost): Generator | undefined {
    return list?.generators.find((g) => g.kind === host.key)
  }

  function draftFor(host: GeneratorHost): string {
    return drafts[host.key] ?? saved(host)?.url ?? ''
  }

  async function handleSaveUrl(host: GeneratorHost) {
    const url = draftFor(host).trim()
    const existing = saved(host)
    if (!url || url === existing?.url) return

    const next = await run(host.key, () =>
      existing
        ? updateGenerator(existing.id, { url })
        : createGenerator({ name: host.label, url, kind: host.key }),
    )
    if (!next) return
    setList(next)
    setDrafts((d) => {
      const copy = { ...d }
      delete copy[host.key]
      return copy
    })
  }

  async function handleSelect(host: GeneratorHost) {
    const existing = saved(host)
    if (!existing || existing.is_active) return
    const next = await run(host.key, () => activateGenerator(existing.id))
    if (next) setList(next)
  }

  async function handleTest(host: GeneratorHost) {
    const existing = saved(host)
    if (!existing) return
    const result = await run(host.key, () => testGenerator(existing.id))
    if (!result) return
    setProbes((p) => ({ ...p, [existing.id]: result }))
    const refreshed = await listGenerators().catch(() => null)
    if (refreshed) setList(refreshed)
  }

  async function handleClear(host: GeneratorHost) {
    const existing = saved(host)
    if (!existing) return
    const next = await run(host.key, () => deleteGenerator(existing.id))
    if (!next) return
    setList(next)
    setDrafts((d) => {
      const copy = { ...d }
      delete copy[host.key]
      return copy
    })
  }

  return (
    <section
      className="rounded-2xl border border-[#1a1b2a] bg-[#0d0e18] flex flex-col gap-4"
      style={{ padding: '22px', boxShadow: '0 18px 40px rgba(0,0,0,0.30)' }}
    >
      <div>
        <h2 className="text-[14px] font-semibold text-slate-200 tracking-tight">Generator</h2>
        <p className="text-[11.5px] text-slate-600 leading-relaxed" style={{ marginTop: '4px' }}>
          Where your audio is synthesised. Save a URL against each host you use and pick one —
          they are remembered separately, so switching never means finding a link again.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ height: '58px', background: 'rgba(255,255,255,0.022)' }} />
          ))}
        </div>
      )}

      {!loading && list && (
        <div className="flex flex-col gap-2">
          {list.kinds.map((host) => {
            const existing = saved(host)
            const active = existing?.is_active ?? false
            const probe = existing ? probes[existing.id] : undefined
            const status = probe?.status ?? existing?.last_status ?? null
            const report = reportOf(existing)
            const draft = draftFor(host)
            const dirty = draft.trim() !== '' && draft.trim() !== (existing?.url ?? '')
            const working = busy === host.key

            return (
              <div
                key={host.key}
                className="rounded-xl border transition-colors"
                style={{
                  padding: '13px 14px',
                  borderColor: active ? 'rgba(99,102,241,0.35)' : '#191a27',
                  background: active ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.014)',
                }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSelect(host)}
                    disabled={!existing || active || working}
                    aria-label={`Use ${host.label}`}
                    title={existing ? `Use ${host.label}` : 'Add a URL first'}
                    className="shrink-0 rounded-full border transition disabled:cursor-default"
                    style={{
                      width: '15px',
                      height: '15px',
                      borderColor: active ? 'rgb(99,102,241)' : existing ? '#3a3d55' : '#23253a',
                      background: active
                        ? 'radial-gradient(circle, rgb(129,140,248) 0%, rgb(79,70,229) 60%, transparent 62%)'
                        : 'transparent',
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-medium ${existing ? 'text-slate-200' : 'text-slate-400'}`}>
                        {host.label}
                      </span>
                      {active && (
                        <span className="text-[10px] uppercase tracking-[0.14em] text-indigo-300/80">
                          In use
                        </span>
                      )}
                      {status && (
                        <span
                          className="shrink-0 rounded-full"
                          title={STATUS_LABEL[status]}
                          style={{ width: '6px', height: '6px', background: STATUS_COLOR[status] }}
                        />
                      )}
                    </div>
                    <p className="text-[11.5px] text-slate-600 leading-relaxed" style={{ marginTop: '2px' }}>
                      {report ?? host.hint}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {existing && (
                      <button
                        onClick={() => handleTest(host)}
                        disabled={working}
                        className="text-[11.5px] text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
                        style={{ fontFamily: 'inherit' }}
                      >
                        {working ? '…' : 'Test'}
                      </button>
                    )}
                    {existing && (
                      <button
                        onClick={() => handleClear(host)}
                        disabled={working}
                        className="text-[11.5px] text-slate-600 hover:text-red-400 transition disabled:opacity-40"
                        style={{ fontFamily: 'inherit' }}
                      >
                        Clear
                      </button>
                    )}
                    <a
                      href={host.docs_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11.5px] text-slate-600 hover:text-indigo-300 transition-colors"
                      title={`${host.label} setup guide`}
                    >
                      Guide
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ marginTop: '10px' }}>
                  <input
                    type="text"
                    value={draft}
                    spellCheck={false}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    onChange={(e) => setDrafts((d) => ({ ...d, [host.key]: e.target.value }))}
                    onBlur={() => handleSaveUrl(host)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUrl(host) }}
                    placeholder={host.url_example}
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                  />
                  {dirty && (
                    <button
                      onClick={() => handleSaveUrl(host)}
                      disabled={working}
                      className="shrink-0 text-[12px] font-medium text-white rounded-xl transition disabled:opacity-40"
                      style={{
                        padding: '8px 14px',
                        background: 'rgb(79, 70, 229)',
                        fontFamily: 'inherit',
                        boxShadow: '0 0 0 1px rgba(99,102,241,0.35)',
                      }}
                    >
                      Save
                    </button>
                  )}
                </div>

                {probe?.detail && (
                  <p className="text-[11.5px] text-red-400/90 leading-relaxed" style={{ marginTop: '8px' }}>
                    {probe.detail}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && list && !list.generators.some((g) => g.is_active) && (
        <p className="text-[11.5px] text-slate-600 leading-relaxed">
          None selected — falling back to this instance's default,{' '}
          <span className="text-slate-500">{list.instance_default_url}</span>.
        </p>
      )}

      {error && <p className="text-[12px] text-red-400 leading-relaxed">{error}</p>}
    </section>
  )
}
