import axios, { AxiosError, type AxiosInstance } from 'axios'
import { getToken, setToken } from './token'

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
})

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      setToken(null)
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)
