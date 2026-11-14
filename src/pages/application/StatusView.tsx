import { useEffect, useState } from 'react'
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
  }, [app.id])

  const reached = milestoneReached(app.stage ?? 1, app.status)
  const failedAt = app.status === 'exam_failed' ? 2 : app.status === 'ineligible' ? reached + 1 : -1

  return (
    <>
      <h1>My application</h1>
      <section className="card">
        <p className="pill ok">{STATUS_TEXT[app.status]}</p>
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
            <li key={s} className={i === failedAt ? 'failed' : reached >= i ? 'done' : ''}>
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

      {result && (
        <section className="card">
          <h2>Result</h2>
          <p>
            Rank <strong>#{result.rank}</strong>
            {result.recommended ? ' — recommended for a slot' : ' — outside the available slots'}
            {result.pay_tier_amount ? ` · allowance PHP ${Number(result.pay_tier_amount).toLocaleString()}` : ''}
          </p>
          <p className="muted small">The Educational Service Office makes the final decision. You may ask the office why you were or were not selected.</p>
        </section>
      )}

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
