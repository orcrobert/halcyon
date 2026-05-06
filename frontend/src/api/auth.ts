import type { User } from '../types'
import { api, ensureCsrf } from './client'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation: string
}

export interface LoginPayload {
  email: string
  password: string
}

export async function register(payload: RegisterPayload): Promise<User> {
  await ensureCsrf()
  const { data } = await api.post<User>('/api/register', payload)
  return data
}

export async function login(payload: LoginPayload): Promise<User> {
  await ensureCsrf()
  const { data } = await api.post<User>('/api/login', payload)
  return data
}

export async function logout(): Promise<void> {
  await api.post('/api/logout')
}

export async function me(): Promise<User | null> {
  try {
    const { data } = await api.get<User>('/api/me')
    return data
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response?: { status?: number } }).response?.status === 'number' &&
      (error as { response: { status: number } }).response.status === 401
    ) {
      return null
    }
    throw error
  }
}
