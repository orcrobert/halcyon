const MARK_PATH =
  'M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z'

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * (46 / 48)}
      viewBox="0 0 48 46"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', filter: 'drop-shadow(0 0 14px color-mix(in srgb, var(--color-brand) 35%, transparent))' }}
    >
      <defs>
        <linearGradient id="halcyon-mark" x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--color-brand-light)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--color-brand)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-brand-deep)' }} />
        </linearGradient>
      </defs>
      <path d={MARK_PATH} fill="url(#halcyon-mark)" />
    </svg>
  )
}

export function Logo({ size = 22, tagline }: { size?: number; tagline?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-2.5">
        <Mark size={size} />
        <span
          className="text-wash/90"
          style={{
            fontSize: `${size * 0.86}px`,
            fontWeight: 300,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            paddingLeft: '1px',
          }}
        >
          Halcyon
        </span>
      </div>
      {tagline && (
        <p
          className="text-[15px] text-ink-dim leading-relaxed mx-auto"
          style={{ maxWidth: '400px', fontWeight: 300, letterSpacing: '-0.005em' }}
        >
          {tagline}
        </p>
      )}
    </div>
  )
}
