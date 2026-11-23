import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ALL_COURSES, DEPARTMENTS, departmentOf, SHS_SCHOOLS } from '../lib/office'
import { supabase } from '../lib/supabase'

interface Option {
  id: number
  name: string
}

interface ApplicantForm {
  school_id: string
  department: string
  course: string
  year_level: string
  barangay_id: string
  street: string
  address_line: string
  sex: string
  shs_choice: string // one of SHS_SCHOOLS or 'other'
  shs_other: string
}

interface NameForm {
  surname: string
  first_name: string
  middle_name: string
  suffix: string
  birth_date: string
  mobile: string
}

/**
 * The applicant's personal details, asked in the same order and with the same choices as the office's online
 * application (name parts, sex, birthday, contact, barangay, complete address, senior high school, year level,
 * department and course).
 */
export function Profile() {
  const { profile, refreshProfile } = useAuth()
  const { pathname } = useLocation()
  const [schools, setSchools] = useState<Option[]>([])
  const [barangays, setBarangays] = useState<Option[]>([])
  const [n, setN] = useState<NameForm>({ surname: '', first_name: '', middle_name: '', suffix: '', birth_date: '', mobile: '' })
  const [a, setA] = useState<ApplicantForm>({
    school_id: '', department: '', course: '', year_level: '', barangay_id: '', street: '', address_line: '', sex: '',
    shs_choice: '', shs_other: '',
  })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  // Applicant ID (MESO-YYYY-NNNNN): given only when the applicant passes the qualifying exam (client flow v3)
  const [applicantNo, setApplicantNo] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('schools').select('id,name').eq('is_active', true).eq('is_eligible', true).order('name').then(({ data }) => setSchools(data ?? []))
    supabase.from('barangays').select('id,name').in('city', ['Mandaluyong', 'Other']).order('city').order('name').then(({ data }) => setBarangays(data ?? []))
    if (!profile) return
    supabase.from('profiles').select('surname,first_name,middle_name,suffix,birth_date,mobile').eq('id', profile.id).maybeSingle()
      .then(({ data }) => {
        if (data) setN({ surname: data.surname ?? '', first_name: data.first_name ?? '', middle_name: data.middle_name ?? '',
          suffix: data.suffix ?? '', birth_date: data.birth_date ?? '', mobile: data.mobile ?? '' })
      })
    if (profile.role === 'applicant') {
      supabase.from('applications').select('applicant_no').eq('applicant_id', profile.id).not('applicant_no', 'is', null)
        .order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => setApplicantNo(data?.[0]?.applicant_no ?? null))
      supabase.from('applicants').select('*').eq('id', profile.id).maybeSingle().then(({ data }) => {
        if (!data) return
        const shs = data.shs_school ?? ''
        setA({
          school_id: data.school_id?.toString() ?? '',
          department: data.department ?? departmentOf(data.course),
          course: data.course ?? '',
          year_level: data.year_level?.toString() ?? '',
          barangay_id: data.barangay_id?.toString() ?? '',
          street: data.street ?? '',
          address_line: data.address_line ?? '',
          sex: data.sex ?? '',
          shs_choice: !shs ? '' : SHS_SCHOOLS.includes(shs) ? shs : 'other',
          shs_other: SHS_SCHOOLS.includes(shs) ? '' : shs,
        })
      })
    }
  }, [profile])

  if (!profile) return null
  // staff keep their profile inside the staff workspace (sidebar stays in view)
  if (profile.role !== 'applicant' && pathname === '/profile') return <Navigate to="/staff/profile" replace />
  const isApplicant = profile.role === 'applicant'
  const setNf = (k: keyof NameForm) => (e: React.ChangeEvent<HTMLInputElement>) => setN({ ...n, [k]: e.target.value })
  const set = (k: keyof ApplicantForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setA({ ...a, [k]: e.target.value, ...(k === 'department' ? { course: '' } : {}) })
  const courses = DEPARTMENTS.find((d) => d.name === a.department)?.courses ?? []

  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setTried(true)
    if (!n.surname.trim() || !n.first_name.trim()) return setMsg({ kind: 'error', text: 'Surname and first name are required.' })
    if (n.mobile && !/^(09|\+639)\d{9}$/.test(n.mobile.replace(/[\s-]/g, ''))) return setMsg({ kind: 'error', text: 'Enter a PH mobile number (09XXXXXXXXX).' })
    setSaving(true)
    const p = await supabase.from('profiles').update({
      surname: n.surname.trim(), first_name: n.first_name.trim(), middle_name: n.middle_name.trim() || null,
      suffix: n.suffix.trim() || null, birth_date: n.birth_date || null, mobile: n.mobile.replace(/[\s-]/g, '') || null,
    }).eq('id', profile!.id)
    let err = p.error
    if (!err && isApplicant) {
      const shs = a.shs_choice === 'other' ? a.shs_other.trim() : a.shs_choice
      const r = await supabase
        .from('applicants')
        .update({
          school_id: a.school_id ? Number(a.school_id) : null,
          department: a.department || null,
          course: a.course || null,
          year_level: a.year_level ? Number(a.year_level) : null,
          barangay_id: a.barangay_id ? Number(a.barangay_id) : null,
          street: a.street || null,
          address_line: a.address_line || null,
          sex: a.sex || null,
          shs_school: shs || null,
        })
        .eq('id', profile!.id)
      err = r.error
    }
    setSaving(false)
    if (err) setMsg({ kind: 'error', text: err.message })
    else {
      // the profile is complete when every required field has a value (same list as My application)
      const shs = a.shs_choice === 'other' ? a.shs_other.trim() : a.shs_choice
      const complete = Boolean(a.sex && a.barangay_id && a.address_line.trim() && shs && a.school_id && a.year_level && a.department && a.course)
      setMsg({ kind: 'ok', text: isApplicant && complete ? 'Saved. Your profile is complete: you may now proceed to your application.' : 'Saved.' })
      if (isApplicant && complete) {
        setReady(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      refreshProfile()
    }
  }

  // the eight fields the application needs before it opens (same list as My application)
  const required: [keyof ApplicantForm | 'shs', string][] = [['sex', 'Sex'], ['barangay_id', 'Barangay'], ['address_line', 'Complete address'],
    ['shs', 'Senior high school'], ['school_id', 'School'], ['year_level', 'Year level'], ['department', 'College department'], ['course', 'Course']]
  const shsValue = a.shs_choice === 'other' ? a.shs_other.trim() : a.shs_choice
  const isMissing = (k: keyof ApplicantForm | 'shs') => (k === 'shs' ? !shsValue : !String(a[k] ?? '').trim())
  const missing = isApplicant ? required.filter(([k]) => isMissing(k)) : []
  const doneCount = required.length - missing.length
  const pct = doneCount / required.length
  const red = (k: keyof ApplicantForm | 'shs') => ({ 'aria-invalid': tried && isMissing(k) })
  const fromFull = (profile.full_name ?? '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('')
  const initials = (`${n.first_name.charAt(0)}${n.surname.charAt(0)}` || fromFull).toUpperCase() || '?'

  return (
    <div className="profile-page">
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p>{isApplicant ? 'The same details the office’s online application asks for. Your application opens once the required ones are filled in.' : 'Your name and contact details.'}</p>
        </div>
      </div>

      <div className="profile-grid">
        <aside className="profile-side">
          <section className="card profile-summary">
            <span className="avatar-lg" aria-hidden="true">{initials}</span>
            <h2>{[n.first_name, n.surname].filter(Boolean).join(' ') || profile.full_name}</h2>
            <span className="small muted">{profile.student_number ?? ''}</span>
            {isApplicant && (
              <>
                <div className="ring-row" style={{ padding: '8px 0 0' }}>
                  <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
                    <circle cx="29" cy="29" r="24" fill="none" stroke="var(--line)" strokeWidth="7" />
                    <circle cx="29" cy="29" r="24" fill="none" stroke={missing.length ? 'var(--blue)' : 'var(--ok)'} strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - pct)} transform="rotate(-90 29 29)" />
                  </svg>
                  <span><b>{doneCount} of {required.length} required</b><small>{missing.length ? 'Needed before you apply' : 'Complete: you may now proceed to your application'}</small></span>
                </div>
                {missing.length > 0 ? (
                  <ul className="checklist small" style={{ alignSelf: 'stretch' }}>
                    {missing.map(([k, label]) => <li key={k} className={`missing ${tried ? 'missing-now' : ''}`}><span aria-hidden>○</span> {label}</li>)}
                  </ul>
                ) : <Link className="btn btn-block" to="/app/application">Go to my application</Link>}
                <div className="id-box">
                  <span className="small muted">Applicant ID</span>
                  {applicantNo ? <b>{applicantNo}</b> : <span className="small">Given by email when you pass the qualifying exam.</span>}
                </div>
              </>
            )}
          </section>
          <details className="card account-details">
            <summary>Account details</summary>
            <dl className="facts">
              {isApplicant && <><dt>Account ID</dt><dd><code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{profile.id}</code></dd></>}
              <dt>Role</dt><dd>{profile.role}</dd>
              <dt>Privacy consent</dt><dd>{profile.consent_at ? `Version ${profile.consent_version}, ${new Date(profile.consent_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}` : '—'}</dd>
            </dl>
          </details>
        </aside>

        <form className="profile-main" onSubmit={save} noValidate>
          {ready && missing.length === 0 && (
            <section className="card proceed-card" role="status">
              <span className="proceed-tick" aria-hidden="true">✓</span>
              <div>
                <h2>Your profile is complete</h2>
                <p>You may now proceed to your application. Have your RTU Certificate of Registration and grade report ready.</p>
              </div>
              <Link className="btn btn-lg" to="/app/application">Proceed to my application →</Link>
            </section>
          )}
          <section className="card form" aria-labelledby="p-about">
            <h2 id="p-about">About you</h2>
            <div className="row">
              <label>Surname<input value={n.surname} onChange={setNf('surname')} autoComplete="family-name" aria-invalid={tried && !n.surname.trim()} /></label>
              <label>First name<input value={n.first_name} onChange={setNf('first_name')} autoComplete="given-name" aria-invalid={tried && !n.first_name.trim()} /></label>
            </div>
            <div className="row">
              <label>Middle name<input value={n.middle_name} onChange={setNf('middle_name')} autoComplete="additional-name" /></label>
              <label>Suffix<input value={n.suffix} onChange={setNf('suffix')} placeholder="Jr., III (leave blank if none)" /></label>
            </div>
            <div className="row">
              <label>Birthday<input type="date" value={n.birth_date} onChange={setNf('birth_date')} /></label>
              <label>Contact number<input value={n.mobile} onChange={setNf('mobile')} placeholder="09XXXXXXXXX" autoComplete="tel" /></label>
            </div>
            {isApplicant && (
              <fieldset className="seg-field" aria-invalid={tried && isMissing('sex')}>
                <legend>Sex</legend>
                <div className="seg">
                  <label className={a.sex === 'male' ? 'on' : ''}><input type="radio" name="sex" value="male" checked={a.sex === 'male'} onChange={set('sex')} />Male</label>
                  <label className={a.sex === 'female' ? 'on' : ''}><input type="radio" name="sex" value="female" checked={a.sex === 'female'} onChange={set('sex')} />Female</label>
                </div>
                <span className="small muted">Asked because the office&rsquo;s form asks it. Never used to rank applicants.</span>
              </fieldset>
            )}
          </section>

          {isApplicant && (
            <section className="card form" aria-labelledby="p-home">
              <h2 id="p-home">Where you live</h2>
              <label>
                Barangay (Mandaluyong)
                <select value={a.barangay_id} onChange={set('barangay_id')} {...red('barangay_id')}>
                  <option value="">Select your barangay</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label>
                Complete address
                <input value={a.address_line} onChange={set('address_line')} placeholder="House no., street, subdivision" {...red('address_line')} />
              </label>
            </section>
          )}

          {isApplicant && (
            <section className="card form" aria-labelledby="p-school">
              <h2 id="p-school">Your school</h2>
              <label>
                Senior high school
                <select value={a.shs_choice} onChange={set('shs_choice')} {...red('shs')}>
                  <option value="">Select your senior high school</option>
                  {SHS_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="other">Other</option>
                </select>
              </label>
              {a.shs_choice === 'other' && (
                <label>Name of your senior high school<input value={a.shs_other} onChange={set('shs_other')} {...red('shs')} /></label>
              )}
              <div className="row">
                <label>
                  School
                  <select value={a.school_id} onChange={set('school_id')} {...red('school_id')}>
                    <option value="">Select your school</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <span className="small muted">Only students enrolled at RTU can apply</span>
                </label>
                <label>
                  Year level
                  <select value={a.year_level} onChange={set('year_level')} {...red('year_level')}>
                    <option value="">Select</option>
                    <option value="1">1st Year College</option>
                    <option value="2">2nd Year College</option>
                    {a.year_level && Number(a.year_level) > 2 && <option value={a.year_level}>{a.year_level}th year (not covered)</option>}
                  </select>
                  <span className="small muted">Incoming 1st and 2nd year only</span>
                </label>
              </div>
              <div className="row">
                <label>
                  College department
                  <select value={a.department} onChange={set('department')} {...red('department')}>
                    <option value="">Select your department</option>
                    {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </label>
                <label>
                  Course
                  <select value={a.course} onChange={set('course')} {...red('course')}>
                    <option value="">{a.department ? 'Select your course' : 'Choose the department first'}</option>
                    {a.course && !ALL_COURSES.includes(a.course) && <option value={a.course}>{a.course} (not on the list)</option>}
                    {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            </section>
          )}

          <div className="profile-save">
            {msg ? <span className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</span>
              : <span className="small muted">{isApplicant && missing.length ? `${missing.length} required field${missing.length === 1 ? '' : 's'} left. You can save now and finish later.` : 'Changes are saved when you press Save.'}</span>}
            <button className="btn btn-lg" aria-busy={saving} disabled={saving}>{saving ? 'Saving…' : 'Save my profile'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
