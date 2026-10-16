import type { UpdateStatus } from '../types'
import { api } from './client'

const PATH = '/api/admin/updates'

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const { data } = await api.get<{ data: UpdateStatus }>(PATH)
  return data.data
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const { data } = await api.post<{ data: UpdateStatus }>(`${PATH}/check`)
  return data.data
}

export async function startUpdate(): Promise<UpdateStatus> {
  const { data } = await api.post<{ data: UpdateStatus }>(PATH)
  return data.data
}

export async function setAutoUpdate(autoUpdate: boolean): Promise<UpdateStatus> {
  const { data } = await api.patch<{ data: UpdateStatus }>(PATH, { auto_update: autoUpdate })
  return data.data
}

export async function serverVersion(): Promise<string | null> {
  try {
    const { data } = await api.get<{ version?: string }>('/health', { timeout: 3000 })
    return data.version ?? 'unknown'
  } catch {
    return null
  }
}
