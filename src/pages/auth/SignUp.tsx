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
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [existing, setExisting] = useState<'email' | 'student' | null>(null)

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: string[] = []
    if (!f.consent) errs.push('Please read the privacy notice and give your consent.')
    if (!f.surname.trim()) errs.push('Enter your surname.')
    if (!f.first_name.trim()) errs.push('Enter your first name.')
    if (!f.middle_name.trim()) errs.push('Enter your middle name (as on your school records).')
    if (!/^[\w-]{3,30}$/.test(f.student_number.trim())) errs.push('Enter a valid student number (letters, digits, dash).')
    if (!f.birth_date) errs.push('Enter your birth date.')
    if (!/^(09|\+639)\d{9}$/.test(f.mobile.replace(/[\s-]/g, ''))) errs.push('Enter a PH mobile number (09XXXXXXXXX).')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.push('Enter a valid email address.')
    const pw = passwordProblems(f.password)
    if (pw.length) errs.push('Password needs ' + pw.join(', ') + '.')
    if (f.password !== f.confirm) errs.push('Passwords do not match.')
    setErrors(errs)
    setExisting(null)
    if (errs.length) return

    setBusy(true)
    const { data: available, error: rpcErr } = await supabase.rpc('student_number_available', {
      p_student_number: f.student_number.trim(),
    })
    if (rpcErr || available === false) {
      setBusy(false)
      if (rpcErr) setErrors(['Could not reach the server. Try again.'])
      else setExisting('student')
      return
    }
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
      setErrors([error.message])
      return
    }
    // For an email that already has an account, Supabase sends no email and returns a user with no identities.
    if (signed.user && (signed.user.identities?.length ?? 0) === 0) return setExisting('email')
    navigate('/check-email', { state: { email: f.email.trim() } })
  }

  return (
    <section className="auth-card wide">
      <div className="auth-card-head">
        <Link to="/" className="auth-logos auth-home-link" aria-label="Go to the home page" title="Home">
          <Logo which="mandaluyong" size={60} /><Logo which="rtu" size={60} />
        </Link>
        <h1>Create an applicant account</h1>
        <p>For RTU students applying to the City of Mandaluyong scholarship. Staff accounts are created by an administrator.</p>
      </div>
      <PrivacyNotice />
      <form onSubmit={submit} className="form" noValidate>
        <label className="check">
          <input type="checkbox" checked={f.consent} onChange={set('consent')} />I have read the privacy notice and I agree to
          the processing of my personal data for selecting scholarship beneficiaries (notice version {CONSENT_VERSION}).
        </label>
        <div className="row">
          <label>
            Surname
            <input value={f.surname} onChange={set('surname')} autoComplete="family-name" />
          </label>
          <label>
            First name
            <input value={f.first_name} onChange={set('first_name')} autoComplete="given-name" />
          </label>
        </div>
        <div className="row">
          <label>
            Middle name
            <input value={f.middle_name} onChange={set('middle_name')} autoComplete="additional-name" />
          </label>
          <label>
            Suffix <span className="small muted">(optional)</span>
            <input value={f.suffix} onChange={set('suffix')} placeholder="Jr., III" />
          </label>
        </div>
        <div className="row">
          <label>
            Student number
            <input value={f.student_number} onChange={set('student_number')} />
          </label>
          <label>
            Birth date
            <input type="date" value={f.birth_date} onChange={set('birth_date')} />
          </label>
        </div>
        <div className="row">
          <label>
            Mobile number
            <input value={f.mobile} onChange={set('mobile')} placeholder="09XXXXXXXXX" autoComplete="tel" />
          </label>
          <label>
            Email
            <input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
          </label>
        </div>
        <div className="row">
          <label>
            Password
            <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
          </label>
          <label>
            Confirm password
            <input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </label>
        </div>
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
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button aria-busy={busy} className="btn btn-lg btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </form>
      <p className="auth-card-copy">© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</p>
    </section>
  )
}
