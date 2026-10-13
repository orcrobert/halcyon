import { useEffect, useRef, useState } from 'react'
import { options as authOptions } from '../api/auth'
import { extractErrors, type ValidationErrors } from '../api/errors'
import { useAuth } from '../auth/context'
import { Logo } from './Logo'

type Mode = 'login' | 'register'

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
            <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent) 0%, transparent)' }} />
            <stop offset="50%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent-bright) 90%, transparent)' }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent) 0%, transparent)' }} />
          </linearGradient>
          <filter id="auth-bw-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b1" />
            <feGaussianBlur stdDeviation="2" result="b2" />
            <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /></feMerge>
          </filter>
        </defs>
        <path data-glow d={path} stroke="url(#auth-bw-grad)" strokeWidth="10" fill="none" strokeLinecap="round" filter="url(#auth-bw-glow)" opacity="0.18" />
        <path d={path} stroke="url(#auth-bw-grad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={path} strokeWidth="0.4" fill="none" strokeLinecap="round" opacity="0.35" style={{ stroke: 'color-mix(in srgb, var(--color-wash) 60%, transparent)' }} />
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
  const [registration, setRegistration] = useState(true)

  useEffect(() => {
    let cancelled = false
    authOptions()
      .then((res) => {
        if (cancelled) return
        setRegistration(res.registration)
        if (!res.registration) setMode('login')
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  async function onSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)
    setFieldErrors({})

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        if (password !== passwordConfirm) {
          setFieldErrors({ password_confirmation: ['The passwords do not match.'] })
          return
        }
        await register({ name, email, password })
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

        <Logo
          size={26}
          tagline={
            isRegister
              ? 'Make an account to start composing.'
              : 'Sign in to return to your atmospheres.'
          }
        />

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div
            className="rounded-2xl border border-line bg-surface transition-opacity"
            style={{ boxShadow: '0 25px 50px color-mix(in srgb, var(--color-shade) 40%, transparent)', opacity: submitting ? 0.6 : 1 }}
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
              {registration ? (
                <button
                  type="button"
                  onClick={() => switchMode(isRegister ? 'login' : 'register')}
                  className="text-[11px] text-ink-ghost hover:text-ink-dim transition-colors"
                >
                  {isRegister ? 'Have an account? Sign in' : 'New here? Sign up'}
                </button>
              ) : (
                <span className="text-[11px] text-ink-ghost">Ask your administrator for an account.</span>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 text-wash text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: submitting ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)' : 'var(--color-accent)',
                  fontFamily: 'inherit',
                }}
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-wash rounded-full animate-bounce"
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
            <p className="text-center text-danger text-sm">{errorMessage}</p>
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
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-ghost font-medium">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="w-full bg-transparent text-ink border-b border-line focus:border-accent/60 outline-none placeholder:text-ink-ghost text-[15px] leading-relaxed transition-colors disabled:opacity-60"
        style={{ padding: '6px 0 8px 0', fontFamily: 'inherit' }}
      />
      {error && <span className="text-xs text-danger-bright">{error}</span>}
    </label>
  )
}
