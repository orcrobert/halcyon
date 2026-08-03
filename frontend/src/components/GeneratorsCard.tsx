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
  GeneratorKind,
  GeneratorList,
  GeneratorProbe,
  GeneratorStatus,
} from '../types'

const INPUT_CLASS =
  'w-full bg-[#0b0c15] border border-[#1e2035] rounded-xl text-slate-200 placeholder:text-slate-700 text-[13.5px] outline-none focus:border-indigo-500/45 transition-colors'
const INPUT_STYLE: React.CSSProperties = { padding: '11px 13px', fontFamily: 'inherit' }
const LABEL_CLASS = 'text-[10px] uppercase tracking-[0.18em] text-slate-600 font-semibold'

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

function describe(generator: Generator): string {
  const reported = generator.reported
  if (!reported) return generator.url
  const models = [reported.audiogen_model, reported.musicgen_model]
    .filter(Boolean)
    .map((m) => (m as string).split('/').pop())
  if (!models.length) return generator.url
  return `${models.join(' · ')}${reported.duration ? ` · ${reported.duration}s` : ''}`
}

export function GeneratorsCard() {
  const [list, setList] = useState<GeneratorList | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probes, setProbes] = useState<Record<number, GeneratorProbe>>({})
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<GeneratorKind>('colab')

  useEffect(() => {
    let cancelled = false
    listGenerators()
      .then((res) => { if (!cancelled) setList(res) })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const host = list?.kinds.find((k) => k.key === kind)

  async function run<T>(key: number | 'new', action: () => Promise<T>): Promise<T | null> {
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

  async function handleAdd() {
    if (!name.trim() || !url.trim()) return
    const next = await run('new', () =>
      createGenerator({ name: name.trim(), url: url.trim(), kind }),
    )
    if (!next) return
    setList(next)
    setName('')
    setUrl('')
    setAdding(false)
  }

  async function handleActivate(id: number) {
    const next = await run(id, () => activateGenerator(id))
    if (next) setList(next)
  }

  async function handleTest(id: number) {
    const result = await run(id, () => testGenerator(id))
    if (!result) return
    setProbes((p) => ({ ...p, [id]: result }))
    const refreshed = await listGenerators().catch(() => null)
    if (refreshed) setList(refreshed)
  }

  async function handleDelete(id: number) {
    const next = await run(id, () => deleteGenerator(id))
    if (next) {
      setList(next)
      setProbes((p) => {
        const copy = { ...p }
        delete copy[id]
        return copy
      })
    }
  }

  async function handleRepoint(generator: Generator, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === generator.url) return
    const next = await run(generator.id, () =>
      updateGenerator(generator.id, { url: trimmed }),
    )
    if (next) setList(next)
  }

  return (
    <section
      className="rounded-2xl border border-[#1a1b2a] bg-[#0d0e18] flex flex-col gap-4"
      style={{ padding: '22px', boxShadow: '0 18px 40px rgba(0,0,0,0.30)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-200 tracking-tight">Generators</h2>
          <p className="text-[11.5px] text-slate-600 leading-relaxed" style={{ marginTop: '4px' }}>
            The GPU services that synthesise your audio. Save as many as you like and switch
            with one click.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 text-[11.5px] text-indigo-300 hover:text-indigo-200 transition-colors"
            style={{ fontFamily: 'inherit' }}
          >
            + Add
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-xl animate-pulse" style={{ height: '72px', background: 'rgba(255,255,255,0.022)' }} />
      )}

      {!loading && list && list.generators.length === 0 && !adding && (
        <p className="text-[12px] text-slate-600 leading-relaxed">
          None saved — falling back to this instance's default,{' '}
          <span className="text-slate-500">{list.instance_default_url}</span>.
        </p>
      )}

      {!loading && list && list.generators.length > 0 && (
        <div className="flex flex-col gap-2">
          {list.generators.map((generator) => {
            const probe = probes[generator.id]
            const status = probe?.status ?? generator.last_status
            return (
              <div
                key={generator.id}
                className="rounded-xl border transition-colors"
                style={{
                  padding: '13px 14px',
                  borderColor: generator.is_active ? 'rgba(99,102,241,0.35)' : '#191a27',
                  background: generator.is_active ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.014)',
                }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleActivate(generator.id)}
                    disabled={generator.is_active || busy !== null}
                    aria-label={`Use ${generator.name}`}
                    className="shrink-0 rounded-full border transition disabled:cursor-default"
                    style={{
                      width: '15px',
                      height: '15px',
                      borderColor: generator.is_active ? 'rgb(99,102,241)' : '#2a2c3f',
                      background: generator.is_active
                        ? 'radial-gradient(circle, rgb(129,140,248) 0%, rgb(79,70,229) 60%, transparent 62%)'
                        : 'transparent',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-200 truncate">
                        {generator.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
                        {list.kinds.find((k) => k.key === generator.kind)?.label ?? generator.kind}
                      </span>
                      {status && (
                        <span
                          className="shrink-0 rounded-full"
                          title={STATUS_LABEL[status]}
                          style={{ width: '6px', height: '6px', background: STATUS_COLOR[status] }}
                        />
                      )}
                    </div>
                    <p className="text-[11.5px] text-slate-600 truncate" style={{ marginTop: '2px' }}>
                      {describe(generator)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => handleTest(generator.id)}
                      disabled={busy !== null}
                      className="text-[11.5px] text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
                      style={{ fontFamily: 'inherit' }}
                    >
                      {busy === generator.id ? '…' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleDelete(generator.id)}
                      disabled={busy !== null}
                      className="text-[11.5px] text-slate-600 hover:text-red-400 transition disabled:opacity-40"
                      style={{ fontFamily: 'inherit' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {generator.kind === 'colab' && (
                  <input
                    type="text"
                    defaultValue={generator.url}
                    spellCheck={false}
                    autoComplete="off"
                    onBlur={(e) => handleRepoint(generator, e.target.value)}
                    placeholder="Paste this session's ngrok URL"
                    className={`${INPUT_CLASS} text-[12px]`}
                    style={{ ...INPUT_STYLE, padding: '8px 11px', marginTop: '10px' }}
                  />
                )}

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

      {adding && list && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#191a27]" style={{ padding: '14px' }}>
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Host</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as GeneratorKind)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            >
              {list.kinds.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </label>

          {host && (
            <p className="text-[11.5px] text-slate-600 leading-relaxed">
              {host.hint}{' '}
              <a
                href={host.docs_url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400/80 hover:text-indigo-300 transition-colors"
              >
                Setup guide
              </a>
            </p>
          )}

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={host?.label ?? 'My generator'}
              spellCheck={false}
              autoComplete="off"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>URL</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={host?.url_example ?? ''}
              spellCheck={false}
              autoComplete="off"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setAdding(false); setName(''); setUrl('') }}
              className="text-[12px] text-slate-500 hover:text-slate-300 transition-colors"
              style={{ fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={busy !== null || !name.trim() || !url.trim()}
              className="text-[12.5px] font-medium text-white rounded-xl transition disabled:opacity-40"
              style={{
                padding: '8px 16px',
                background: 'rgb(79, 70, 229)',
                fontFamily: 'inherit',
                boxShadow: '0 0 0 1px rgba(99,102,241,0.35)',
              }}
            >
              {busy === 'new' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-red-400 leading-relaxed">{error}</p>}
    </section>
  )
}
