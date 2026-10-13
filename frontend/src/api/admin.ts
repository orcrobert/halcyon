import type { ManagedUser, ManagedUserCreate, ManagedUserUpdate } from '../types'
import { api } from './client'

export function accountPath(path: string, userId?: number): string {
  return userId === undefined ? `/api${path}` : `/api/admin/users/${userId}${path}`
}

export async function listUsers(): Promise<ManagedUser[]> {
  const { data } = await api.get<{ data: ManagedUser[] }>('/api/admin/users')
  return data.data
}

export async function createUser(payload: ManagedUserCreate): Promise<ManagedUser> {
  const { data } = await api.post<{ data: ManagedUser }>('/api/admin/users', payload)
  return data.data
}

export async function updateUser(id: number, patch: ManagedUserUpdate): Promise<ManagedUser> {
  const { data } = await api.patch<{ data: ManagedUser }>(`/api/admin/users/${id}`, patch)
  return data.data
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/api/admin/users/${id}`)
}
