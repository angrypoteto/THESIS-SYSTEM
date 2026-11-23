import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logos'
import { CONSENT_VERSION, siteUrl, supabase } from '../../lib/supabase'
import { passwordProblems } from '../../lib/validation'
import { PrivacyNotice } from './PrivacyNotice'

interface Form {
  surname: string
  first_name: string
  middle_name: string
  suffix: string
  student_number: string
  birth_date: string
  mobile: string
  email: string
  password: string
  confirm: string
  consent: boolean
}

const empty: Form = {
  surname: '',
  first_name: '',
  middle_name: '',
  suffix: '',
  student_number: '',
  birth_date: '',
  mobile: '',
  email: '',
  password: '',
  confirm: '',
  consent: false,
}

export function SignUp() {
  const [f, setF] = useState<Form>(empty)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [bad, setBad] = useState<Partial<Record<keyof Form, string>>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [existing, setExisting] = useState<'email' | 'student' | null>(null)
  const [emailProblem, setEmailProblem] = useState<{ reason: string; suggestion: string | null } | null>(null)

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
    if (bad[k]) setBad({ ...bad, [k]: undefined })
  }
  const err = (k: keyof Form) => (bad[k] ? <span className="field-error" role="alert">{bad[k]}</span> : null)
  const inv = (k: keyof Form) => ({ 'aria-invalid': Boolean(bad[k]) })

  /** Screen 1: the email, checked before anything is sent to it. */
  async function nextFromEmail() {
    setEmailProblem(null)
    setExisting(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setBad({ email: 'Enter a valid email address, like juan.delacruz@gmail.com.' })
    setBusy(true)
    const { data: check } = await supabase.functions.invoke('check-email', { body: { email: f.email.trim() } })
    setBusy(false)
    const verdict = check as { ok: boolean; reason?: string; suggestion?: string | null } | null
    if (verdict && verdict.ok === false) {
      return setEmailProblem({ reason: verdict.reason ?? 'This email address cannot be used.', suggestion: verdict.suggestion ?? null })
    }
    setStep(2)
  }

  /** Screen 2: who you are; the student number must not have an account yet. */
  async function nextFromAbout() {
    const b: Partial<Record<keyof Form, string>> = {}
    if (!f.surname.trim()) b.surname = 'Enter your surname.'
    if (!f.first_name.trim()) b.first_name = 'Enter your first name.'
    if (!f.middle_name.trim()) b.middle_name = 'Enter your middle name, as on your school records.'
    if (!/^[\w-]{3,30}$/.test(f.student_number.trim())) b.student_number = 'Enter your RTU student number (letters, digits, dash).'
    if (!f.birth_date) b.birth_date = 'Enter your birth date.'
    if (!/^(09|\+639)\d{9}$/.test(f.mobile.replace(/[\s-]/g, ''))) b.mobile = 'Enter a PH mobile number, like 09171234567.'
    setBad(b)
    setExisting(null)
    if (Object.keys(b).length) return
    setBusy(true)
    const { data: available, error: rpcErr } = await supabase.rpc('student_number_available', { p_student_number: f.student_number.trim() })
    setBusy(false)
    if (rpcErr) return setErrors(['Could not reach the server. Try again.'])
    if (available === false) return setExisting('student')
    setErrors([])
    setStep(3)
  }

  /** Screen 3: password and consent, then the account is created. */
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (step === 1) return nextFromEmail()
    if (step === 2) return nextFromAbout()
    const b: Partial<Record<keyof Form, string>> = {}
    const pw = passwordProblems(f.password)
    if (pw.length) b.password = 'Your password needs ' + pw.join(', ') + '.'
    if (!b.password && f.password !== f.confirm) b.confirm = 'The two passwords do not match.'
    if (!f.consent) b.consent = 'Tick the box to agree to the privacy notice.'
    setBad(b)
    setErrors([])
    setExisting(null)
    if (Object.keys(b).length) return
    setBusy(true)
    const { data: signed, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        emailRedirectTo: siteUrl() + '?welcome=1', // the confirmation link opens the Welcome page
        data: {
          surname: f.surname.trim(),
          first_name: f.first_name.trim(),
          middle_name: f.middle_name.trim(),
          suffix: f.suffix.trim(),
          student_number: f.student_number.trim(),
          birth_date: f.birth_date,
          mobile: f.mobile.replace(/[\s-]/g, ''),
          consent_version: CONSENT_VERSION,
        },
      },
    })
    setBusy(false)
    if (error) {
      if (/already registered|already been registered|already exists/i.test(error.message)) return setExisting('email')
      if (/email not accepted/i.test(error.message)) { setStep(1); return setEmailProblem({ reason: error.message.replace(/^.*email not accepted:\s*/i, ''), suggestion: null }) }
      setErrors([error.message])
      return
    }
    // For an email that already has an account, Supabase sends no email and returns a user with no identities.
    if (signed.user && (signed.user.identities?.length ?? 0) === 0) return setExisting('email')
    navigate('/check-email', { state: { email: f.email.trim() } })
  }

  const TITLES = { 1: 'What is your email?', 2: 'Tell us about you', 3: 'Choose a password' } as const
  const NOTES = {
    1: 'We send the confirmation and every notice from the office here. Use one you open often.',
    2: 'Write your name exactly as on your RTU records.',
    3: 'At least 8 characters, with letters and numbers.',
  } as const

  return (
    <section className="auth-card wide">
      <div className="auth-card-head">
        <Link to="/" className="auth-logos auth-home-link" aria-label="Go to the home page" title="Home">
          <Logo which="mandaluyong" size={52} /><Logo which="meso" size={52} />
        </Link>
      </div>
      <ol className="steps3" aria-label="Sign-up steps">
        {(['Email', 'About you', 'Password'] as const).map((t, i) => (
          <li key={t} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
            {i + 1 < step ? '✓ ' : `${i + 1} · `}{t}
          </li>
        ))}
      </ol>
      <h1 style={{ marginTop: 14 }}>{TITLES[step]}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{NOTES[step]}</p>

      <form onSubmit={submit} className="form" noValidate>
        {step === 1 && (
          <>
            <label>
              Email address
              <input type="email" value={f.email} onChange={set('email')} autoComplete="email" autoFocus {...inv('email')} />
              {err('email')}
            </label>
            {emailProblem && (
              <div className="banner warn" role="alert">
                <strong>Check your email address.</strong> {emailProblem.reason}
                {emailProblem.suggestion && (
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-plain" onClick={() => { setF({ ...f, email: emailProblem.suggestion! }); setEmailProblem(null) }}>
                      Use {emailProblem.suggestion}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="row">
              <label>Surname<input value={f.surname} onChange={set('surname')} autoComplete="family-name" autoFocus {...inv('surname')} />{err('surname')}</label>
              <label>First name<input value={f.first_name} onChange={set('first_name')} autoComplete="given-name" {...inv('first_name')} />{err('first_name')}</label>
            </div>
            <div className="row">
              <label>Middle name<input value={f.middle_name} onChange={set('middle_name')} autoComplete="additional-name" {...inv('middle_name')} />{err('middle_name')}</label>
              <label>Suffix <span className="small muted">(optional)</span><input value={f.suffix} onChange={set('suffix')} placeholder="Jr., III" /></label>
            </div>
            <div className="row">
              <label>RTU student number<input value={f.student_number} onChange={set('student_number')} {...inv('student_number')} />{err('student_number')}</label>
              <label>Birth date<input type="date" value={f.birth_date} onChange={set('birth_date')} {...inv('birth_date')} />{err('birth_date')}</label>
            </div>
            <label>Mobile number<input value={f.mobile} onChange={set('mobile')} placeholder="09XXXXXXXXX" autoComplete="tel" {...inv('mobile')} />{err('mobile')}</label>
          </>
        )}

        {step === 3 && (
          <>
            <div className="row">
              <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" autoFocus {...inv('password')} />{err('password')}</label>
              <label>Type it again<input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" {...inv('confirm')} />{err('confirm')}</label>
            </div>
            <PrivacyNotice />
            <label className="check" style={bad.consent ? { color: 'var(--error)' } : undefined}>
              <input type="checkbox" checked={f.consent} onChange={set('consent')} {...inv('consent')} />I have read the privacy notice and I agree to
              the processing of my personal data for selecting scholarship beneficiaries (notice version {CONSENT_VERSION}).
            </label>
            {err('consent')}
          </>
        )}

        {existing && (
          <div className="banner warn" role="alert">
            <strong>{existing === 'email' ? 'This email already has an account.' : 'This student number already has an account.'}</strong> Sign in with it, or reset the password if you forgot it.
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Link className="btn" to="/signin">Sign in</Link>
              <Link className="btn btn-plain" to="/forgot-password">Forgot password</Link>
            </div>
          </div>
        )}
        {errors.length > 0 && (
          <ul className="error-list" role="alert">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        <div className="auth-actions">
          {step > 1 && <button type="button" className="btn btn-plain btn-lg" onClick={() => { setBad({}); setStep((step - 1) as 1 | 2) }}>Back</button>}
          <button aria-busy={busy} className="btn btn-lg" style={{ flex: 1 }} disabled={busy}>
            {busy ? (step === 3 ? 'Creating your account…' : 'Checking…') : step === 3 ? 'Create my account' : 'Continue'}
          </button>
        </div>
        <p className="auth-switch">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </form>
      <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
    </section>
  )
}
