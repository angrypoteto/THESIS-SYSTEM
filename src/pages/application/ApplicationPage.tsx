import { useCallback, useEffect, useState } from 'react'
import { SkeletonPage } from '../../components/Skeleton'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { departmentOf } from '../../lib/office'
import { supabase } from '../../lib/supabase'
import type { ApplicantRow, Application, DocumentRow, DocumentType, HouseholdMember, ProgramCycle } from '../../lib/types'
import { DocumentsSection } from './DocumentsSection'
import { HouseholdSection } from './HouseholdSection'
import { LivingSection } from './LivingSection'
import { LocationSection } from './LocationSection'
import { EducationSection } from './EducationSection'
import { GradesSection } from './GradesSection'
import { InfoSheetSection } from './InfoSheetSection'
import { StatusView } from './StatusView'
import { SubmitSection } from './SubmitSection'

export interface AppData {
  cycle: ProgramCycle
  app: Application
  applicant: ApplicantRow
  members: HouseholdMember[]
  documents: DocumentRow[]
  docTypes: DocumentType[]
  schoolScale: 'percent' | 'one_to_five' | null
  /** client rule 2026-11-07: only students enrolled at RTU (an eligible school) may apply */
  schoolEligible: boolean
}

export interface SectionProps {
  data: AppData
  readOnly: boolean
  reload: () => Promise<void>
}

const STEPS = [
  { key: 'school', label: 'Grades' },
  { key: 'info', label: 'Personal & family' },
  { key: 'education', label: 'Education & references' },
  { key: 'household', label: 'Household & income' },
  { key: 'living', label: 'Living conditions' },
  { key: 'location', label: 'Home location' },
  { key: 'documents', label: 'Documents' },
  { key: 'submit', label: 'Review & submit' },
] as const
type StepKey = (typeof STEPS)[number]['key']
/** client flow v2: step 1 = screening before the exam, step 2 = requirements for exam passers */
const STAGE_STEPS: Record<1 | 2, StepKey[]> = {
  // step 1 = the office's online application; step 2 = its Scholar / Grantee Information Sheet, plus what the
  // ranking needs (household, living conditions) and the step 2 documents
  1: ['school', 'documents', 'submit'],
  2: ['info', 'education', 'household', 'living', 'documents', 'submit'],
}

