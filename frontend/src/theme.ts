export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
