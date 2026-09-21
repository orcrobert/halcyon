import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { alpha } from '../theme'

type Mode = 'write' | 'preview'

interface Props {
  open: boolean
  value: string
  defaultValue: string
  saving: boolean
  error: string | null
  onSave: (value: string) => void
  onClose: () => void
}

interface Action {
  key: string
  label: string
  title: string
  prefix: string
  suffix?: string
  block?: boolean
}

const ACTIONS: Action[] = [
  { key: 'h1', label: 'H1', title: 'Heading 1', prefix: '# ', block: true },
  { key: 'h2', label: 'H2', title: 'Heading 2', prefix: '## ', block: true },
  { key: 'bold', label: 'B', title: 'Bold', prefix: '**', suffix: '**' },
  { key: 'italic', label: 'I', title: 'Italic', prefix: '_', suffix: '_' },
  { key: 'code', label: '<>', title: 'Inline code', prefix: '`', suffix: '`' },
  { key: 'list', label: '••', title: 'Bullet list', prefix: '- ', block: true },
  { key: 'quote', label: '❝', title: 'Quote', prefix: '> ', block: true },
  { key: 'rule', label: '—', title: 'Divider', prefix: '\n---\n' },
]

const ACCENT = 'var(--color-accent-bright)'

function applyAction(text: string, start: number, end: number, action: Action) {
  if (action.block) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const lineEnd = end === start ? start : end
    const block = text.slice(lineStart, lineEnd)
    const prefixed = block
      .split('\n')
      .map((line) => (line.startsWith(action.prefix) ? line : action.prefix + line))
      .join('\n')
    return {
      next: text.slice(0, lineStart) + prefixed + text.slice(lineEnd),
      caret: lineStart + prefixed.length,
    }
  }

  const selected = text.slice(start, end)
  const wrapped = action.prefix + selected + (action.suffix ?? '')
  return {
    next: text.slice(0, start) + wrapped + text.slice(end),
    caret: start + action.prefix.length + selected.length,
  }
}

