import axios, { AxiosError, type AxiosInstance } from 'axios'

export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? 'https://api.halcyon.test').replace(/\/+$/, '')

export const api: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

let csrfPromise: Promise<void> | null = null

export async function ensureCsrf(): Promise<void> {
  if (!csrfPromise) {
    csrfPromise = axios
      .get(`${BACKEND_URL}/sanctum/csrf-cookie`, { withCredentials: true })
      .then(() => undefined)
      .catch((e) => {
        csrfPromise = null
        throw e
      })
  }
  return csrfPromise
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as (typeof error.config & { _retried?: boolean }) | undefined
    if (error.response?.status === 419 && config && !config._retried) {
      config._retried = true
      csrfPromise = null
      await ensureCsrf()
      return api.request(config)
    }
    return Promise.reject(error)
  },
)
