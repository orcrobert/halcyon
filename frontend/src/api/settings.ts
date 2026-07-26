import type { Settings, SettingsUpdate } from '../types'
import { api } from './client'

export async function getSettings(): Promise<Settings> {
  const { data } = await api.get<{ data: Settings }>('/api/settings')
  return data.data
}

export async function updateSettings(patch: SettingsUpdate): Promise<Settings> {
  const { data } = await api.put<{ data: Settings }>('/api/settings', patch)
  return data.data
}
