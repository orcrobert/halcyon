import type { Settings, SettingsUpdate } from '../types'
import { api } from './client'
import { accountPath } from './admin'

export async function getSettings(userId?: number): Promise<Settings> {
  const { data } = await api.get<{ data: Settings }>(accountPath('/settings', userId))
  return data.data
}

export async function updateSettings(patch: SettingsUpdate, userId?: number): Promise<Settings> {
  const { data } = await api.put<{ data: Settings }>(accountPath('/settings', userId), patch)
  return data.data
}
