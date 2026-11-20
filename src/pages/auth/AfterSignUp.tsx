import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { Logo } from '../../components/Logos'
import { siteUrl, supabase } from '../../lib/supabase'

const LAST_EMAIL = 'signup-email'
const copy = <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>

/** Shown right after sign-up: where the confirmation email went, what to do, and a way to send it again. */
export function CheckEmail() {
  const state = useLocation().state as { email?: string } | null
  const [email] = useState(() => {
    const e = state?.email ?? (() => { try { return sessionStorage.getItem(LAST_EMAIL) } catch { return null } })() ?? ''
    try { if (e) sessionStorage.setItem(LAST_EMAIL, e) } catch { /* private window */ }
    return e
  })
  const [wait, setWait] = useState(60)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // a short wait before "Send again", so the email has time to arrive (and Gmail's limits are respected)
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function resend() {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl() + '?welcome=1' } })
    setBusy(false)
    setWait(60)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Sent again. Check your inbox and Spam folder.' })
  }

  return (
    <section className="auth-card">
      <div className="auth-card-head">
        <Link to="/" className="auth-logos auth-home-link" aria-label="Go to the home page" title="Home">
          <Logo which="mandaluyong" size={56} /><Logo which="meso" size={56} />
        </Link>
        <h1>Check your email</h1>
        <p>One more step to create your account.</p>
      </div>
      <p>
        We sent a confirmation link to {email ? <strong>{email}</strong> : 'your email address'}. Open the email and click
        the confirmation link on this device. The link works once.
      </p>
      <ol className="next-steps">
        <li><strong>Confirm your email</strong> with the link we sent.</li>
        <li><strong>Complete your profile</strong>: school, course, year level and barangay.</li>
        <li><strong>Submit step 1</strong>: your grades, RTU registration form and grade report, before the deadline.</li>
      </ol>
      <p className="banner info" role="note">
        <strong>Don&rsquo;t see it?</strong> Check your <strong>Spam</strong> or <strong>Promotions</strong> folder. If it is there, mark it
        &ldquo;Not spam&rdquo; so the portal&rsquo;s exam schedule and result emails reach your inbox.
      </p>
      {email && (
        <button aria-busy={busy} className="btn btn-plain btn-block" disabled={busy || wait > 0} onClick={resend}>
          {busy ? 'Sending…' : wait > 0 ? `Send the email again (${wait}s)` : 'Send the email again'}
        </button>
      )}
      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
      <p className="auth-switch">Already confirmed? <Link to="/signin">Sign in</Link></p>
      {copy}
    </section>
  )
}

/** Shown when the person opens the confirmation link: the account is ready, and what to do next. */
export function Welcome() {
  const { session, profile, loading } = useAuth()
  useEffect(() => { try { sessionStorage.removeItem(LAST_EMAIL) } catch { /* ignore */ } }, [])
  if (loading) return <section className="card narrow"><h1>One moment…</h1></section>
  if (!session) {
    return (
      <section className="card narrow">
        <h1>Your email is confirmed</h1>
        <p>Sign in with your email and password to continue.</p>
        <Link className="btn btn-lg" to="/signin">Sign in</Link>
      </section>
    )
  }
  const first = profile?.full_name?.split(' ')[0]
  return (
    <section className="card narrow welcome-card">
      <p className="pill ok" style={{ marginTop: 0 }}>Email confirmed</p>
      <h1>Welcome{first ? `, ${first}` : ''}! Your account is ready.</h1>
      <p>You can now apply to the City of Mandaluyong Scholarship Program for RTU students. Here is what to do next:</p>
      <ol className="next-steps">
        <li><strong>Complete your profile</strong>: sex, address and barangay, senior high school, year level, department and course.</li>
        <li><strong>Step 1</strong>: enter your grades and upload your RTU registration form (COR) and your grade report. Then submit.</li>
        <li><strong>Qualifying exam</strong>: if the office clears your step 1, you are emailed the exam schedule.</li>
      </ol>
      <div className="actions">
        <Link className="btn btn-lg" to="/profile">Complete my profile</Link>
        <Link className="btn btn-plain" to="/app">Go to my dashboard</Link>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>Your answers are saved as you go, so you can stop and come back anytime before the deadline.</p>
    </section>
  )
}
