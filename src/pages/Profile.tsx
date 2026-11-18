import { useEffect, useState, type FormEvent } from 'react'
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
  const [schools, setSchools] = useState<Option[]>([])
  const [barangays, setBarangays] = useState<Option[]>([])
  const [n, setN] = useState<NameForm>({ surname: '', first_name: '', middle_name: '', suffix: '', birth_date: '', mobile: '' })
  const [a, setA] = useState<ApplicantForm>({
    school_id: '', department: '', course: '', year_level: '', barangay_id: '', street: '', address_line: '', sex: '',
    shs_choice: '', shs_other: '',
  })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
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
  const isApplicant = profile.role === 'applicant'
  const setNf = (k: keyof NameForm) => (e: React.ChangeEvent<HTMLInputElement>) => setN({ ...n, [k]: e.target.value })
  const set = (k: keyof ApplicantForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setA({ ...a, [k]: e.target.value, ...(k === 'department' ? { course: '' } : {}) })
  const courses = DEPARTMENTS.find((d) => d.name === a.department)?.courses ?? []

  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!n.surname.trim() || !n.first_name.trim()) return setMsg({ kind: 'error', text: 'Surname and first name are required.' })
    if (n.mobile && !/^(09|\+639)\d{9}$/.test(n.mobile.replace(/[\s-]/g, ''))) return setMsg({ kind: 'error', text: 'Enter a PH mobile number (09XXXXXXXXX).' })
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
    if (err) setMsg({ kind: 'error', text: err.message })
    else {
      setMsg({ kind: 'ok', text: 'Saved.' })
      refreshProfile()
    }
  }

  return (
    <section className="card narrow">
      <h1>My profile</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {isApplicant ? 'The same details the office’s online application asks for. Fill them in before you start your application.' : ''}
      </p>
      <dl className="facts">
        {isApplicant && <>
          <dt>Applicant ID</dt>
          <dd>{applicantNo
            ? <strong>{applicantNo}</strong>
            : <span className="muted">Not yet. You receive it by email when you pass the qualifying exam.</span>}</dd>
          <dt>Account ID</dt>
          <dd><code style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>{profile.id}</code></dd>
        </>}
        <dt>Student number</dt>
        <dd>{profile.student_number ?? '—'}</dd>
        <dt>Role</dt>
        <dd>{profile.role}</dd>
        <dt>Consent</dt>
        <dd>{profile.consent_at ? `version ${profile.consent_version}, ${new Date(profile.consent_at).toLocaleString()}` : '—'}</dd>
      </dl>
      <form className="form" onSubmit={save}>
        <div className="row">
          <label>Surname<input value={n.surname} onChange={setNf('surname')} autoComplete="family-name" /></label>
          <label>First name<input value={n.first_name} onChange={setNf('first_name')} autoComplete="given-name" /></label>
        </div>
        <div className="row">
          <label>Middle name<input value={n.middle_name} onChange={setNf('middle_name')} autoComplete="additional-name" /></label>
          <label>Suffix <span className="small muted">(Jr., III; leave blank if none)</span><input value={n.suffix} onChange={setNf('suffix')} /></label>
        </div>
        <div className="row">
          <label>Birthday<input type="date" value={n.birth_date} onChange={setNf('birth_date')} /></label>
          <label>Contact number<input value={n.mobile} onChange={setNf('mobile')} placeholder="09XXXXXXXXX" autoComplete="tel" /></label>
        </div>
        {isApplicant && (
          <>
            <fieldset className="radio-row">
              <legend>Sex</legend>
              <label><input type="radio" name="sex" value="male" checked={a.sex === 'male'} onChange={set('sex')} /> Male</label>
              <label><input type="radio" name="sex" value="female" checked={a.sex === 'female'} onChange={set('sex')} /> Female</label>
              <span className="small muted">Asked because the office&rsquo;s form asks it. Never used to rank applicants.</span>
            </fieldset>
            <label>
              Barangay (Mandaluyong)
              <select value={a.barangay_id} onChange={set('barangay_id')}>
                <option value="">Select your barangay</option>
                {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>
              Complete address <span className="small muted">(house no., street, subdivision)</span>
              <input value={a.address_line} onChange={set('address_line')} />
            </label>
            <label>
              Senior high school
              <select value={a.shs_choice} onChange={set('shs_choice')}>
                <option value="">Select your senior high school</option>
                {SHS_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="other">Other</option>
              </select>
            </label>
            {a.shs_choice === 'other' && (
              <label>Name of your senior high school<input value={a.shs_other} onChange={set('shs_other')} /></label>
            )}
            <label>
              School
              <span className="small muted">Only students enrolled at RTU can apply</span>
              <select value={a.school_id} onChange={set('school_id')}>
                <option value="">Select your school</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              Year level
              <span className="small muted">Only incoming 1st and 2nd year college can apply</span>
              <select value={a.year_level} onChange={set('year_level')}>
                <option value="">Select</option>
                <option value="1">1st Year College</option>
                <option value="2">2nd Year College</option>
                {a.year_level && Number(a.year_level) > 2 && <option value={a.year_level}>{a.year_level}th year (not covered)</option>}
              </select>
            </label>
            <div className="row">
              <label>
                College department
                <select value={a.department} onChange={set('department')}>
                  <option value="">Select your department</option>
                  {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </label>
              <label>
                Course
                <select value={a.course} onChange={set('course')} disabled={!a.department}>
                  <option value="">{a.department ? 'Select your course' : 'Choose the department first'}</option>
                  {a.course && !ALL_COURSES.includes(a.course) && <option value={a.course}>{a.course} (not on the list)</option>}
                  {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <p className="muted small">You will pin your home on a map in step 2 of the application.</p>
          </>
        )}
        {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</p>}
        <button className="button">Save</button>
      </form>
    </section>
  )
}
