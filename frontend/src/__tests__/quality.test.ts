import { describe, expect, it } from 'vitest'
import { anyBusy, describeIssues, flaggedLayers } from '../quality'
import type { Element, ElementStatus, QualityIssue } from '../types'

function layer(
  id: number,
  quality: Element['quality'],
  status: ElementStatus = 'ready',
): Element {
  return {
    id,
    label: `Layer ${id}`,
    type: 'sound',
    prompt: '',
    duration_s: 4,
    status,
    error: null,
    version: 1,
    position: id,
    playback: 'loop',
    clip_s: 4,
    interval_min_s: null,
    interval_max_s: null,
    source: 'generated',
    source_json: null,
    quality,
    volume: 0.8,
    pan: 0,
    depth: 0,
    tuning_hz: 440,
    eq_json: null,
    original: { volume: 0.8, pan: 0, depth: 0, eq_json: null },
    audio_url: null,
    takes: [],
  }
}

const clipped: QualityIssue = { check: 'clipping', value: 0.01, limit: 0.001 }
const seam: QualityIssue = { check: 'seam', value: 9, limit: 6 }
const harsh: QualityIssue = { check: 'harsh', value: 0.7, limit: 0.6 }

describe('flaggedLayers', () => {
  it('keeps ready layers with open issues', () => {
    const elements = [
      layer(1, { issues: [clipped], dismissed: false }),
      layer(2, { issues: [], dismissed: false }),
      layer(3, { issues: [clipped], dismissed: true }),
      layer(4, null),
      layer(5, { issues: [seam], dismissed: false }, 'regenerating'),
    ]

    expect(flaggedLayers(elements).map((e) => e.id)).toEqual([1])
  })

  it('handles a missing element list', () => {
    expect(flaggedLayers(undefined)).toEqual([])
  })
})

describe('describeIssues', () => {
  it('names a single issue', () => {
    expect(describeIssues([clipped])).toBe('came back clipped')
  })

  it('joins two issues with and', () => {
    expect(describeIssues([clipped, seam])).toBe(
      'came back clipped and jumps where it loops',
    )
  })

  it('lists three issues', () => {
    expect(describeIssues([clipped, harsh, seam])).toBe(
      'came back clipped, sounds harsh and jumps where it loops',
    )
  })

  it('says each kind of issue once', () => {
    expect(describeIssues([seam, seam])).toBe('jumps where it loops')
  })
})

describe('anyBusy', () => {
  it('is true while a layer regenerates', () => {
    expect(anyBusy([layer(1, null), layer(2, null, 'regenerating')])).toBe(true)
    expect(anyBusy([layer(1, null)])).toBe(false)
  })
})
