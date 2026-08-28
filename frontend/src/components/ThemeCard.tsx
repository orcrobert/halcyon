import { useState } from 'react'
import { THEMES, themeVariables } from '../themes'
import type { ThemeFamily, ThemeSpec } from '../themes'

interface Props {
  value: string
  onChange: (id: string) => void
}

const GROUPS: { family: ThemeFamily; label: string }[] = [
  { family: 'signature', label: 'Signature' },
  { family: 'classic', label: 'Classic' },
]

function Swatch({ spec, selected, onSelect }: { spec: ThemeSpec; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  const vars = themeVariables(spec)

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex flex-col gap-2.5 rounded-xl text-left transition-colors"
      style={{
        padding: '10px',
        background: vars['--surface-1'],
        border: `1px solid ${selected ? 'var(--color-accent)' : hovered ? 'var(--color-line-active)' : 'var(--color-line)'}`,
        boxShadow: selected ? '0 0 0 1px var(--color-accent)' : 'none',
        fontFamily: 'inherit',
      }}
    >
      <div className="flex items-center gap-1.5">
        {[vars['--accent-1'], vars['--brand-1'], vars['--ink-6'], vars['--surface-6']].map((color, i) => (
          <span
            key={i}
            style={{
              width: i === 0 ? '18px' : '11px',
              height: '11px',
              borderRadius: '999px',
              background: color,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium leading-none" style={{ color: vars['--ink-8'] }}>
          {spec.name}
        </span>
        <span className="text-[10px] leading-snug" style={{ color: vars['--ink-5'] }}>
          {spec.blurb}
        </span>
      </div>
    </button>
  )
}

export function ThemeCard({ value, onChange }: Props) {
  return (
    <section
      className="rounded-2xl border border-surface-hover bg-surface flex flex-col gap-4"
      style={{ padding: '22px', boxShadow: '0 18px 40px color-mix(in srgb, var(--color-shade) 30%, transparent)' }}
    >
      <div>
        <h2 className="text-[14px] font-semibold text-ink tracking-tight">Theme</h2>
        <p className="text-[11.5px] text-ink-faint leading-relaxed" style={{ marginTop: '4px' }}>
          Applies as you pick. Every colour in Halcyon follows.
        </p>
      </div>

      {GROUPS.map(({ family, label }) => (
        <div key={family} className="flex flex-col gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold">{label}</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
            }}
          >
            {THEMES.filter((theme) => theme.family === family).map((theme) => (
              <Swatch
                key={theme.id}
                spec={theme}
                selected={theme.id === value}
                onSelect={() => onChange(theme.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
