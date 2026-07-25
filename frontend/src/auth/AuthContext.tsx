import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { AuthContext, type AuthContextValue, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    const user = await authApi.me()
    setState(user ? { status: 'authed', user } : { status: 'guest' })
  }, [])

  useEffect(() => {
    refresh().catch(() => setState({ status: 'guest' }))
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.login({ email, password })
    setState({ status: 'authed', user })
  }, [])

  const register = useCallback(async (payload: authApi.RegisterPayload) => {
    const user = await authApi.register(payload)
    setState({ status: 'authed', user })
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setState({ status: 'guest' })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, refresh }),
    [state, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
