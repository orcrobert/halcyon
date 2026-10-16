import { describe, expect, it } from 'vitest'
import { toastVersion, updateBlocker } from '../updates'
import type { UpdateStatus } from '../types'

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: '1.4.2',
    latest: '1.5.0',
    update_available: true,
    major: false,
    pinned: false,
    notes: null,
    release_url: null,
    published_at: null,
    checked_at: null,
    check_error: null,
    track: 'latest',
    updater: 'ready',
    updating: false,
    update_error: null,
    auto_update: false,
    ...overrides,
  }
}

describe('toastVersion', () => {
  it('announces a newer release', () => {
    expect(toastVersion(status(), null)).toBe('1.5.0')
  })

  it('stays quiet once that version is dismissed', () => {
    expect(toastVersion(status(), '1.5.0')).toBeNull()
  })

  it('comes back for the next release', () => {
    expect(toastVersion(status({ latest: '1.6.0' }), '1.5.0')).toBe('1.6.0')
  })

  it('stays quiet when up to date or already updating', () => {
    expect(toastVersion(status({ update_available: false }), null)).toBeNull()
    expect(toastVersion(status({ updating: true }), null)).toBeNull()
    expect(toastVersion(null, null)).toBeNull()
  })

  it('still tells a pinned server that a release exists', () => {
    expect(toastVersion(status({ update_available: false, pinned: true }), null)).toBe('1.5.0')
  })
})

describe('updateBlocker', () => {
  it('names why the button is unavailable', () => {
    expect(updateBlocker(status())).toBeNull()
    expect(updateBlocker(status({ updater: 'missing' }))).toBe('missing')
    expect(updateBlocker(status({ pinned: true }))).toBe('pinned')
  })
})
