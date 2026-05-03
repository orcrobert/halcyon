import { useState } from 'react'
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
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">
      <div className="flex flex-col gap-12 w-full" style={{ maxWidth: '440px' }}>

        {/* Header */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.12em] text-indigo-400 font-semibold">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            <h1 className="text-[42px] font-extrabold text-white leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              Soundscape Generator
            </h1>
            <p className="text-[15px] text-slate-500 leading-relaxed mx-auto" style={{ maxWidth: '360px' }}>
              {isRegister
                ? 'Sign up to generate, mix, and save AI-crafted soundscapes.'
                : 'Sign in to continue your soundscape sessions.'}
            </p>
          </div>
        </div>

        {/* Form card */}
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
                {isRegister ? 'Have an account? Sign in' : "New here? Sign up"}
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
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-700 font-semibold">
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
