import type { Atmosphere } from '../types'

const CATALOG_URL = '/catalog/catalog.json'

export async function loadCatalog(): Promise<Atmosphere[]> {
  const res = await fetch(CATALOG_URL, { cache: 'no-cache' })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Could not load the soundscapes (${res.status}).`)
  const body = (await res.json()) as { soundscapes?: Atmosphere[] }
  return (body.soundscapes ?? []).filter((a) => (a.elements ?? []).length > 0)
}

export function hashOf(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function auraOf(seed: string): string {
  const hash = hashOf(seed)
  const ax = 10 + (hash % 60)
  const ay = 10 + ((hash >>> 8) % 50)
  const bx = 40 + ((hash >>> 16) % 55)
  const by = 45 + ((hash >>> 24) % 50)
  return [
    `radial-gradient(circle at ${ax}% ${ay}%, color-mix(in srgb, var(--color-accent) 26%, transparent), transparent 55%)`,
    `radial-gradient(circle at ${bx}% ${by}%, color-mix(in srgb, var(--color-brand) 22%, transparent), transparent 60%)`,
  ].join(', ')
}

export function barsOf(seed: string, count: number): number[] {
  let state = hashOf(seed) || 1
  const bars: number[] = []
  let level = 0.5
  for (let i = 0; i < count; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const step = ((state >>> 0) % 1000) / 1000 - 0.5
    level = Math.min(0.95, Math.max(0.12, level + step * 0.35))
    bars.push(level)
  }
  return bars
}

export function loopLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min loop` : `${seconds} s loop`
}
