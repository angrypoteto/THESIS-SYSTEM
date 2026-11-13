import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { siteUrl, supabase } from '../../lib/supabase'
import { passwordProblems } from '../../lib/validation'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
    setBusy(false)
    setSent(true) // same answer whether or not the email has an account
  }

  return (
    <section className="auth-card">
      <h1>Reset your password</h1>
      {sent ? (
        <>
          <p>If an account exists for that email, a one-time reset link is on its way. Open it on this device.</p>
          <p className="banner info" role="note">Don&rsquo;t see it? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder.</p>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="button" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
      <p className="muted">
        <Link to="/signin">Back to sign in</Link>
      </p>
      <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
    </section>
  )
}

export function ResetPassword() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!session) {
    return (
      <section className="auth-card">
        <h1>Reset link expired</h1>
        <p>This reset link is invalid, already used, or was opened on another device.</p>
        <Link className="button" to="/forgot-password">
          Request a new link
        </Link>
        <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
      </section>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const probs = passwordProblems(pw)
    if (probs.length) return setError('Password needs ' + probs.join(', ') + '.')
    if (pw !== confirm) return setError('Passwords do not match.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setError(error.message)
    navigate('/app', { replace: true })
  }

  return (
    <section className="auth-card">
      <h1>Choose a new password</h1>
      <form onSubmit={submit} className="form">
        <label>
          New password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <label>
          Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button">Save password</button>
      </form>
      <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
    </section>
  )
}
