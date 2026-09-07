export const SCHEDULER_TICK_MS = 100
export const LOOKAHEAD_S = 0.25
export const LOOKAHEAD_HIDDEN_S = 2
export const EVENT_MAX_VOICES = 2
export const EVENT_GAIN_JITTER_DB = 2
export const EVENT_RATE_JITTER = 0.04
export const EVENT_PAN_JITTER = 0.3
export const EVENT_FIRST_TRIGGER_MIN_S = 0.5
export const EVENT_BACKLOG_RESET_S = 0.1
export const EXPORT_SEED = 0x5eed

export const DEFAULT_INTERVAL_MIN_S = 8
export const DEFAULT_INTERVAL_MAX_S = 25

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function nextInterval(
  rng: () => number,
  minS: number,
  maxS: number,
  floorS: number,
): number {
  const low = Math.max(minS, floorS)
  const high = Math.max(maxS, low)
  return low + rng() * (high - low)
}

export function firstTriggerDelay(
  rng: () => number,
  minS: number,
  floorS: number,
): number {
  const low = Math.max(minS, floorS)
  return (
    EVENT_FIRST_TRIGGER_MIN_S +
    rng() * Math.max(0, low - EVENT_FIRST_TRIGGER_MIN_S)
  )
}

export interface TriggerShape {
  gainDb: number
  rate: number
  panOffset: number
}

export interface Trigger extends TriggerShape {
  at: number
}

export function nextShape(rng: () => number): TriggerShape {
  return {
    gainDb: (rng() * 2 - 1) * EVENT_GAIN_JITTER_DB,
    rate: 1 + (rng() * 2 - 1) * EVENT_RATE_JITTER,
    panOffset: (rng() * 2 - 1) * EVENT_PAN_JITTER,
  }
}

export function planTriggers(
  rng: () => number,
  seconds: number,
  minS: number,
  maxS: number,
  floorS: number,
): Trigger[] {
  const triggers: Trigger[] = []
  let at = firstTriggerDelay(rng, minS, floorS)
  while (at < seconds) {
    triggers.push({ at, ...nextShape(rng) })
    at += nextInterval(rng, minS, maxS, floorS)
  }
  return triggers
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

export function clampPan(pan: number): number {
  return Math.max(-1, Math.min(1, pan))
}

export function densityToInterval(density: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, density))
  const min = 45 + (3 - 45) * clamped
  return [Math.round(min * 10) / 10, Math.round(min * 25) / 10]
}

export function intervalToDensity(minS: number): number {
  return Math.max(0, Math.min(1, (45 - minS) / (45 - 3)))
}
