const STORAGE_KEY = 'halcyon_token'

let cached: string | null = null
let loaded = false

export function getToken(): string | null {
  if (!loaded) {
    try {
      cached = localStorage.getItem(STORAGE_KEY)
    } catch {
      cached = null
    }
    loaded = true
  }
  return cached
}

export function setToken(token: string | null): void {
  cached = token
  loaded = true
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* private browsing: the in-memory copy still works for this session */
  }
}
