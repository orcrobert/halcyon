export const TAKE_CROSSFADE_S = 2
export const TAKE_CROSSFADE_FRACTION = 0.25
export const TAKE_LOOKAHEAD_S = 4
export const TAKE_CURVE_POINTS = 64

export interface TakeSegment {
  take: number
  at: number
}

export function takeCrossfade(durations: number[]): number {
  if (durations.length === 0) return 0
  return Math.min(TAKE_CROSSFADE_S, Math.min(...durations) * TAKE_CROSSFADE_FRACTION)
}

export function nextTake(rng: () => number, count: number, current: number): number {
  if (count <= 1) return 0
  const pick = Math.floor(rng() * (count - 1))
  return pick >= current ? pick + 1 : pick
}

export function planTakes(
  rng: () => number,
  seconds: number,
  durations: number[],
  crossfade: number,
): TakeSegment[] {
  const segments: TakeSegment[] = []
  if (durations.length === 0) return segments
  let take = 0
  let at = 0
  while (at < seconds) {
    segments.push({ take, at })
    at += Math.max(durations[take] - crossfade, crossfade, Number.EPSILON)
    take = nextTake(rng, durations.length, take)
  }
  return segments
}

export function equalPowerCurve(rising: boolean, points = TAKE_CURVE_POINTS): Float32Array {
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const angle = (i / (points - 1)) * (Math.PI / 2)
    curve[i] = rising ? Math.sin(angle) : Math.cos(angle)
  }
  return curve
}
