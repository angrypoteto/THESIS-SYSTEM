import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
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
  // ranking needs (household, living conditions, home pin) and the step 2 documents
  1: ['school', 'documents', 'submit'],
  2: ['info', 'education', 'household', 'living', 'location', 'documents', 'submit'],
}

export function ApplicationPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<AppData | null>(null)
  const [step, setStep] = useState<StepKey>('school')

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

  if (loading) return <p className="muted">Loading your application…</p>
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

  return (
    <>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1>My application · {stage === 1 ? 'Step 1: initial screening' : 'Step 2: requirements for qualified examinees'}</h1>
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
      {stage === 2 && <p className="banner info">You passed the qualifying exam. Complete your household, income, living conditions, home location and the step 2 documents.</p>}
      {readOnly && <p className="banner warn">{stage === 1 ? 'The application period is closed' : 'The step 2 deadline has passed'}; this draft can no longer be edited.</p>}
      <div className="form-layout">
        <nav className="step-list" aria-label="Application steps">
          <p>Saved as you go</p>
          {steps.map((s, i) => (
            <button key={s.key} type="button" className={`step-btn ${s.key === current ? 'active' : ''}`} aria-current={s.key === current ? 'step' : undefined} onClick={() => setStep(s.key)}>
              <span className="num">{i + 1}</span>
              <span className="t"><b>{s.label}</b><small>{hints[s.key]}</small></span>
            </button>
          ))}
        </nav>
        <div className="form-panel">
          {current === 'household' && <HouseholdSection {...props} />}
          {current === 'living' && <LivingSection {...props} />}
          {current === 'school' && <GradesSection {...props} />}
          {current === 'info' && <InfoSheetSection {...props} />}
          {current === 'education' && <EducationSection {...props} />}
          {current === 'location' && <LocationSection {...props} />}
          {current === 'documents' && <DocumentsSection {...props} />}
          {current === 'submit' && <SubmitSection {...props} />}
          <div className="step-nav">
            <button className="btn btn-plain" disabled={idx === 0} onClick={() => setStep(steps[idx - 1].key)}>
              ← Back
            </button>
            {idx < steps.length - 1 && (
              <button className="btn btn-lg" onClick={() => setStep(steps[idx + 1].key)}>
                Next: {steps[idx + 1].label} →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
