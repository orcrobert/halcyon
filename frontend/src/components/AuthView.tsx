import { useEffect, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useAuth } from '../auth/AuthContext'

type Mode = 'login' | 'register'

interface ValidationErrors {
  [field: string]: string[]
}

function extractErrors(error: unknown): { message: string; fields: ValidationErrors } {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string; errors?: ValidationErrors } | undefined
    return {
      message: data?.message ?? error.message,
      fields: data?.errors ?? {},
    }
  }
  return { message: error instanceof Error ? error.message : 'Something went wrong', fields: {} }
}

function BreathingWave() {
  const [path, setPath] = useState('')
  const rafRef = useRef(0)
  const tRef = useRef(0)

  useEffect(() => {
    const W = 720
    const H = 80
    const MID = H / 2
    const SAMPLES = 180

    function tick() {
      tRef.current += 0.006
      const t = tRef.current
      const breath = 0.55 + 0.45 * Math.sin(t * 0.7)

      const pts: string[] = []
      for (let i = 0; i <= SAMPLES; i++) {
        const x = (i / SAMPLES) * W
        const u = (i / SAMPLES) * Math.PI * 2

        const a1 = Math.sin(u * 1.0 + t * 1.2) * 12 * breath
        const a2 = Math.sin(u * 2.3 + t * 0.7) * 6 * breath
        const a3 = Math.sin(u * 0.5 - t * 0.5) * 4

        const envelope = Math.sin((i / SAMPLES) * Math.PI)
        const y = MID + (a1 + a2 + a3) * envelope

        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
      }

      setPath(pts.join(' '))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="relative w-full flex justify-center pointer-events-none" style={{ height: 80 }}>
      <svg width="720" height="80" viewBox="0 0 720 80" style={{ overflow: 'visible', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="auth-bw-grad" x1="0" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(99,102,241,0)" />
            <stop offset="50%" stopColor="rgba(129,140,248,0.9)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
          <filter id="auth-bw-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b1" />
            <feGaussianBlur stdDeviation="2" result="b2" />
            <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
          </filter>
        </defs>
        <path d={path} stroke="url(#auth-bw-grad)" strokeWidth="10" fill="none" strokeLinecap="round" filter="url(#auth-bw-glow)" opacity="0.18" />
        <path d={path} stroke="url(#auth-bw-grad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={path} stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  )
}

export function AuthView() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})

  async function onSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)
    setFieldErrors({})

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register({
          name,
          email,
          password,
          password_confirmation: passwordConfirm,
        })
      }
    } catch (err) {
      const { message, fields } = extractErrors(err)
      setErrorMessage(message)
      setFieldErrors(fields)
    } finally {
      setSubmitting(false)
    }
  }

  function fieldError(field: string): string | null {
    return fieldErrors[field]?.[0] ?? null
  }

  function switchMode(next: Mode) {
    setMode(next)
    setErrorMessage(null)
    setFieldErrors({})
  }

  const isRegister = mode === 'register'

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">
      <div className="flex flex-col gap-10 w-full" style={{ maxWidth: '440px' }}>

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-[10px] uppercase tracking-[0.32em] text-slate-600 font-medium">
            Atmosphere
          </span>
          <p
            className="text-[15px] text-slate-400 leading-relaxed mx-auto"
            style={{ maxWidth: '360px', fontWeight: 300, letterSpacing: '-0.005em' }}
          >
            {isRegister
              ? 'Make an account to start composing.'
              : 'Sign in to return to your atmospheres.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div
            className="rounded-2xl border border-[#1e2035] bg-[#0d0e18] transition-opacity"
            style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', opacity: submitting ? 0.6 : 1 }}
          >
            <div className="flex flex-col gap-5" style={{ padding: '28px 28px 24px 28px' }}>
              {isRegister && (
                <Field
                  label="Name"
                  type="text"
                  value={name}
                  onChange={setName}
                  error={fieldError('name')}
                  autoComplete="name"
                  disabled={submitting}
                  required
                />
              )}

              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                error={fieldError('email')}
                autoComplete="email"
                disabled={submitting}
                required
              />

              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                error={fieldError('password')}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                disabled={submitting}
                required
              />

              {isRegister && (
                <Field
                  label="Confirm password"
                  type="password"
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  autoComplete="new-password"
                  disabled={submitting}
                  required
                />
              )}
            </div>

            <div className="flex items-center justify-between" style={{ padding: '0 28px 20px 28px' }}>
              <button
                type="button"
                onClick={() => switchMode(isRegister ? 'login' : 'register')}
                className="text-[11px] text-slate-700 hover:text-slate-400 transition-colors"
              >
                {isRegister ? 'Have an account? Sign in' : 'New here? Sign up'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 text-white text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: submitting ? 'rgba(99,102,241,0.25)' : '#6366f1',
                  fontFamily: 'inherit',
                }}
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                    <span className="ml-1.5">{isRegister ? 'Creating...' : 'Signing in...'}</span>
                  </span>
                ) : (
                  <>
                    {isRegister ? 'Sign up' : 'Sign in'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {errorMessage && Object.keys(fieldErrors).length === 0 && (
            <p className="text-center text-red-500 text-sm">{errorMessage}</p>
          )}
        </form>

        {!submitting && <BreathingWave />}

      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  error?: string | null
  autoComplete?: string
  disabled?: boolean
  required?: boolean
}

function Field({ label, type, value, onChange, error, autoComplete, disabled, required }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-700 font-medium">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="w-full bg-transparent text-slate-200 border-b border-[#1e2035] focus:border-indigo-500/60 outline-none placeholder:text-slate-700 text-[15px] leading-relaxed transition-colors disabled:opacity-60"
        style={{ padding: '6px 0 8px 0', fontFamily: 'inherit' }}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  )
}
