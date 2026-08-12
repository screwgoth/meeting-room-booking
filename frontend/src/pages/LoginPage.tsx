import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.isAuth
          ? 'Invalid username or password.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-grad-brand text-white shadow">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Meeting Rooms
            </h1>
            <p className="mt-1 text-sm text-ink-2">Sign in to find and book a room.</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border bg-surface p-6 shadow-sm"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-ink"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="username">
            Username
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4"
          />

          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-5"
          />

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? <Spinner /> : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-3">
          Demo: <span className="tnum">employee / password</span>
        </p>
      </div>
    </div>
  )
}
