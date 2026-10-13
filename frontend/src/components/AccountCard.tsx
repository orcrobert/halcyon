import { Toggle } from './Toggle'
import { INPUT_CLASS, INPUT_STYLE, LABEL_CLASS } from './accountStyles'

export function Card({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
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

export function Field({
  label,
  name,
  value,
  placeholder,
  suggestions,
  type = 'text',
  onChange,
}: {
  label: string
  name: string
  value: string
  placeholder: string
  suggestions?: string[]
  type?: 'text' | 'email' | 'password'
  onChange: (value: string) => void
}) {
  const listId = suggestions?.length ? `${name}-suggestions` : undefined
  return (
    <label className="flex flex-col gap-2 min-w-0">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type={type}
        name={name}
        list={listId}
        spellCheck={false}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        data-lpignore="true"
        data-1p-ignore
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
        style={INPUT_STYLE}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions?.map((model) => <option key={model} value={model} />)}
        </datalist>
      )}
    </label>
  )
}

export function SwitchRow({
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
