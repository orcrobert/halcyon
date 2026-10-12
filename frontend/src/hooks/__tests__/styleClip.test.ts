import { describe, expect, it } from 'vitest'
import {
  MAX_STYLE_S,
  MIN_STYLE_S,
  encodeWav,
  formatTime,
  initialSelection,
  moveSelection,
  resizeEnd,
  resizeStart,
  viewWindow,
} from '../styleClip'

describe('initialSelection', () => {
  it('starts a quarter into the clip with the default length', () => {
    expect(initialSelection(60)).toEqual({ start: 15, end: 18 })
  })

  it('fits inside a short clip', () => {
    const selection = initialSelection(2)
    expect(selection.start).toBe(0)
    expect(selection.end).toBe(2)
  })
})

describe('resizing', () => {
  const selection = { start: 10, end: 13 }

  it('keeps the excerpt within the style length limits', () => {
    expect(resizeEnd(selection, 30, 60).end).toBe(10 + MAX_STYLE_S)
    expect(resizeEnd(selection, 10.2, 60).end).toBe(10 + MIN_STYLE_S)
    expect(resizeStart(selection, 0, 60).start).toBe(13 - MAX_STYLE_S)
    expect(resizeStart(selection, 12.9, 60).start).toBe(13 - MIN_STYLE_S)
  })

  it('never runs past either end of the clip', () => {
    expect(resizeEnd({ start: 57, end: 59 }, 70, 60).end).toBe(60)
    expect(resizeStart({ start: 1, end: 3 }, -5, 60).start).toBe(0)
  })
})

describe('moveSelection', () => {
  it('keeps the length and stays inside the clip', () => {
    expect(moveSelection({ start: 10, end: 13 }, 58, 60)).toEqual({ start: 57, end: 60 })
    expect(moveSelection({ start: 10, end: 13 }, -4, 60)).toEqual({ start: 0, end: 3 })
  })
})

describe('viewWindow', () => {
  it('shows the whole clip when it is shorter than the span', () => {
    expect(viewWindow({ start: 1, end: 3 }, 8, 12)).toEqual({ start: 0, end: 8 })
  })

  it('centres on the excerpt and clamps to the clip', () => {
    expect(viewWindow({ start: 29, end: 31 }, 120, 12)).toEqual({ start: 24, end: 36 })
    expect(viewWindow({ start: 118, end: 120 }, 120, 12)).toEqual({ start: 108, end: 120 })
  })
})

describe('encodeWav', () => {
  it('writes a mono 16-bit PCM header', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1]), 32000)
    const view = new DataView(bytes)
    const text = (offset: number) =>
      String.fromCharCode(...new Uint8Array(bytes, offset, 4))

    expect(bytes.byteLength).toBe(44 + 6)
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(32000)
    expect(view.getInt16(46, true)).toBe(0x7fff)
    expect(view.getInt16(48, true)).toBe(-0x8000)
  })
})

describe('formatTime', () => {
  it('formats minutes and tenths', () => {
    expect(formatTime(75.25)).toBe('1:15.3')
    expect(formatTime(3)).toBe('0:03.0')
  })
})
