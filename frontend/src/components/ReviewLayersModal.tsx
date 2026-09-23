import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { extractErrors } from '../api/errors'
import type { Atmosphere, DecompositionElement, EventFrequency, LayerRole } from '../types'

interface Props {
  atmosphere: Atmosphere
  onConfirm: (elements: DecompositionElement[]) => Promise<void>
  onRevise: (feedback: string, elements: DecompositionElement[]) => Promise<DecompositionElement[]>
  onDiscard: () => Promise<void>
}

type Mode = 'edit' | 'ask'
type Busy = 'confirm' | 'revise' | 'discard' | null

interface DraftLayer extends DecompositionElement {
  key: number
}

const MAX_LAYERS = 12
const HIGHLIGHT_MS = 2600

const ROLES: { key: LayerRole; label: string; hint: string }[] = [
  { key: 'bed', label: 'Bed', hint: 'Steady, noise-like, loops' },
  { key: 'texture', label: 'Texture', hint: 'Evolves over time, loops' },
  { key: 'event', label: 'Event', hint: 'One short sound, now and then' },
]

const FREQUENCIES: { key: EventFrequency; label: string }[] = [
  { key: 'rare', label: 'Rare' },
  { key: 'occasional', label: 'Occasional' },
  { key: 'frequent', label: 'Frequent' },
]

const SUGGESTIONS = [
  'Make it warmer and closer',
  'Fewer layers, more space',
  'More gentle movement',
  'Remove the music',
]

let nextKey = 1

function toDraft(elements: DecompositionElement[]): DraftLayer[] {
  return elements.map((element) => ({
    label: element.label,
    type: element.type,
    role: element.role,
    frequency: element.role === 'event' ? element.frequency ?? 'occasional' : null,
    prompt: element.prompt,
    key: nextKey++,
  }))
}

function toPayload(layers: DraftLayer[]): DecompositionElement[] {
  return layers.map(({ label, type, role, frequency, prompt }) => ({
    label: label.trim(),
    type,
    role,
    frequency: role === 'event' ? frequency ?? 'occasional' : null,
    prompt: prompt.trim(),
  }))
}

function sameLayer(a: DecompositionElement, b: DecompositionElement): boolean {
  return (
    a.label === b.label &&
    a.type === b.type &&
    a.role === b.role &&
    (a.frequency ?? null) === (b.frequency ?? null) &&
    a.prompt === b.prompt
  )
}

function problemWith(layers: DraftLayer[]): string | null {
  if (layers.length === 0) return 'Keep at least one layer.'
  if (layers.some((l) => !l.label.trim())) return 'Every layer needs a name.'
  if (layers.some((l) => !l.prompt.trim())) return 'Every layer needs a prompt.'
  const names = layers.map((l) => l.label.trim().toLowerCase())
  if (new Set(names).size !== names.length) return 'Two layers share a name.'
  return null
}

