import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  Object.assign(globalThis, { AudioWorkletNode: class {} })
})

import { buildEQState, correctiveBands, isCanonicalBand } from '../useAudioEngine'

describe('isCanonicalBand', () => {
  it('reads a slider band at a slider frequency as a slider', () => {
    expect(isCanonicalBand({ type: 'peaking', freq: 1000, gain: 2, q: 1.4 })).toBe(true)
  })

  it('never reads a mixer band as a slider, even at a slider frequency', () => {
    const bands = [
      { type: 'peaking' as const, freq: 1000, gain: -3.1, q: 1.36, source: 'masking' as const },
      { type: 'lowshelf' as const, freq: 200, gain: -2, q: 0.7, source: 'tone' as const },
    ]

    expect(bands.some(isCanonicalBand)).toBe(false)
    expect(buildEQState(bands)).toEqual({ low: 0, mid: 0, high: 0 })
    expect(correctiveBands(bands)).toEqual(bands)
  })
})
