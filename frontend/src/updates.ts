import type { UpdateStatus } from './types'

const DISMISSED_KEY = 'halcyon.update-dismissed'

export function dismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

export function dismissVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version)
  } catch {
    return
  }
}

export function toastVersion(status: UpdateStatus | null, dismissed: string | null): string | null {
  if (!status?.latest || status.updating) return null
  if (!status.update_available && !status.pinned) return null
  return status.latest === dismissed ? null : status.latest
}

export function updateBlocker(status: UpdateStatus): string | null {
  if (status.updater === 'missing') return 'missing'
  if (status.pinned) return 'pinned'
  return null
}
