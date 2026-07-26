import type { Atmosphere, PaginatedResponse } from '../types'
import { api } from './client'

interface AtmosphereResponse {
  data: Atmosphere
}

export async function listAtmospheres(): Promise<PaginatedResponse<Atmosphere>> {
  const { data } = await api.get<PaginatedResponse<Atmosphere>>('/api/atmospheres')
  return data
}

export async function createAtmosphere(payload: {
  prompt: string
  title?: string
}): Promise<Atmosphere> {
  const { data } = await api.post<AtmosphereResponse>('/api/atmospheres', payload)
  return data.data
}

export async function getAtmosphere(id: number): Promise<Atmosphere> {
  const { data } = await api.get<AtmosphereResponse>(`/api/atmospheres/${id}`)
  return data.data
}

export async function deleteAtmosphere(id: number): Promise<void> {
  await api.delete(`/api/atmospheres/${id}`)
}

const TERMINAL: ReadonlyArray<Atmosphere['status']> = ['ready', 'failed']

export async function pollAtmosphere(
  id: number,
  options: {
    intervalMs?: number
    timeoutMs?: number
    stuckPendingMs?: number
    onTick?: (a: Atmosphere) => void
    signal?: AbortSignal
  } = {},
): Promise<Atmosphere> {
  const interval = options.intervalMs ?? 1500
  const timeout = options.timeoutMs ?? 10 * 60_000
  const stuckPendingMs = options.stuckPendingMs ?? 20_000
  const start = Date.now()
  let leftPendingAt: number | null = null

  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const atmosphere = await getAtmosphere(id)
    options.onTick?.(atmosphere)
    if (TERMINAL.includes(atmosphere.status)) return atmosphere

    if (atmosphere.status !== 'pending') {
      leftPendingAt = Date.now()
    }
    const stuckSince = leftPendingAt ?? start
    if (atmosphere.status === 'pending' && Date.now() - stuckSince > stuckPendingMs) {
      throw new Error(
        'Job queued but never picked up.' 
      )
    }

    if (Date.now() - start > timeout) {
      throw new Error(`Polling timed out after ${timeout}ms`)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}