export function ApplicationPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<AppData | null>(null)
  const [step, setStep] = useState<StepKey>('school')
  const [needDone, setNeedDone] = useState(false)
  // the profile must be complete before the application opens (owner, Nov 24)
  const [missing, setMissing] = useState<string[] | null>(null)
  useEffect(() => {
    if (!profile) return
    supabase.from('applicants').select('sex,address_line,barangay_id,shs_school,school_id,year_level,department,course').eq('id', profile.id).maybeSingle()
      .then(({ data: a }) => {
        const p = (a ?? {}) as Record<string, unknown>
        const need: [string, string][] = [['sex', 'Sex'], ['barangay_id', 'Barangay'], ['address_line', 'Complete address'],
          ['shs_school', 'Senior high school'], ['school_id', 'School (RTU)'], ['year_level', 'Year level'], ['department', 'College department'], ['course', 'Course']]
        // the department follows from the course when it was not saved separately (older profiles)
        if (!p.department && p.course) p.department = departmentOf(String(p.course)) || null
        setMissing(need.filter(([k]) => p[k] == null || p[k] === '').map(([, label]) => label))
      })
  }, [profile])

  const load = useCallback(async () => {
    if (!profile) return
    const { data: cycles } = await supabase
      .from('program_cycles')
      .select('*')
      .in('status', ['open', 'closed', 'ranked', 'finalized'])
      .order('opens_at', { ascending: false })
      .limit(1)
    const c = (cycles?.[0] as ProgramCycle) ?? null
    setCycle(c)
    if (!c) return setLoading(false)
    const now = Date.now()
    setIsOpen(c.status === 'open' && now >= Date.parse(c.opens_at) && now <= Date.parse(c.closes_at))

    const [appRes, applicantRes, typesRes] = await Promise.all([
      supabase.from('applications').select('*').eq('cycle_id', c.id).eq('applicant_id', profile.id).maybeSingle(),
      supabase.from('applicants').select('*').eq('id', profile.id).single(),
      supabase.from('document_types').select('code,name,required,stage,required_when').order('required', { ascending: false }),
    ])
    if (applicantRes.error) {
      setError(applicantRes.error.message)
      return setLoading(false)
    }
    const app = appRes.data as Application | null
    if (!app) {
      setData(null)
      return setLoading(false)
    }
    const applicant = applicantRes.data as ApplicantRow
    const [membersRes, docsRes, schoolRes] = await Promise.all([
      supabase.from('household_members').select('*').eq('application_id', app.id).order('id'),
      supabase.from('documents').select('*').eq('application_id', app.id).eq('is_current', true),
      applicant.school_id
        ? supabase.from('schools').select('grading_scale,is_eligible').eq('id', applicant.school_id).single()
        : Promise.resolve({ data: null }),
    ])
    setData({
      cycle: c,
      app,
      applicant,
      members: (membersRes.data as HouseholdMember[]) ?? [],
      documents: (docsRes.data as DocumentRow[]) ?? [],
      docTypes: ((typesRes.data as DocumentType[]) ?? []).filter((t) => t.stage === app.stage),
      schoolScale: (schoolRes.data as { grading_scale: 'percent' | 'one_to_five' } | null)?.grading_scale ?? null,
      schoolEligible: Boolean((schoolRes.data as { is_eligible?: boolean } | null)?.is_eligible),
    })
    setLoading(false)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  async function start() {
    if (!profile || !cycle) return
    const { error } = await supabase.from('applications').insert({ applicant_id: profile.id, cycle_id: cycle.id })
    if (error) setError(error.message)
    else {
      setError(null)
      load()
    }
  }

  if (loading || missing == null) return <SkeletonPage cards={2} side />
  if (missing.length > 0 && (!data || (data.app.status === 'draft' && (data.app.stage ?? 1) === 1))) {
    return (
      <section className="card narrow profile-first">
        <span className="eyebrow">Before you apply</span>
        <h1>Complete your profile first</h1>
        <p className="muted">The application uses your school, course and address from your profile. Fill in these {missing.length === 1 ? 'one' : missing.length} and come back:</p>
        <ul className="checklist">
          {missing.map((m) => <li key={m} className="missing missing-now"><span aria-hidden>○</span> {m}</li>)}
        </ul>
        <Link className="btn btn-lg" to="/profile">Complete my profile</Link>
      </section>
    )
  }
  if (error) return <p className="error">{error}</p>
  if (!cycle) {
    return (
      <section className="card">
        <h1>Application</h1>
        <p>No application period is open right now.</p>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="card narrow">
        <h1>{cycle.name}</h1>
        <p>
          {cycle.school_year}, {cycle.term}. Applications close on {new Date(cycle.closes_at).toLocaleDateString('en-PH')}.
        </p>
        {isOpen ? (
          <>
            <p className="muted">
              You can save each part and come back later. Nothing is sent to the office until you press Submit on the last step.
            </p>
            <button className="button" onClick={start}>
              Start my application
            </button>
          </>
        ) : (
          <p className="error">The application period is closed.</p>
        )}
      </section>
    )
  }

  if (data.app.status !== 'draft') return <StatusView data={data} reload={load} />

  const stage = data.app.stage ?? 1
  const steps = STEPS.filter((s) => STAGE_STEPS[stage].includes(s.key))
  const now = Date.now()
  const step2Open = ['open', 'closed'].includes(cycle.status) && (!cycle.step2_closes_at || now <= Date.parse(cycle.step2_closes_at))
  const readOnly = stage === 1 ? !isOpen : !step2Open
  const current = steps.some((s) => s.key === step) ? step : steps[0].key
  const idx = steps.findIndex((s) => s.key === current)
  const props: SectionProps = { data, readOnly, reload: load }

  const hints: Record<StepKey, string> = {
    household: `${data.members.length || 'No'} members`,
    living: Object.keys(data.app.ses_inputs ?? {}).length ? 'Answered' : 'Housing, water, assets',
    school: data.app.gwa_declared != null ? `GWA ${data.app.gwa_declared}` : 'Semester grades, GWA',
    info: data.app.height_in != null ? 'Answered' : 'Height, siblings, parents',
    education: (data.app.character_refs ?? []).filter((r) => r.name).length ? 'Answered' : 'Schools, track, references',
    location: data.applicant.home_lat != null ? 'Pinned' : 'Pin on the map',
    documents: `${data.documents.length} of ${data.docTypes.filter((t) => t.required).length} required`,
    submit: 'Declaration',
  }
  // which sections are filled in (for the ticks and the progress ring)
  const reqDocs = data.docTypes.filter((t) => t.required && t.stage <= stage)
  const done: Record<StepKey, boolean> = {
    school: data.app.gwa_declared != null,
    info: data.app.height_in != null,
    education: (data.app.character_refs ?? []).filter((r) => r.name?.trim()).length >= 3,
    household: data.members.length > 0 && data.app.declared_monthly_income != null,
    living: Object.keys(data.app.ses_inputs ?? {}).length > 0,
    location: data.applicant.home_lat != null,
    documents: reqDocs.every((t) => data.documents.some((d) => d.type_code === t.code)),
    submit: false,
  }
  const work = steps.filter((x) => x.key !== 'submit')
  const doneCount = work.filter((x) => done[x.key]).length
  const pct = work.length ? doneCount / work.length : 0
  // a step opens only when every step before it is finished (owner, Nov 24); a locked step cannot be opened
  const unlocked = steps.map((_, i) => steps.slice(0, i).filter((x) => x.key !== 'submit').every((x) => done[x.key]))
  const vIdx = unlocked[idx] ? idx : unlocked.lastIndexOf(true)
  const view = steps[vIdx].key
  const firstOpen = steps.find((x, i) => unlocked[i] && !done[x.key] && x.key !== 'submit')

  return (
    <>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1>{stage === 1 ? 'Step 1 · Apply online' : 'Step 2 · Requirements'}</h1>
          <p>
            {cycle.name} · closes {new Date(cycle.closes_at).toLocaleDateString('en-PH')} ·{' '}
            <Link to="/profile">edit school / barangay in your profile</Link>
          </p>
        </div>
      </div>
      {!data.schoolEligible && (
        <p className="banner warn">
          Step 1: only students enrolled at Rizal Technological University (RTU) can apply.{' '}
          {data.applicant.school_id ? 'The school in your profile is not RTU.' : 'You have not set your school yet.'}{' '}
          <Link to="/profile">Update your profile</Link>
        </p>
      )}
      {stage === 2 && <p className="banner info">You qualified to proceed{data.app.applicant_no ? ` (Applicant ID ${data.app.applicant_no})` : ''}. Complete your household, income, living conditions and the step 2 documents.</p>}
      {readOnly && <p className="banner warn">{stage === 1 ? 'The application period is closed' : 'The step 2 deadline has passed'}; this draft can no longer be edited.</p>}
      <div className="form-layout">
        <nav className="step-list" aria-label="Application steps">
          <div className="ring-row">
            <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
              <circle cx="29" cy="29" r="24" fill="none" stroke="var(--line)" strokeWidth="7" />
              <circle cx="29" cy="29" r="24" fill="none" stroke="var(--blue)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - pct)} transform="rotate(-90 29 29)" />
            </svg>
            <span><b>{doneCount} of {work.length} done</b><small>Saved when you press Save</small></span>
          </div>
          {steps.map((s, i) => (
            <button key={s.key} type="button" className={`step-btn ${s.key === view ? 'active' : ''} ${done[s.key] ? 'done' : ''} ${unlocked[i] ? '' : 'locked'}`}
              aria-current={s.key === view ? 'step' : undefined} disabled={!unlocked[i]}
              title={unlocked[i] ? undefined : `Finish ${firstOpen?.label.toLowerCase() ?? 'the steps before'} first`}
              onClick={() => { setNeedDone(false); setStep(s.key) }}>
              <span className="num">{done[s.key] ? '✓' : unlocked[i] ? i + 1 : <LockIcon />}</span>
              <span className="t"><b>{s.label}</b><small>{unlocked[i] ? hints[s.key] : `Opens after ${firstOpen?.label.toLowerCase() ?? 'the steps before'}`}</small></span>
            </button>
          ))}
        </nav>
        <div className="form-panel">
          {view === 'household' && <HouseholdSection {...props} />}
          {view === 'living' && <LivingSection {...props} />}
          {view === 'school' && <GradesSection {...props} />}
          {view === 'info' && <InfoSheetSection {...props} />}
          {view === 'education' && <EducationSection {...props} />}
          {view === 'location' && <LocationSection {...props} />}
          {view === 'documents' && <DocumentsSection {...props} />}
          {view === 'submit' && <SubmitSection {...props} />}
          <div className="step-nav">
            {vIdx > 0 ? (
              <button className="btn btn-plain" onClick={() => { setNeedDone(false); setStep(steps[vIdx - 1].key) }}>
                ← Back
              </button>
            ) : <span />}
            {vIdx < steps.length - 1 && (
              <button className="btn btn-lg" onClick={() => {
                if (!done[view]) return setNeedDone(true)
                setNeedDone(false)
                setStep(steps[vIdx + 1].key)
              }}>
                Continue to {steps[vIdx + 1].label.toLowerCase()} →
              </button>
            )}
          </div>
          {needDone && !done[view] && (
            <p className="field-error step-need" role="alert">
              Finish this step and press Save first. {steps[vIdx + 1]?.label} opens once {steps[vIdx].label.toLowerCase()} is complete.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