export function PromptEditorModal({
  open, value, defaultValue, saving, error, onSave, onClose,
}: Props) {
  const [draft, setDraft] = useState(value)
  const [mode, setMode] = useState<Mode>('write')
  const [visible, setVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) { setVisible(false); return }
    setDraft(value)
    setMode('write')
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const format = useCallback((action: Action) => {
    const field = textareaRef.current
    if (!field) return
    const { next, caret } = applyAction(field.value, field.selectionStart, field.selectionEnd, action)
    setDraft(next)
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(caret, caret)
    })
  }, [])

  const isDefault = draft.trim() === defaultValue.trim()
  const dirty = draft.trim() !== value.trim()
  const words = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft])

  if (!open && !visible) return null

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'color-mix(in srgb, var(--color-shade) 55%, transparent)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, pointerEvents: 'none',
      }}>
        <div data-frosted style={{
          width: 'min(1080px, 100%)', height: 'min(760px, 100%)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.98)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          pointerEvents: visible ? 'auto' : 'none',
          background: 'color-mix(in srgb, var(--color-surface-sunken) 86%, transparent)',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--color-wash) 9%, transparent)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 60px 120px color-mix(in srgb, var(--color-shade) 80%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 10%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-wash) 6%, transparent)',
          display: 'flex', flexDirection: 'column',
        }}>

          <div style={{
            padding: '16px 22px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                fontSize: 9, color: 'var(--color-ink-trace)', fontFamily: 'inherit',
                letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                Decomposer Prompt
              </span>
              <span style={{
                fontSize: 9, fontFamily: 'inherit', letterSpacing: '0.08em',
                padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                background: isDefault ? 'color-mix(in srgb, var(--color-wash) 4%, transparent)' : alpha(ACCENT, 8),
                border: isDefault ? '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)' : `1px solid ${alpha(ACCENT, 19)}`,
                color: isDefault ? 'var(--color-ink-faint)' : ACCENT,
              }}>
                {isDefault ? 'DEFAULT' : 'CUSTOM'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', padding: 3, borderRadius: 10, gap: 2,
                background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-wash) 6%, transparent)',
              }}>
                {(['write', 'preview'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.08em',
                      padding: '4px 14px', borderRadius: 7, cursor: 'pointer',
                      border: '1px solid transparent',
                      background: mode === m ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent',
                      color: mode === m ? ACCENT : 'var(--color-ink-faint)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m === 'write' ? 'Markdown' : 'Formatted'}
                  </button>
                ))}
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                  background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                  color: 'var(--color-ink-ghost)', fontSize: 12, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {mode === 'write' && (
            <div style={{
              padding: '8px 18px', flexShrink: 0, display: 'flex', gap: 4,
              borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 4%, transparent)',
            }}>
              {ACTIONS.map((action) => (
                <button
                  key={action.key}
                  title={action.title}
                  onClick={() => format(action)}
                  style={{
                    minWidth: 30, height: 26, padding: '0 8px', borderRadius: 8,
                    border: '1px solid color-mix(in srgb, var(--color-wash) 6%, transparent)',
                    background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)',
                    color: 'var(--color-ink-muted)', fontSize: 10, cursor: 'pointer',
                    fontFamily: action.key === 'code' ? 'var(--font-mono)' : 'inherit',
                    fontWeight: action.key === 'bold' ? 700 : 400,
                    fontStyle: action.key === 'italic' ? 'italic' : 'normal',
                    transition: 'all 0.15s',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {mode === 'write' ? (
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, resize: 'none', outline: 'none', border: 'none',
                  background: 'transparent', color: 'var(--color-ink-soft)',
                  padding: '20px 26px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5, lineHeight: 1.75, tabSize: 2,
                }}
              />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px 30px' }}>
                <MarkdownPreview source={draft} />
              </div>
            )}
          </div>

          <div style={{
            padding: '12px 22px', flexShrink: 0,
            borderTop: '1px solid color-mix(in srgb, var(--color-wash) 4%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span style={{ fontSize: 9, color: 'var(--color-ink-whisper)', fontFamily: 'inherit', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                {draft.length.toLocaleString()} chars · {words.toLocaleString()} words
              </span>
              <button
                onClick={() => setDraft(defaultValue)}
                disabled={isDefault}
                style={{
                  fontSize: 11, fontFamily: 'inherit', cursor: isDefault ? 'default' : 'pointer',
                  background: 'none', border: 'none', padding: 0,
                  color: isDefault ? 'var(--color-ink-whisper)' : 'var(--color-ink-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                Restore default
              </button>
              {error && (
                <span style={{ fontSize: 11, color: 'var(--color-danger-bright)', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {error}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  padding: '9px 16px', borderRadius: 10,
                  border: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)',
                  background: 'color-mix(in srgb, var(--color-wash) 3%, transparent)', color: 'var(--color-ink-muted)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(draft)}
                disabled={saving || !dirty}
                style={{
                  fontSize: 12.5, fontFamily: 'inherit',
                  cursor: saving || !dirty ? 'default' : 'pointer',
                  padding: '9px 20px', borderRadius: 10, border: 'none',
                  background: 'var(--color-accent-deep)', color: 'var(--color-wash)',
                  opacity: saving || !dirty ? 0.45 : 1,
                  boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent), 0 6px 18px color-mix(in srgb, var(--color-accent) 20%, transparent)',
                  transition: 'opacity 0.15s',
                }}
              >
                {saving ? 'Saving…' : 'Save prompt'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

function MarkdownPreview({ source }: { source: string }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: 'var(--color-ink-dim)', fontSize: 13.5, lineHeight: 1.75 }}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: 19, color: 'var(--color-ink)', fontWeight: 600, letterSpacing: '-0.01em', margin: '26px 0 10px' }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 15.5, color: 'var(--color-ink-soft)', fontWeight: 600, margin: '24px 0 8px' }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 13.5, color: 'var(--color-ink-soft)', fontWeight: 600, letterSpacing: '0.02em', margin: '20px 0 6px' }}>{children}</h3>
          ),
          p: ({ children }) => <p style={{ margin: '10px 0' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '10px 0', paddingLeft: 20, listStyle: 'disc' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '10px 0', paddingLeft: 22, listStyle: 'decimal' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
          strong: ({ children }) => <strong style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: 'var(--color-accent-soft)' }}>{children}</em>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: ACCENT, textDecoration: 'underline' }}>{children}</a>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid color-mix(in srgb, var(--color-wash) 7%, transparent)', margin: '22px 0' }} />,
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '12px 0', padding: '4px 0 4px 14px',
              borderLeft: `2px solid ${alpha(ACCENT, 33)}`, color: 'var(--color-ink-muted)',
            }}>
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12, padding: '1px 5px', borderRadius: 5,
              background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent-pale)',
            }}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre style={{
              margin: '12px 0', padding: 14, borderRadius: 12, overflowX: 'auto',
              background: 'color-mix(in srgb, var(--color-shade) 35%, transparent)', border: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--color-ink-soft)',
            }}>
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{
              textAlign: 'left', padding: '6px 10px', color: 'var(--color-ink-soft)',
              borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 10%, transparent)', fontWeight: 600,
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ padding: '6px 10px', borderBottom: '1px solid color-mix(in srgb, var(--color-wash) 5%, transparent)' }}>{children}</td>
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
