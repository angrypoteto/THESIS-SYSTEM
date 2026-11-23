import { useEffect, useState } from 'react'
import { Journey, journeyStop, SealStamp } from '../../components/Journey'
import { Logo } from '../../components/Logos'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { DocCard } from './DocumentsSection'
import type { ApplicationStatus } from '../../lib/types'
import type { AppData } from './ApplicationPage'

interface Gate {
  gate_code: string
  passed: boolean
  reason: string | null
  override_reason: string | null
}

interface Interview {
  slot_start: string
  slot_end: string
  location: string | null
  status: 'scheduled' | 'done' | 'no_show' | 'cancelled'
}

interface Result {
  rank: number
  recommended: boolean
  pay_tier_amount: number | null
}

const GATE_LABEL: Record<string, string> = {
  residency: 'Mandaluyong resident',
  year_level: 'Incoming 1st or 2nd year',
  voter_registration: 'Registered voter',
  enrollment: 'Enrolled this term',
  grades: 'GWA at or above the cut-off',
  documents: 'All required documents verified',
  no_duplicate_benefit: 'No other scholarship',
}

const STATUS_TEXT: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted – waiting for document checking',
  under_review: 'Under review by office staff',
  eligible: 'Eligible – waiting for the ranking',
  ineligible: 'Not eligible (see reasons below)',
  exam_eligible: 'Eligible for the qualifying exam – take it at RTU; the office will record your result',
  exam_failed: 'Did not qualify to proceed after the qualifying exam this cycle',
  ranked: 'Ranked – waiting for the final selection',
  approved: 'Approved',
  waitlisted: 'Waitlisted',
  not_selected: 'Not selected this cycle',
  withdrawn: 'Withdrawn',
}

/** pill colour: green only for good news, amber when the applicant must wait or act, grey for a closed outcome */
const PILL_TONE: Partial<Record<ApplicationStatus, string>> = {
  submitted: 'info', eligible: 'info', ranked: 'info', exam_eligible: 'ok', approved: 'ok',
  under_review: 'warn', waitlisted: 'warn',
}

/** client flow v2: step 1 -> qualifying exam -> step 2 -> ranking -> decision */
const MILESTONES = ['Step 1 submitted', 'Cleared for the exam', 'Qualified to proceed', 'Step 2 submitted', 'Eligible for ranking', 'Ranked', 'Decision']

function milestoneReached(stage: number, status: ApplicationStatus): number {
  if (stage === 1) return status === 'exam_eligible' || status === 'exam_failed' ? 1 : 0
  if (status === 'eligible') return 4
  if (status === 'ranked') return 5
  if (['approved', 'waitlisted', 'not_selected'].includes(status)) return 6
  return 3
}

