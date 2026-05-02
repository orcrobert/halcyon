import { useState, type FormEvent } from 'react'
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

  async function onSubmit(e: FormEvent) {
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

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium text-white/90 mb-1">
          {mode === 'login' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="text-white/40 text-sm mb-8">
          Soundscape Generator
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'register' && (
            <Field
              label="Name"
              type="text"
              value={name}
              onChange={setName}
              error={fieldError('name')}
              autoComplete="name"
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
            required
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            error={fieldError('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />

          {mode === 'register' && (
            <Field
              label="Confirm password"
              type="password"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
              required
            />
          )}

          {errorMessage && Object.keys(fieldErrors).length === 0 && (
            <div className="text-sm text-red-400">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 text-sm font-medium text-white transition"
          >
            {submitting ? '…' : mode === 'login' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setErrorMessage(null)
            setFieldErrors({})
          }}
          className="mt-6 text-sm text-white/50 hover:text-white/80 transition"
        >
          {mode === 'login'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
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
  required?: boolean
}

function Field({ label, type, value, onChange, error, autoComplete, required }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-md bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 px-3 py-2 text-sm text-white/90 placeholder-white/30 transition"
      />
      {error && <span className="block mt-1 text-xs text-red-400">{error}</span>}
    </label>
  )
}
