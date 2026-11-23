import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { rosterProblems } from '../../lib/validation'
import type { ParentInfo } from '../../lib/office'

// a parent block is complete when marked deceased / not with the family, or with name and occupation (same rule as the database)
const parentOk = (p?: ParentInfo) => !!p && (p.status === 'deceased' || p.status === 'absent' || Boolean(p.name?.trim() && p.occupation?.trim()))

export function SubmitSection({ data, readOnly, reload }: SectionProps) {
  const { app, applicant, members, documents, docTypes } = data
  const [signed, setSigned] = useState(app.truthfulness_signed)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const s = app.ses_inputs

  const checks: [string, boolean][] = [
    ['Enrolled at RTU (school in your profile)', data.schoolEligible],
    ['Profile: sex, complete address, barangay, senior high school, year level, course',
      Boolean(applicant.sex && applicant.address_line && applicant.barangay_id && applicant.shs_school && applicant.year_level && applicant.course)],
    ...(app.stage === 2
      ? ([
          ['Height and weight', app.height_in != null && app.weight_kg != null],
          ['Siblings, order of birth, years in Mandaluyong', app.siblings != null && app.birth_order != null && app.years_in_city != null],
          ['Father’s and mother’s details', parentOk(app.parents?.father) && parentOk(app.parents?.mother)],
          ['Education history and SHS track', Boolean(app.education?.elementary?.school && app.education?.jhs?.school && app.education?.track)],
          ['Three references', (app.character_refs ?? []).filter((r) => r.name?.trim() && r.contact?.trim()).length >= 3],
          ['Voter and other-scholarship questions', app.is_registered_voter != null && app.other_scholarship != null],
          ['Household roster', members.length > 0 && rosterProblems(members).length === 0],
          ['Monthly household income', app.declared_monthly_income != null],
          ['Living conditions', Boolean(s.housing_tenure && s.wall_material && s.water_source && s.parent_education && s.parent_occupation && s.has_electricity !== undefined)],
        ] as [string, boolean][])
      : ([
          ['1st and 2nd semester grades', app.grade_sem1 != null && app.grade_sem2 != null],
          ['General weighted average', app.gwa_declared != null && (applicant.year_level !== 2 || app.shs_gwa != null)],
        ] as [string, boolean][])),
    ...docTypes
      .filter((t) => t.required)
      .map((t): [string, boolean] => [t.name, documents.some((d) => d.type_code === t.code)]),
  ]
  const ready = checks.every(([, ok]) => ok)

  async function submit() {
    setBusy(true)
    setProblems([])
    if (signed !== app.truthfulness_signed) {
      const { error } = await supabase.from('applications').update({ truthfulness_signed: signed }).eq('id', app.id)
      if (error) {
        setBusy(false)
        return setProblems([error.message])
      }
    }
    const { data: res, error } = await supabase.rpc('submit_application', { p_app: app.id })
    setBusy(false)
    if (error) return setProblems([error.message])
    const list = (res as string[]) ?? []
    if (list.length) return setProblems(list)
    await reload()
  }

  return (
    <section className="card">
      <h2>Review and submit</h2>
      <ul className="checklist">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? 'ok' : 'missing'}>
            <span aria-hidden>{ok ? '✓' : '○'}</span> {label}
          </li>
        ))}
      </ul>
      <label className="check mt">
        <input type="checkbox" checked={signed} disabled={readOnly} onChange={(e) => setSigned(e.target.checked)} />
        <span>
          I certify that the information and documents I gave are true and complete. I understand that false information is a
          ground for removal from the program and that the office may verify my answers, including by a home visit.
        </span>
      </label>
      {problems.length > 0 && (
        <ul className="error-list mt" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="save-bar">
          <button aria-busy={busy} className="button" disabled={!ready || !signed || busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit application'}
          </button>
          {!ready && <span className="muted">Complete the items marked ○ first.</span>}
        </div>
      )}
      <p className="muted small">After you submit, the application can no longer be edited.</p>
    </section>
  )
}
