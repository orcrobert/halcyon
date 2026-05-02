import { useAuth } from './auth/AuthContext'
import { AuthView } from './components/AuthView'

export default function App() {
  const { state, logout } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#08090e' }}>
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#08090e' }}>
      {state.status === 'guest' ? (
        <AuthView />
      ) : (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">Signed in as</p>
            <p className="text-white/90 font-medium mb-6">{state.user.email}</p>
            <p className="text-white/40 text-xs mb-6">
              Generation flow rewires next commit.
            </p>
            <button
              onClick={() => logout()}
              className="rounded-md bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/80 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
