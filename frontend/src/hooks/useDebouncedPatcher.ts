import { useCallback, useEffect, useRef } from 'react'
import { updateElement } from '../api/elements'
import { apiUrl, authHeaders } from '../api/client'
import type { ElementMixUpdate } from '../types'

const DEBOUNCE_MS = 250

interface PendingEntry {
  patch: ElementMixUpdate
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
}

type Queue = Map<number, PendingEntry>

async function flush(queue: Queue, id: number) {
  const entry = queue.get(id)
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
    const stillPending = queue.get(id)
    if (stillPending && Object.keys(stillPending.patch).length > 0) {
      scheduleFlush(queue, id)
    }
  }
}

function scheduleFlush(queue: Queue, id: number) {
  const entry = queue.get(id)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => flush(queue, id), DEBOUNCE_MS)
}

export function useDebouncedPatcher() {
  const queueRef = useRef<Queue>(new Map())

  const enqueue = useCallback((id: number, patch: ElementMixUpdate) => {
    let entry = queueRef.current.get(id)
    if (!entry) {
      entry = { patch: {}, timer: null, inFlight: false }
      queueRef.current.set(id, entry)
    }
    Object.assign(entry.patch, patch)
    scheduleFlush(queueRef.current, id)
  }, [])

  const flushAll = useCallback(async () => {
    const ids = Array.from(queueRef.current.keys())
    await Promise.all(
      ids.map(async (id) => {
        const entry = queueRef.current.get(id)
        if (entry?.timer) {
          clearTimeout(entry.timer)
          entry.timer = null
        }
        await flush(queueRef.current, id)
      }),
    )
  }, [])

  const flushAllSync = useCallback(() => {
    queueRef.current.forEach((entry, id) => {
      if (entry.inFlight) return
      const patch = entry.patch
      if (Object.keys(patch).length === 0) return
      entry.patch = {}
      if (entry.timer) {
        clearTimeout(entry.timer)
        entry.timer = null
      }
      fetch(apiUrl(`/api/elements/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(patch),
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