export function ReviewLayersModal({ atmosphere, onConfirm, onRevise, onDiscard }: Props) {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<Mode>('edit')
  const [layers, setLayers] = useState<DraftLayer[]>(() => toDraft(atmosphere.decomposition ?? []))
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLTextAreaElement>(null)

  const allowEvents = atmosphere.use_events
  const problem = problemWith(layers)
  const locked = busy !== null

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (highlighted.size === 0) return
    const t = setTimeout(() => setHighlighted(new Set()), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlighted])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), HIGHLIGHT_MS + 1400)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (mode === 'ask') feedbackRef.current?.focus()
    bodyRef.current?.scrollTo({ top: 0 })
  }, [mode])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || locked) return
      setConfirmingDiscard((c) => !c)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [locked])

  const update = useCallback((key: number, patch: Partial<DecompositionElement>) => {
    setLayers((prev) => prev.map((layer) => {
      if (layer.key !== key) return layer
      const next = { ...layer, ...patch }
      if (next.type === 'music' && next.role === 'event') next.role = 'texture'
      next.frequency = next.role === 'event' ? next.frequency ?? 'occasional' : null
      return next
    }))
    setError(null)
  }, [])

  const remove = useCallback((key: number) => {
    setLayers((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
    setError(null)
  }, [])

  const add = useCallback(() => {
    const key = nextKey++
    setLayers((prev) => (prev.length >= MAX_LAYERS
      ? prev
      : [...prev, { key, label: '', type: 'sound', role: 'texture', frequency: null, prompt: '' }]))
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
      document.getElementById(`layer-label-${key}`)?.focus()
    })
  }, [])

  async function handleConfirm() {
    if (problem || locked) return
    setBusy('confirm')
    setError(null)
    try {
      await onConfirm(toPayload(layers))
    } catch (e) {
      setError(extractErrors(e).message)
      setBusy(null)
    }
  }

  async function handleRevise() {
    const note = feedback.trim()
    if (!note || locked || problem) return
    setBusy('revise')
    setError(null)
    try {
      const before = toPayload(layers)
      const revised = await onRevise(note, before)
      const fresh = toDraft(revised)
      const after = toPayload(fresh)
      const changed = new Set(
        fresh.filter((_, i) => !before.some((old) => sameLayer(old, after[i]))).map((l) => l.key),
      )
      const removed = before.length - (fresh.length - changed.size)
      setLayers(fresh)
      setHighlighted(changed)
      setNotice(describeRevision(changed.size, removed))
      setFeedback('')
      setMode('edit')
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDiscard() {
    setBusy('discard')
    setError(null)
    try {
      await onDiscard()
    } catch (e) {
      setError(extractErrors(e).message)
      setBusy(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6"
      style={{ zIndex: 9998 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-layers-title"
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'color-mix(in srgb, var(--color-shade) 55%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />

      <div
        className="relative w-full flex flex-col overflow-hidden h-[100dvh] sm:h-auto sm:max-h-[min(88vh,880px)] sm:max-w-[760px] sm:rounded-[20px]"
        style={{
          background: 'color-mix(in srgb, var(--color-surface-sunken) 90%, transparent)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
          boxShadow: '0 40px 80px color-mix(in srgb, var(--color-shade) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 8%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 4%, transparent)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.985)',
          transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <header
          className="flex flex-col gap-4 shrink-0"
          style={{
            padding: 'max(18px, env(safe-area-inset-top)) 20px 16px',
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-1.5">
              <span className="text-[9.5px] uppercase tracking-[0.28em] text-accent-bright/75 font-medium">
                Review layers
              </span>
              <h2
                id="review-layers-title"
                className="text-[18px] sm:text-[20px] text-ink leading-tight truncate"
                style={{ fontWeight: 400, letterSpacing: '-0.01em' }}
              >
                {atmosphere.title ?? 'Your scene'}
              </h2>
              <p className="text-[12px] text-ink-muted italic line-clamp-2 leading-relaxed" style={{ fontWeight: 300 }}>
                &ldquo;{atmosphere.prompt}&rdquo;
              </p>
            </div>
            <button
              onClick={() => setConfirmingDiscard(true)}
              disabled={locked}
              aria-label="Close and discard"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-ink-soft transition disabled:opacity-40"
              style={{
                border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          <ModeSwitch mode={mode} onChange={setMode} disabled={locked} />
        </header>

        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ padding: '18px 20px 22px' }}>
          {notice && mode === 'edit' && (
            <div
              className="flex items-center gap-2 rounded-xl text-[12px] text-accent-soft"
              style={{
                padding: '9px 12px',
                marginBottom: 14,
                background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
                animation: 'fade-in 0.3s ease-out',
              }}
            >
              <SparkIcon />
              {notice}
            </div>
          )}

          {mode === 'edit' ? (
            <div className="flex flex-col gap-3">
              {layers.map((layer, index) => (
                <LayerCard
                  key={layer.key}
                  layer={layer}
                  index={index}
                  allowEvents={allowEvents}
                  highlighted={highlighted.has(layer.key)}
                  canRemove={layers.length > 1}
                  disabled={locked}
                  onChange={(patch) => update(layer.key, patch)}
                  onRemove={() => remove(layer.key)}
                />
              ))}

              <button
                onClick={add}
                disabled={locked || layers.length >= MAX_LAYERS}
                className="flex items-center justify-center gap-2 rounded-2xl text-[12px] text-ink-dim hover:text-ink-soft transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  padding: '14px',
                  border: '1px dashed color-mix(in srgb, var(--color-wash) 14%, transparent)',
                  background: 'color-mix(in srgb, var(--color-wash) 1.5%, transparent)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {layers.length >= MAX_LAYERS ? `${MAX_LAYERS} layers is the limit` : 'Add layer'}
              </button>
            </div>
          ) : (
            <AskPanel
              layers={layers}
              feedback={feedback}
              busy={busy === 'revise'}
              disabled={locked}
              feedbackRef={feedbackRef}
              onFeedback={setFeedback}
              onSubmit={handleRevise}
            />
          )}
        </div>

        <footer
          className="shrink-0 flex flex-col gap-2"
          style={{
            padding: '12px 20px max(14px, env(safe-area-inset-bottom))',
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
            background: 'color-mix(in srgb, var(--color-surface-sunken) 60%, transparent)',
          }}
        >
          {(error || (problem && mode === 'edit')) && (
            <p className={`text-[11.5px] leading-snug ${error ? 'text-danger-soft' : 'text-ink-faint'}`}>
              {error ?? problem}
            </p>
          )}

          {confirmingDiscard ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ animation: 'fade-in 0.2s ease-out' }}>
              <div className="flex flex-col">
                <span className="text-[13px] text-danger-soft">Discard this scene?</span>
                <span className="text-[11px] text-ink-faint">Nothing has been generated yet. It will not appear in your history.</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmingDiscard(false)}
                  disabled={locked}
                  className="text-[12px] text-ink-dim hover:text-ink rounded-lg transition flex-1 sm:flex-none"
                  style={{ padding: '10px 14px' }}
                >
                  Keep editing
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={locked}
                  className="text-[12px] font-semibold text-wash rounded-lg transition flex-1 sm:flex-none disabled:opacity-60"
                  style={{
                    padding: '10px 16px',
                    background: 'var(--color-danger-deep)',
                    boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-danger) 35%, transparent)',
                  }}
                >
                  {busy === 'discard' ? 'Discarding…' : 'Discard'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setConfirmingDiscard(true)}
                disabled={locked}
                className="text-[12px] text-ink-faint hover:text-danger-soft transition rounded-lg disabled:opacity-40"
                style={{ padding: '10px 4px' }}
              >
                Discard
              </button>
              <button
                onClick={handleConfirm}
                disabled={locked || problem !== null}
                className="flex items-center justify-center gap-2 rounded-xl text-[12.5px] font-medium transition disabled:cursor-not-allowed"
                style={{
                  padding: '11px 18px',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                  background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                  color: 'var(--color-accent-soft)',
                  opacity: locked || problem ? 0.5 : 1,
                  boxShadow: '0 0 18px color-mix(in srgb, var(--color-accent) 18%, transparent)',
                }}
              >
                {busy === 'confirm' ? <Spinner /> : <PlayIcon />}
                {busy === 'confirm'
                  ? 'Starting…'
                  : `Generate ${layers.length} layer${layers.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function describeRevision(changed: number, removed: number): string {
  if (changed === 0 && removed <= 0) return 'The model kept every layer as it was.'
  const parts: string[] = []
  if (changed > 0) parts.push(`${changed} updated`)
  if (removed > 0) parts.push(`${removed} removed`)
  return `Revised: ${parts.join(', ')}. Check them below.`
}

function ModeSwitch({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  const options: { key: Mode; label: string; icon: React.ReactNode }[] = [
    { key: 'edit', label: 'Edit layers', icon: <PencilIcon /> },
    { key: 'ask', label: 'Ask the model', icon: <SparkIcon /> },
  ]
  return (
    <div
      role="tablist"
      className="relative grid grid-cols-2 w-full sm:w-auto sm:self-start rounded-full"
      style={{
        padding: 3,
        background: 'color-mix(in srgb, var(--color-wash) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          top: 3,
          bottom: 3,
          left: 3,
          width: 'calc(50% - 3px)',
          transform: mode === 'ask' ? 'translateX(100%)' : 'translateX(0)',
          transition: 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)',
          background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent), 0 4px 14px color-mix(in srgb, var(--color-accent) 16%, transparent)',
        }}
      />
      {options.map((option) => (
        <button
          key={option.key}
          role="tab"
          aria-selected={mode === option.key}
          disabled={disabled}
          onClick={() => onChange(option.key)}
          className={`relative flex items-center justify-center gap-2 rounded-full text-[12px] transition-colors sm:min-w-[150px] ${
            mode === option.key ? 'text-accent-soft' : 'text-ink-faint hover:text-ink-soft'
          }`}
          style={{ padding: '8px 16px' }}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface LayerCardProps {
  layer: DraftLayer
  index: number
  allowEvents: boolean
  highlighted: boolean
  canRemove: boolean
  disabled: boolean
  onChange: (patch: Partial<DecompositionElement>) => void
  onRemove: () => void
}

function LayerCard({ layer, index, allowEvents, highlighted, canRemove, disabled, onChange, onRemove }: LayerCardProps) {
  const role = ROLES.find((r) => r.key === layer.role) ?? ROLES[1]
  const tagColor = layer.role === 'event'
    ? 'var(--color-tag-event)'
    : layer.type === 'music' ? 'var(--color-tag-music)' : 'var(--color-tag-sound)'

  return (
    <section
      className="rounded-2xl flex flex-col gap-3"
      style={{
        padding: '14px 14px 12px',
        background: highlighted
          ? 'color-mix(in srgb, var(--color-accent) 7%, transparent)'
          : 'color-mix(in srgb, var(--color-wash) 2.5%, transparent)',
        border: `1px solid ${highlighted
          ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)'
          : 'color-mix(in srgb, var(--color-wash) 7%, transparent)'}`,
        transition: 'background 0.6s ease, border-color 0.6s ease',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10.5px] tabular-nums font-semibold"
          style={{
            color: tagColor,
            background: `color-mix(in srgb, ${tagColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${tagColor} 28%, transparent)`,
          }}
        >
          {index + 1}
        </span>
        <input
          id={`layer-label-${layer.key}`}
          value={layer.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={disabled}
          maxLength={80}
          placeholder="Layer name"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] font-semibold text-ink placeholder:text-ink-ghost placeholder:font-normal rounded-md focus:bg-surface-hover/40 transition-colors"
          style={{ padding: '4px 6px', margin: '0 -6px' }}
        />
        <button
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label={`Remove ${layer.label || 'layer'}`}
          title={canRemove ? 'Remove layer' : 'A scene needs at least one layer'}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-ghost hover:text-danger-bright hover:bg-danger/[0.08] transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-ghost"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          value={layer.type}
          disabled={disabled}
          options={[
            { key: 'sound', label: 'Sound' },
            { key: 'music', label: 'Music' },
          ]}
          onChange={(type) => onChange({ type })}
        />
        <Segmented
          value={layer.role}
          disabled={disabled}
          options={ROLES.map((r) => ({
            key: r.key,
            label: r.label,
            unavailable: r.key === 'event' && (layer.type === 'music' || !allowEvents),
          }))}
          onChange={(nextRole) => onChange({ role: nextRole })}
        />
        {layer.role === 'event' && (
          <Segmented
            value={layer.frequency ?? 'occasional'}
            disabled={disabled}
            options={FREQUENCIES}
            onChange={(frequency) => onChange({ frequency })}
          />
        )}
      </div>

      <AutoTextarea
        value={layer.prompt}
        disabled={disabled}
        onChange={(prompt) => onChange({ prompt })}
      />

      <p className="text-[10.5px] text-ink-ghost leading-snug">
        {role.hint}
        {layer.role !== 'event' && layer.type === 'music' && ' · music always evolves'}
        {layer.type === 'sound' && layer.role !== 'event' && !allowEvents && ' · events are off for this scene'}
      </p>
    </section>
  )
}

interface SegmentedOption<T extends string> {
  key: T
  label: string
  unavailable?: boolean
}

function Segmented<T extends string>({
  value, options, onChange, disabled,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled: boolean
}) {
  return (
    <div
      className="inline-flex rounded-lg"
      style={{
        padding: 2,
        background: 'color-mix(in srgb, var(--color-wash) 3.5%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-wash) 6%, transparent)',
      }}
    >
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled || option.unavailable}
            aria-pressed={active}
            onClick={() => onChange(option.key)}
            className={`rounded-md text-[11px] transition-colors disabled:cursor-not-allowed ${
              active ? 'text-ink-bright' : option.unavailable ? 'text-ink-whisper' : 'text-ink-faint hover:text-ink-soft'
            }`}
            style={{
              padding: '5px 10px',
              background: active ? 'color-mix(in srgb, var(--color-wash) 10%, transparent)' : 'transparent',
              boxShadow: active ? 'inset 0 1px 0 color-mix(in srgb, var(--color-wash) 6%, transparent)' : 'none',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function AutoTextarea({
  value, onChange, disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={2}
      maxLength={1000}
      placeholder="What the generator should render, e.g. steady rain on a window, close, soft"
      className="w-full resize-none outline-none rounded-xl text-[13px] text-ink-soft placeholder:text-ink-ghost leading-relaxed focus:border-accent/45 transition-colors"
      style={{
        padding: '10px 12px',
        fontWeight: 300,
        background: 'color-mix(in srgb, var(--color-shade) 18%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-wash) 6%, transparent)',
        overflow: 'hidden',
      }}
    />
  )
}

interface AskPanelProps {
  layers: DraftLayer[]
  feedback: string
  busy: boolean
  disabled: boolean
  feedbackRef: React.RefObject<HTMLTextAreaElement | null>
  onFeedback: (value: string) => void
  onSubmit: () => void
}

function AskPanel({ layers, feedback, busy, disabled, feedbackRef, onFeedback, onSubmit }: AskPanelProps) {
  const trimmed = feedback.trim()
  const problem = problemWith(layers)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold">
          Current layers
        </span>
        <div className="flex flex-wrap gap-1.5">
          {layers.map((layer) => (
            <span
              key={layer.key}
              className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] text-ink-soft"
              style={{
                padding: '5px 10px',
                background: 'color-mix(in srgb, var(--color-wash) 4%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: layer.role === 'event'
                    ? 'var(--color-tag-event)'
                    : layer.type === 'music' ? 'var(--color-tag-music)' : 'var(--color-tag-sound)',
                }}
              />
              {layer.label || 'Untitled'}
              <span className="text-ink-ghost">{layer.role}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="review-feedback" className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold">
          What would you change?
        </label>
        <div
          className="rounded-2xl focus-within:border-accent/45 transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--color-shade) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-wash) 8%, transparent)',
          }}
        >
          <textarea
            id="review-feedback"
            ref={feedbackRef}
            value={feedback}
            onChange={(e) => onFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
            }}
            disabled={disabled}
            rows={5}
            maxLength={2000}
            placeholder="The drone feels too bright, and I'd like distant thunder now and then…"
            className="w-full resize-none bg-transparent outline-none text-[13.5px] text-ink-soft placeholder:text-ink-ghost leading-relaxed"
            style={{ padding: '14px 16px 8px', fontWeight: 300 }}
          />
          <div className="flex items-center justify-between gap-3" style={{ padding: '6px 8px 8px 16px' }}>
            <span className="hidden sm:inline text-[10px] text-ink-whisper tracking-wide">⌘/Ctrl + Enter</span>
            <button
              onClick={onSubmit}
              disabled={disabled || !trimmed || problem !== null}
              className="ml-auto flex items-center gap-2 rounded-xl text-[12px] font-medium transition disabled:cursor-not-allowed"
              style={{
                padding: '8px 14px',
                border: '1px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                color: 'var(--color-accent-soft)',
                opacity: disabled || !trimmed || problem ? 0.45 : 1,
              }}
            >
              {busy ? <Spinner /> : <SparkIcon />}
              {busy ? 'Revising…' : 'Revise layers'}
            </button>
          </div>
        </div>
        {problem && (
          <p className="text-[11px] text-ink-faint">Fix the layers in Edit first: {problem.toLowerCase()}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-ghost font-semibold">Try</span>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                onFeedback(trimmed ? `${trimmed}. ${suggestion}` : suggestion)
                feedbackRef.current?.focus()
              }}
              disabled={disabled}
              className="rounded-full text-[11.5px] text-ink-dim hover:text-ink-soft transition"
              style={{
                padding: '6px 11px',
                border: '1px dashed color-mix(in srgb, var(--color-wash) 12%, transparent)',
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-ink-ghost leading-relaxed">
        The model rewrites only the layers your note is about and leaves the rest untouched. Your manual edits
        are sent along, and you land back in Edit to check the result before anything is generated.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="w-3 h-3 rounded-full animate-spin"
      style={{
        border: '1.5px solid color-mix(in srgb, currentColor 30%, transparent)',
        borderTopColor: 'currentColor',
      }}
    />
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  )
}
