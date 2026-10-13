export const INPUT_CLASS =
  'w-full bg-surface-sunken border border-line rounded-xl text-ink placeholder:text-ink-ghost text-[13.5px] outline-none focus:border-accent/45 transition-colors'
export const INPUT_STYLE: React.CSSProperties = { padding: '11px 13px', fontFamily: 'inherit' }
export const LABEL_CLASS = 'text-[10px] uppercase tracking-[0.18em] text-ink-faint font-semibold'
export const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--color-accent-deep)',
  fontFamily: 'inherit',
  boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent), 0 6px 18px color-mix(in srgb, var(--color-accent) 20%, transparent)',
}
export const AVATAR_STYLE: React.CSSProperties = {
  background: 'linear-gradient(150deg, color-mix(in srgb, var(--color-accent) 20%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))',
  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
}

export function initials(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]).join('')
  return (letters || source[0] || '?').toUpperCase()
}
