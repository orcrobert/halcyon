import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { setUnauthorizedHandler } from '../api/client'
import { getToken, setToken } from '../api/token'
import { AuthContext, type AuthContextValue, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ status: 'guest' })
      return
    }
    const user = await authApi.me()
    setState(user ? { status: 'authed', user } : { status: 'guest' })
  }, [])

  useEffect(() => {
    refresh().catch(() => setState({ status: 'guest' }))
  }, [refresh])

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'guest' }))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.login({ email, password })
    setState({ status: 'authed', user })
  }, [])

  const register = useCallback(async (payload: authApi.RegisterPayload) => {
    const user = await authApi.register(payload)
    setState({ status: 'authed', user })
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setToken(null)
      setState({ status: 'guest' })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, refresh }),
    [state, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
