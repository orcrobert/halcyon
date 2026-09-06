import { describe, expect, it } from 'vitest'
import {
  EVENT_FIRST_TRIGGER_MIN_S,
  EVENT_GAIN_JITTER_DB,
  EVENT_PAN_JITTER,
  EVENT_RATE_JITTER,
  densityToInterval,
  intervalToDensity,
  mulberry32,
  nextInterval,
  nextShape,
  planTriggers,
} from '../eventScheduler'

describe('mulberry32', () => {
  it('reproduces the same sequence for a seed', () => {
    const a = mulberry32(0x5eed)
    const b = mulberry32(0x5eed)
    const drawn = Array.from({ length: 8 }, () => a())

    expect(drawn).toEqual(Array.from({ length: 8 }, () => b()))
    expect(drawn.every((v) => v >= 0 && v < 1)).toBe(true)
  })

  it('gives different sequences for different seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })
})

describe('nextInterval', () => {
  it('stays inside the requested range', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      const interval = nextInterval(rng, 8, 25, 0.4)
      expect(interval).toBeGreaterThanOrEqual(8)
      expect(interval).toBeLessThanOrEqual(25)
    }
  })

  it('never returns less than the clip length', () => {
    const rng = mulberry32(9)
    for (let i = 0; i < 500; i++) {
      expect(nextInterval(rng, 1, 2, 6)).toBeGreaterThanOrEqual(6)
    }
  })

  it('collapses to the floor when the whole range is below it', () => {
    expect(nextInterval(() => 0.9, 1, 2, 6)).toBe(6)
  })
})

describe('planTriggers', () => {
  it('is deterministic for a seed', () => {
    const plan = () => planTriggers(mulberry32(0x5eed), 60, 8, 25, 0.4)
    expect(plan()).toEqual(plan())
  })

  it('never schedules past the requested length', () => {
    const triggers = planTriggers(mulberry32(3), 60, 8, 25, 0.4)
    expect(triggers.length).toBeGreaterThan(0)
    for (const trigger of triggers) {
      expect(trigger.at).toBeLessThan(60)
    }
  })

  it('spaces triggers by at least the minimum interval', () => {
    const triggers = planTriggers(mulberry32(4), 300, 8, 25, 0.4)
    for (let i = 1; i < triggers.length; i++) {
      expect(triggers[i].at - triggers[i - 1].at).toBeGreaterThanOrEqual(8)
    }
    expect(triggers[0].at).toBeGreaterThanOrEqual(EVENT_FIRST_TRIGGER_MIN_S)
  })

  it('produces no triggers when the window is shorter than the first delay', () => {
    expect(planTriggers(mulberry32(5), 0.2, 8, 25, 0.4)).toEqual([])
  })
})

describe('nextShape', () => {
  it('keeps every jitter inside its bound', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 500; i++) {
      const shape = nextShape(rng)
      expect(Math.abs(shape.gainDb)).toBeLessThanOrEqual(EVENT_GAIN_JITTER_DB)
      expect(Math.abs(shape.rate - 1)).toBeLessThanOrEqual(EVENT_RATE_JITTER)
      expect(Math.abs(shape.panOffset)).toBeLessThanOrEqual(EVENT_PAN_JITTER)
    }
  })
})

describe('density', () => {
  it('maps the slider onto a widening interval', () => {
    expect(densityToInterval(1)).toEqual([3, 7.5])
    expect(densityToInterval(0)).toEqual([45, 112.5])
    const [min, max] = densityToInterval(0.5)
    expect(min).toBeGreaterThan(3)
    expect(min).toBeLessThan(45)
    expect(max).toBeCloseTo(min * 2.5, 5)
  })

  it('round-trips back to the slider position', () => {
    for (const density of [0, 0.25, 0.5, 0.75, 1]) {
      const [min] = densityToInterval(density)
      expect(intervalToDensity(min)).toBeCloseTo(density, 2)
    }
  })

  it('clamps out-of-range input', () => {
    expect(densityToInterval(-1)).toEqual(densityToInterval(0))
    expect(densityToInterval(2)).toEqual(densityToInterval(1))
  })
})
