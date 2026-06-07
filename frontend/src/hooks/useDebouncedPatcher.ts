import { useCallback, useEffect, useRef } from 'react'
import { updateElement } from '../api/elements'
import { BACKEND_URL } from '../api/client'
import type { ElementMixUpdate } from '../types'

const DEBOUNCE_MS = 250

interface PendingEntry {
  patch: ElementMixUpdate
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
}

function readCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function useDebouncedPatcher() {
  const queueRef = useRef<Map<number, PendingEntry>>(new Map())

  const flush = useCallback(async (id: number) => {
    const entry = queueRef.current.get(id)
    if (!entry || entry.inFlight) return

    const patch = entry.patch
    if (Object.keys(patch).length === 0) return

    entry.inFlight = true
    entry.patch = {}
    entry.timer = null

    try {
      await updateElement(id, patch)
    } catch (err) {
      console.error(`PATCH /elements/${id} failed`, err)
    } finally {
      entry.inFlight = false
      const stillPending = queueRef.current.get(id)
      if (stillPending && Object.keys(stillPending.patch).length > 0) {
        scheduleFlush(id)
      }
    }
  }, [])

  const scheduleFlush = useCallback((id: number) => {
    const entry = queueRef.current.get(id)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => flush(id), DEBOUNCE_MS)
  }, [flush])

  const enqueue = useCallback((id: number, patch: ElementMixUpdate) => {
    let entry = queueRef.current.get(id)
    if (!entry) {
      entry = { patch: {}, timer: null, inFlight: false }
      queueRef.current.set(id, entry)
    }
    Object.assign(entry.patch, patch)
    scheduleFlush(id)
  }, [scheduleFlush])

  const flushAll = useCallback(async () => {
    const ids = Array.from(queueRef.current.keys())
    await Promise.all(
      ids.map(async (id) => {
        const entry = queueRef.current.get(id)
        if (entry?.timer) {
          clearTimeout(entry.timer)
          entry.timer = null
        }
        await flush(id)
      }),
    )
  }, [flush])

  const flushAllSync = useCallback(() => {
    const csrf = readCsrfTokenFromCookie()
    queueRef.current.forEach((entry, id) => {
      if (entry.inFlight) return
      const patch = entry.patch
      if (Object.keys(patch).length === 0) return
      entry.patch = {}
      if (entry.timer) {
        clearTimeout(entry.timer)
        entry.timer = null
      }
      fetch(`${BACKEND_URL}/api/elements/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
        },
        body: JSON.stringify(patch),
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    })
  }, [])

  useEffect(() => {
    return () => {
      const queue = queueRef.current
      queue.forEach((entry) => {
        if (entry.timer) {
          clearTimeout(entry.timer)
          entry.timer = null
        }
      })
    }
  }, [])

  return { enqueue, flushAll, flushAllSync }
}
