import type { User } from '../types'
import { api } from './client'
import { setToken } from './token'

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

interface AuthResponse {
  data: User
  token: string
}

async function authenticate(path: string, payload: object): Promise<User> {
  const { data } = await api.post<AuthResponse>(path, payload)
  setToken(data.token)
  return data.data
}

export async function register(payload: RegisterPayload): Promise<User> {
  return authenticate('/api/auth/register', payload)
}

export async function login(payload: LoginPayload): Promise<User> {
  return authenticate('/api/auth/login', payload)
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout')
  } finally {
    setToken(null)
  }
}

export async function me(): Promise<User | null> {
  try {
    const { data } = await api.get<{ data: User }>('/api/auth/me')
    return data.data
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      return null
    }
    throw error
  }
}
