import { describe, expect, it } from 'vitest'
import { bandResponseDb, chainResponseDb, formatHz, logFrequencies } from '../eqResponse'

describe('bandResponseDb', () => {
  it('reaches a peaking cut at its centre and leaves the rest alone', () => {
    const band = { type: 'peaking' as const, freq: 1000, gain: -4.2, q: 1.2 }

    expect(bandResponseDb(band, 1000)).toBeCloseTo(-4.2, 1)
    expect(Math.abs(bandResponseDb(band, 50))).toBeLessThan(0.2)
    expect(Math.abs(bandResponseDb(band, 15000))).toBeLessThan(0.2)
  })

  it('reaches a low shelf below its corner and half of it at the corner', () => {
    const band = { type: 'lowshelf' as const, freq: 200, gain: -6, q: 0.7 }

    expect(bandResponseDb(band, 10)).toBeCloseTo(-6, 1)
    expect(bandResponseDb(band, 200)).toBeCloseTo(-3, 0)
    expect(Math.abs(bandResponseDb(band, 8000))).toBeLessThan(0.1)
  })

  it('reaches a high shelf above its corner', () => {
    const band = { type: 'highshelf' as const, freq: 8000, gain: -6, q: 0.7 }

    expect(Math.abs(bandResponseDb(band, 100))).toBeLessThan(0.3)
    expect(bandResponseDb(band, 20000)).toBeLessThan(-5)
  })
})

describe('chainResponseDb', () => {
  it('adds the bands of a chain in decibels', () => {
    const a = { type: 'peaking' as const, freq: 500, gain: -2, q: 1.2 }
    const b = { type: 'lowshelf' as const, freq: 80, gain: -6, q: 0.7 }
    const freqs = [40, 500, 4000]

    const chain = chainResponseDb([a, b], freqs)
    freqs.forEach((freq, i) => {
      expect(chain[i]).toBeCloseTo(bandResponseDb(a, freq) + bandResponseDb(b, freq), 6)
    })
  })

  it('is flat for an empty chain', () => {
    expect(chainResponseDb([], [100, 1000])).toEqual([0, 0])
  })
})

describe('logFrequencies', () => {
  it('spans the range evenly on a log scale', () => {
    const freqs = logFrequencies(4, 10, 10000)

    expect(freqs[0]).toBeCloseTo(10)
    expect(freqs[1]).toBeCloseTo(100)
    expect(freqs[3]).toBeCloseTo(10000)
  })
})

describe('formatHz', () => {
  it('reads like a label', () => {
    expect(formatHz(80)).toBe('80 Hz')
    expect(formatHz(1227)).toBe('1.2 kHz')
    expect(formatHz(1000)).toBe('1 kHz')
    expect(formatHz(11271)).toBe('11 kHz')
  })
})
