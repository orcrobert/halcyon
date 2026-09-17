export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 30,
        height: 17,
        borderRadius: 999,
        flexShrink: 0,
        position: 'relative',
        background: on
          ? 'var(--color-accent)'
          : 'color-mix(in srgb, var(--color-wash) 12%, transparent)',
        transition: 'background 0.18s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 15 : 2,
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: 'var(--color-wash)',
          transition: 'left 0.18s ease',
        }}
      />
    </span>
  )
}
