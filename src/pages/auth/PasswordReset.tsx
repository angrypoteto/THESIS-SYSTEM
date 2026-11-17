import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { siteUrl, supabase } from '../../lib/supabase'
import { passwordProblems } from '../../lib/validation'

type ResetAnswer = { status: 'sent' | 'no_account' | 'too_many' | 'error'; message?: string }

/** Asks the password-reset Edge Function to email a one-time link through the office Gmail. */
export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ kind: 'no_account' | 'other'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    const { data, error } = await supabase.functions.invoke('password-reset', { body: { email: email.trim(), redirect_to: siteUrl() } })
    let answer = data as ResetAnswer | null
    if (error) {
      // a non-2xx reply still carries the function's own message
      const ctx = (error as { context?: Response }).context
      answer = (ctx ? await ctx.json().catch(() => null) : null) ?? { status: 'error', message: 'Could not reach the server. Try again.' }
    }
    setBusy(false)
    if (answer?.status === 'sent') return setSent(true)
    if (answer?.status === 'no_account') return setProblem({ kind: 'no_account', text: 'No account uses this email.' })
    setProblem({ kind: 'other', text: answer?.message ?? 'Something went wrong. Try again.' })
  }

  return (
    <section className="auth-card">
      <h1>Reset your password</h1>
      {sent ? (
        <>
          <p>A reset link is on its way to <strong>{email.trim()}</strong>. It works once and expires after one hour. Open it on this device.</p>
          <p className="banner info" role="note">Don&rsquo;t see it? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder.</p>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {problem?.kind === 'no_account' && (
            <div className="banner warn" role="alert">
              <strong>No account uses this email.</strong> Check the spelling, or <Link to="/signup">create an account</Link>.
            </div>
          )}
          {problem?.kind === 'other' && <p className="error" role="alert">{problem.text}</p>}
          <button aria-busy={busy} className="button" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
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
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <section className="auth-card">
        <h1>Checking your reset link…</h1>
        <p className="muted">One moment.</p>
      </section>
    )
  }
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
