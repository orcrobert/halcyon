import type { EQBand } from '../types'

export const RESPONSE_SAMPLE_RATE = 48000
export const RESPONSE_MIN_HZ = 20
export const RESPONSE_MAX_HZ = 20000
const DEFAULT_PEAK_Q = 1.4

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

function coefficients(band: EQBand, sampleRate: number): Biquad {
  const w0 = (2 * Math.PI * Math.min(band.freq, sampleRate * 0.4999)) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const A = Math.pow(10, band.gain / 40)

  if (band.type === 'peaking') {
    const alpha = sin / (2 * (band.q ?? DEFAULT_PEAK_Q))
    const a0 = 1 + alpha / A
    return {
      b0: (1 + alpha * A) / a0,
      b1: (-2 * cos) / a0,
      b2: (1 - alpha * A) / a0,
      a1: (-2 * cos) / a0,
      a2: (1 - alpha / A) / a0,
    }
  }

  const alpha = (sin / 2) * Math.SQRT2
  const root = 2 * Math.sqrt(A) * alpha

  if (band.type === 'lowshelf') {
    const a0 = A + 1 + (A - 1) * cos + root
    return {
      b0: (A * (A + 1 - (A - 1) * cos + root)) / a0,
      b1: (2 * A * (A - 1 - (A + 1) * cos)) / a0,
      b2: (A * (A + 1 - (A - 1) * cos - root)) / a0,
      a1: (-2 * (A - 1 + (A + 1) * cos)) / a0,
      a2: (A + 1 + (A - 1) * cos - root) / a0,
    }
  }

  const a0 = A + 1 - (A - 1) * cos + root
  return {
    b0: (A * (A + 1 + (A - 1) * cos + root)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cos)) / a0,
    b2: (A * (A + 1 + (A - 1) * cos - root)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cos)) / a0,
    a2: (A + 1 - (A - 1) * cos - root) / a0,
  }
}

function magnitudeDb(c: Biquad, freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate
  const cos1 = Math.cos(w)
  const sin1 = Math.sin(w)
  const cos2 = Math.cos(2 * w)
  const sin2 = Math.sin(2 * w)
  const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2
  const numIm = -(c.b1 * sin1 + c.b2 * sin2)
  const denRe = 1 + c.a1 * cos1 + c.a2 * cos2
  const denIm = -(c.a1 * sin1 + c.a2 * sin2)
  const power = (numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm)
  return 10 * Math.log10(power)
}

export function bandResponseDb(
  band: EQBand,
  freq: number,
  sampleRate = RESPONSE_SAMPLE_RATE,
): number {
  if (band.gain === 0) return 0
  return magnitudeDb(coefficients(band, sampleRate), freq, sampleRate)
}

export function chainResponseDb(
  bands: EQBand[],
  freqs: number[],
  sampleRate = RESPONSE_SAMPLE_RATE,
): number[] {
  const filters = bands
    .filter((band) => band.gain !== 0)
    .map((band) => coefficients(band, sampleRate))
  return freqs.map((freq) =>
    filters.reduce((sum, filter) => sum + magnitudeDb(filter, freq, sampleRate), 0),
  )
}

export function logFrequencies(
  count: number,
  min = RESPONSE_MIN_HZ,
  max = RESPONSE_MAX_HZ,
): number[] {
  const ratio = Math.log(max / min)
  return Array.from({ length: count }, (_, i) => min * Math.exp((ratio * i) / (count - 1)))
}

export function formatHz(freq: number): string {
  if (freq >= 1000) {
    const k = freq / 1000
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')} kHz`
  }
  return `${Math.round(freq)} Hz`
}
