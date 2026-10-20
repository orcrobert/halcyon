import { describe, expect, it } from 'vitest'
import { placePopover } from '../popoverPlacement'

const anchor = (top: number, left = 180) => ({ top, bottom: top + 32, left, width: 32 })

describe('placePopover', () => {
  it('opens above the anchor when it fits', () => {
    const p = placePopover(anchor(700), { width: 340, height: 400 }, { width: 1200, height: 800 })
    expect(p.side).toBe('above')
    expect(p.top).toBe(700 - 14 - 400)
  })

  it('flips below when there is no room above', () => {
    const p = placePopover(anchor(100), { width: 340, height: 400 }, { width: 1200, height: 800 })
    expect(p.side).toBe('below')
    expect(p.top).toBe(146)
  })

  it('caps the height to the larger side when neither fits', () => {
    const p = placePopover(anchor(500), { width: 340, height: 560 }, { width: 1200, height: 800 })
    expect(p.side).toBe('above')
    expect(p.top).toBe(8)
    expect(p.maxHeight).toBe(478)
  })

  it('covers the anchor on a short viewport', () => {
    const p = placePopover(anchor(170), { width: 340, height: 560 }, { width: 800, height: 380 })
    expect(p.side).toBe('over')
    expect(p.top).toBe(8)
    expect(p.maxHeight).toBe(364)
  })

  it('narrows to the viewport and keeps both edges inside it', () => {
    const p = placePopover(anchor(600, 10), { width: 340, height: 300 }, { width: 320, height: 700 })
    expect(p.width).toBe(304)
    expect(p.left).toBe(8)
    expect(p.left + p.width).toBeLessThanOrEqual(312)
  })

  it('points the arrow at the anchor within the panel', () => {
    const p = placePopover(anchor(600, 300), { width: 200, height: 300 }, { width: 1000, height: 700 })
    expect(p.arrowX).toBe(300 + 16 - p.left)
  })
})