export function StatusView({ data, reload }: { data: AppData; reload: () => Promise<void> }) {
  const { app, documents, docTypes, cycle } = data
  const { profile } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const rejected = documents.filter((d) => d.verification_status === 'rejected')
  const [resubmitMsg, setResubmitMsg] = useState<string | null>(null)
  async function resubmit() {
    const { data: res, error } = await supabase.rpc('resubmit_after_reupload', { p_app: app.id })
    const problems = (res as string[]) ?? []
    if (error || problems.length) return setResubmitMsg(error?.message ?? problems.join(' '))
    setResubmitMsg(null)
    await reload()
  }
  const [gates, setGates] = useState<Gate[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [interview, setInterview] = useState<Interview | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [waitPos, setWaitPos] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('gate_results')
      .select('gate_code,passed,reason,override_reason')
      .eq('application_id', app.id)
      .then(({ data }) => setGates((data as Gate[]) ?? []))
    // RLS returns only the official run's row for applicants
    supabase
      .from('results')
      .select('rank,recommended,pay_tier_amount')
      .eq('application_id', app.id)
      .maybeSingle()
      .then(({ data }) => setResult(data as Result | null))
    supabase
      .from('interviews')
      .select('slot_start,slot_end,location,status')
      .eq('application_id', app.id)
      .eq('status', 'scheduled')
      .maybeSingle()
      .then(({ data }) => setInterview(data as Interview | null))
    // the reason recorded with the latest decision (applicants can read their own)
    supabase
      .from('evaluations')
      .select('remarks,decision')
      .eq('application_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setReason((data?.[0] as { remarks: string | null } | undefined)?.remarks ?? null))
    if (app.status === 'waitlisted') {
      supabase.rpc('waitlist_position', { p_app: app.id }).then(({ data }) => setWaitPos((data as number | null) ?? null))
    }
  }, [app.id, app.status])

  const reached = milestoneReached(app.stage ?? 1, app.status)
  const failedAt = app.status === 'exam_failed' ? 2 : app.status === 'ineligible' ? reached + 1 : app.status === 'not_selected' ? 6 : -1
  const take = cycle.step2_slots ?? cycle.slots

  return (
    <>
      <h1>My application</h1>
      {['submitted', 'under_review'].includes(app.status) && (
        <section className="card moment" aria-labelledby="sent-h">
          <SealStamp />
          <h1 id="sent-h">Step {app.stage ?? 1} submitted</h1>
          <p>Salamat{firstName ? `, ${firstName}` : ''}. Your application is with the Mandaluyong Educational Service Office.</p>
          <p className="ref-code">Reference <b>CMCS-{String(cycle.school_year).slice(2, 4)}-{app.id.slice(0, 4).toUpperCase()}</b></p>
          <ol className="next-list">
            <li className="now"><b>The office checks your documents</b><span>Usually 1 to 3 working days</span></li>
            <li><b>{(app.stage ?? 1) === 1 ? 'You get the exam schedule' : 'You get the interview schedule'}</b><span>By email and here, if you are cleared</span></li>
            <li><b>{(app.stage ?? 1) === 1 ? 'Qualifying exam at RTU' : 'Interview at City Hall'}</b><span>{(app.stage ?? 1) === 1 && cycle.exam_at ? new Date(cycle.exam_at).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date to follow'}</span></li>
          </ol>
        </section>
      )}
      <section className="card" aria-label="Your scholarship path" style={{ padding: '20px 12px 16px' }}>
        <Journey {...journeyStop(app.status, app.stage)} notes={['Submitted', cycle.exam_at ? new Date(cycle.exam_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null, 'If you pass', 'City Hall', 'In the portal']} />
      </section>
      <section className="card">
        <p className={`pill ${PILL_TONE[app.status] ?? ''}`}>{STATUS_TEXT[app.status]}</p>
        {app.applicant_no && <p style={{ margin: '8px 0 0' }}>Applicant ID: <strong>{app.applicant_no}</strong></p>}
        {app.combined_score != null && (
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Exam {app.exam_score}% × 70% + GWA {app.gwa_converted}% × 30% = combined result <strong>{Number(app.combined_score).toFixed(2)}%</strong>
            {app.academic_rank ? ` · academic rank ${app.academic_rank}` : ''}
          </p>
        )}
        <p className="muted">
          {app.stage === 2 ? 'Step 2' : 'Step 1'} submitted {app.submitted_at ? new Date(app.submitted_at).toLocaleString('en-PH') : '—'}
          {app.household_size ? ` · household of ${app.household_size}` : ''} · GWA {app.gwa_converted ?? app.gwa_declared}
          {app.gwa_converted != null ? '%' : ''}
        </p>
        <ol className="timeline">
          {MILESTONES.map((s, i) => (
            <li key={s} className={i === failedAt ? 'failed' : i === 6 && app.status === 'waitlisted' ? 'attention' : reached >= i ? 'done' : ''}>
              {s}
            </li>
          ))}
        </ol>
      </section>

      {app.stage === 1 && ['submitted', 'under_review'].includes(app.status) && (
        <p className="banner info" role="note">
          Once the office checks your step 1, your <strong>qualifying exam schedule</strong> is emailed to you, and later your
          result. Watch your inbox, and your <strong>Spam</strong> or <strong>Promotions</strong> folder; mark the email
          &ldquo;Not spam&rdquo; if it lands there.
        </p>
      )}

      {interview && (
        <section className="card" aria-labelledby="iv">
          <h2 id="iv">Your interview</h2>
          <dl className="facts">
            <dt>Date</dt><dd>{new Date(interview.slot_start).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</dd>
            <dt>Time</dt><dd>{new Date(interview.slot_start).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} to {new Date(interview.slot_end).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</dd>
            <dt>Venue</dt><dd>{interview.location ?? 'Mandaluyong Educational Service Office'}</dd>
          </dl>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Bring a valid ID and the original copies of the documents you uploaded. You also got this by email, and a reminder
            comes the day before. If you cannot attend, contact the office as soon as possible.
          </p>
        </section>
      )}

      {app.status === 'exam_eligible' && (
        <section className="card">
          <h2>Next: the qualifying exam</h2>
          <p style={{ marginTop: 0 }}>
            You passed the initial screening. The exam is given on paper at RTU
            {cycle.exam_at ? <> on <strong>{new Date(cycle.exam_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}</strong></> : ' (the date will be announced)'}
            {cycle.exam_venue ? <> at <strong>{cycle.exam_venue}</strong></> : ''}. Bring a valid ID. The office records your result here,
            and applicants are ranked on 70% exam score + 30% GWA. Those who qualify to proceed get an Applicant ID and are asked for the step 2 requirements. The schedule and your result are also emailed to you (check Spam if you do not see them).
          </p>
        </section>
      )}

      {app.status === 'under_review' && (
        <section className="card warn" aria-labelledby="reup">
          <h2 id="reup">A staff member asked for a clearer copy</h2>
          <p style={{ marginTop: 0 }}>Upload the document again below, then send your application back for checking. The rest of your application stays as you submitted it.</p>
          <div className="doc-list">
            {docTypes.filter((t) => documents.some((d) => d.type_code === t.code && d.verification_status === 'rejected')).map((t) => (
              <DocCard key={t.code} type={t} current={documents.find((d) => d.type_code === t.code) ?? null}
                appId={app.id} applicantId={app.applicant_id} readOnly={false} reload={reload} />
            ))}
          </div>
          {resubmitMsg && <p className="error" role="alert">{resubmitMsg}</p>}
          <button className="btn btn-lg" style={{ marginTop: 14 }} disabled={rejected.length > 0} onClick={resubmit}>
            {rejected.length > 0 ? 'Upload the new copy first' : 'Send back for checking'}
          </button>
        </section>
      )}

      <Outcome app={app} result={result} reason={reason} waitPos={waitPos} take={take} slots={cycle.slots} term={`${cycle.term}, School Year ${cycle.school_year}`} name={firstName} />

      {gates.length > 0 && (
        <section className="card">
          <h2>Eligibility checks</h2>
          <ul className="checklist">
            {gates.map((g) => (
              <li key={g.gate_code} className={g.passed ? 'ok' : 'missing'}>
                <span aria-hidden>{g.passed ? '✓' : '✗'}</span> {GATE_LABEL[g.gate_code] ?? g.gate_code}
                {!g.passed && g.reason && <span className="muted"> — {g.reason}</span>}
                {g.override_reason && <span className="muted"> (cleared by staff)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Documents</h2>
        <table className="table">
          <tbody>
            {docTypes.map((t) => {
              const d = documents.find((x) => x.type_code === t.code)
              return (
                <tr key={t.code}>
                  <td>{t.name}</td>
                  <td>{d ? <><span className={`status-dot ${d.verification_status}`} /> {d.verification_status}</> : <span className="muted">not uploaded</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}

/** Plain-language result for each closed or waiting outcome: what happened, why, and what happens next. */
function Outcome({ app, reason, waitPos, take, slots, term, name }: {
  app: AppData['app']; result: Result | null; reason: string | null; waitPos: number | null; take: number; slots: number; term: string; name: string
}) {
  // no rank numbers for the applicant, following the office's choice for the emails (redesign, Nov 24)
  const rank = null
  const why = reason ? <p className="small"><strong>Reason recorded by the office:</strong> {reason}</p> : null
  let title: string
  let body: React.ReactNode
  switch (app.status) {
    case 'approved':
      // the result reveal: a certificate-style card with the seal (redesign, Nov 24)
      return (
        <section className="cert" aria-labelledby="outcome">
          <div className="cert-in">
            <Logo which="mandaluyong" size={88} />
            <span className="cert-eyebrow">City of Mandaluyong · CMCS Program</span>
            <h2 id="outcome">Congratulations{name ? `, ${name}` : ''}!</h2>
            <p>You are a <strong>CMCS scholar</strong> for {term}{app.category ? <>, as a <strong>{app.category}</strong></> : ''}.</p>
            {app.applicant_no && <p className="cert-id">Applicant ID <strong>{app.applicant_no}</strong></p>}
            <p className="small muted" style={{ maxWidth: '46ch' }}>The office will message you the next steps, such as the orientation. Keep your contact details in your profile up to date.</p>
          </div>
        </section>
      )
    case 'waitlisted':
      title = 'You are on the waitlist'
      body = <>
        <p style={{ marginTop: 0 }}>
          {rank}All {slots} slots of this cycle are filled.{waitPos ? <> Your place on the waitlist is <strong>{waitPos}</strong>.</> : ''}
        </p>
        <p className="small muted">If a selected scholar gives up a slot, it goes to the next person on the waitlist in rank order, and you are emailed right away. You do not need to do anything.</p>
        {why}
      </>
      break
    case 'not_selected':
      title = 'You were not selected this cycle'
      body = <>
        <p style={{ marginTop: 0 }}>{rank}Thank you for applying. Your application was not selected for this cycle.</p>
        {why}
        <p className="small muted">You may ask the Mandaluyong Educational Service Office about this result, and you are welcome to apply again in a future cycle.</p>
      </>
      break
    case 'exam_failed':
      title = app.exam_result === 'absent' ? 'You did not take the qualifying exam' : 'You did not qualify to proceed'
      body = app.exam_result === 'absent' ? <>
        <p style={{ marginTop: 0 }}>The office&rsquo;s record shows you were not able to take the qualifying exam, so your application cannot continue this cycle.</p>
        <p className="small muted">If this record is wrong, contact the Mandaluyong Educational Service Office as soon as possible. You may apply again in a future cycle.</p>
      </> : <>
        <p style={{ marginTop: 0 }}>
          Applicants are ranked on 70% exam score + 30% GWA, and the top {take} proceed to step 2.
          {app.academic_rank ? <> Your rank was <strong>#{app.academic_rank}</strong>{app.combined_score != null ? <> with a combined result of <strong>{Number(app.combined_score).toFixed(2)}%</strong></> : ''}.</> : ''}
        </p>
        <p className="small muted">Thank you for taking part. You are welcome to apply again in a future cycle.</p>
      </>
      break
    case 'ineligible':
      title = 'Your application did not pass the eligibility checks'
      body = <p style={{ margin: 0 }}>The checks marked ✗ below show what was not met. If you think one is wrong, contact the Mandaluyong Educational Service Office; a staff member can review it.</p>
      break
    case 'withdrawn':
      title = 'Your application was withdrawn'
      body = <p style={{ margin: 0 }}>This application is closed. If you did not ask for this, contact the Mandaluyong Educational Service Office as soon as possible.</p>
      break
    case 'ranked':
      title = 'You are in the final ranking'
      body = <p style={{ margin: 0 }}>{rank}The final beneficiaries are selected from this ranking up to the {slots} slots. You will be emailed the result.</p>
      break
    default:
      return null
  }
  return (
    <section className="card" aria-labelledby="outcome">
      <h2 id="outcome">{title}</h2>
      {body}
    </section>
  )
}
