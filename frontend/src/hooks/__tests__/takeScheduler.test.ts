import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../eventScheduler'
import {
  TAKE_CROSSFADE_S,
  equalPowerCurve,
  nextTake,
  planTakes,
  takeCrossfade,
} from '../takeScheduler'

describe('takeCrossfade', () => {
  it('uses the full crossfade when every take is long enough', () => {
    expect(takeCrossfade([20, 30])).toBe(TAKE_CROSSFADE_S)
  })

  it('shrinks to a quarter of the shortest take', () => {
    expect(takeCrossfade([4, 30])).toBe(1)
  })

  it('is zero without takes', () => {
    expect(takeCrossfade([])).toBe(0)
  })
})

describe('nextTake', () => {
  it('stays on the only take', () => {
    expect(nextTake(() => 0.9, 1, 0)).toBe(0)
  })

  it('never repeats the current take', () => {
    const rng = mulberry32(7)
    let current = 0
    for (let i = 0; i < 200; i++) {
      const next = nextTake(rng, 3, current)
      expect(next).not.toBe(current)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(3)
      current = next
    }
  })

  it('reaches every other take', () => {
    const rng = mulberry32(11)
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) seen.add(nextTake(rng, 3, 0))
    expect([...seen].sort()).toEqual([1, 2])
  })
})

describe('planTakes', () => {
  it('starts on the first take at zero', () => {
    const plan = planTakes(mulberry32(1), 60, [10, 10], 2)
    expect(plan[0]).toEqual({ take: 0, at: 0 })
  })

  it('overlaps each take with the next by the crossfade', () => {
    const plan = planTakes(mulberry32(1), 60, [10, 12, 8], 2)
    for (let i = 1; i < plan.length; i++) {
      const previous = plan[i - 1]
      expect(plan[i].at).toBeCloseTo(previous.at + [10, 12, 8][previous.take] - 2)
      expect(plan[i].take).not.toBe(previous.take)
    }
  })

  it('covers the whole render and stops there', () => {
    const plan = planTakes(mulberry32(3), 45, [10, 10], 2)
    const last = plan[plan.length - 1]
    expect(last.at).toBeLessThan(45)
    expect(last.at + 10).toBeGreaterThanOrEqual(45)
  })

  it('is reproducible for a seed', () => {
    expect(planTakes(mulberry32(5), 90, [9, 11, 10], 2)).toEqual(
      planTakes(mulberry32(5), 90, [9, 11, 10], 2),
    )
  })

  it('plans nothing without takes', () => {
    expect(planTakes(mulberry32(5), 90, [], 2)).toEqual([])
  })
})

describe('equalPowerCurve', () => {
  it('keeps constant power across a crossfade', () => {
    const rising = equalPowerCurve(true)
    const falling = equalPowerCurve(false)
    expect(rising[0]).toBeCloseTo(0)
    expect(rising[rising.length - 1]).toBeCloseTo(1)
    for (let i = 0; i < rising.length; i++) {
      expect(rising[i] ** 2 + falling[i] ** 2).toBeCloseTo(1)
    }
  })
})
