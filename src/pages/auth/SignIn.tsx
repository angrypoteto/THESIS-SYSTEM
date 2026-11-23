import { useState, type FormEvent } from 'react'
import { PasswordInput } from '../../components/PasswordInput'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { Logo } from '../../components/Logos'
import { supabase } from '../../lib/supabase'

export function SignIn() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      // the same message for a wrong email and a wrong password (Build Plan 10.5)
      setError(
        error.message.toLowerCase().includes('not confirmed')
          ? 'Please confirm your email first. Look for the confirmation link in your inbox, and in your Spam or Promotions folder.'
          : error.status === 429
            ? 'Too many attempts. Wait a few minutes and try again.'
            : 'Incorrect email or password.',
      )
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <section className="auth-card">
      <div className="auth-card-head">
        <Link to="/" className="auth-home-link" aria-label="Go to the home page" title="Home">
          <Logo which="mandaluyong" size={84} />
        </Link>
        <h1>Sign in</h1>
        <p>Scholarship Portal · City of Mandaluyong</p>
      </div>
      <form onSubmit={submit} className="form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="auth-inline-link"><Link to="/forgot-password">Forgot password?</Link></p>
        <button aria-busy={busy} className="btn btn-lg btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-switch">
          New applicant? <Link to="/signup">Create an account</Link>
        </p>
      </form>
      <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
    </section>
  )
}
