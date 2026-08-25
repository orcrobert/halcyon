export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

export function token(name: string): string {
  const probe = document.createElement('span')
  probe.style.cssText = `color: var(${name}); position: absolute; visibility: hidden`
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved
}
