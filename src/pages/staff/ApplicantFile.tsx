import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import { flagText, GATE_LABEL, labelDoc, STAFF_APP_SELECT, type StaffAppRow } from '../../lib/staff'
import { OfficeFormsCard } from './OfficeFormsCard'
import { useRequired } from '../../components/useRequired'
import { useBack } from '../../lib/backLink'

const STEP_GATES: Record<1 | 2, string[]> = {
  1: ['enrollment', 'year_level', 'grades'],
  2: ['enrollment', 'year_level', 'grades', 'residency', 'voter_registration', 'documents', 'no_duplicate_benefit'],
}
import type { HouseholdMember } from '../../lib/types'

interface Gate { gate_code: string; passed: boolean; reason: string | null; override_reason: string | null }
interface Prediction { qualification_prob: number | null; predicted_income_pc: number | null; recommendation: string | null; shap_reasons: { label: string; value: number; effect: number; direction: string }[] }
interface Feedback { staff_need: string; note: string | null; created_at: string; profiles: { full_name: string } | null }
interface CriterionRow { code: string; name: string; source_field: string; weight: number | null }
interface ResultRow { rank: number; closeness: number; recommended: boolean; pay_tier_amount: number | null; run_id: number }
interface InterviewRow { id: number; slot_start: string; location: string | null; status: string; notes: string | null }
interface Evaluation { id: number; decision: string; remarks: string | null; is_override: boolean; created_at: string; profiles: { full_name: string } | null }

const FEEDBACK_LABEL: Record<string, string> = { in_need: 'In need', not_in_need: 'Not in need', unsure: 'Not sure' }

/** Design screen 7: gates, need estimate with reasons, ranking values, and the person's decision. */
export function ApplicantFile() {
  const back = useBack()
  const { id } = useParams()
  const { refreshCounts } = useStaff()
  const [app, setApp] = useState<StaffAppRow | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [gates, setGates] = useState<Gate[]>([])
  const [pred, setPred] = useState<Prediction | null>(null)
  const [criteria, setCriteria] = useState<CriterionRow[]>([])
  const [values, setValues] = useState<Record<string, number | null>>({})
  const [result, setResult] = useState<ResultRow | null>(null)
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [fbNote, setFbNote] = useState('')
  const [interviews, setInterviews] = useState<InterviewRow[]>([])
  const [tabSel, setTabSel] = useState<'documents' | 'need' | 'values' | 'household' | 'forms' | 'history' | null>(null)
  const [forfeitOpen, setForfeitOpen] = useState(false)
  const [forfeitWhy, setForfeitWhy] = useState('')
  const [forfeitMissing, setForfeitMissing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [a, m, g, p, c, w, v, r, e, f, iv] = await Promise.all([
      supabase.from('applications').select(STAFF_APP_SELECT).eq('id', id).single(),
      supabase.from('household_members').select('*').eq('application_id', id).order('id'),
      supabase.from('gate_results').select('gate_code,passed,reason,override_reason').eq('application_id', id),
      supabase.from('ml_predictions').select('qualification_prob,predicted_income_pc,recommendation,shap_reasons').eq('application_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('criteria').select('code,name,source_field').eq('is_active', true).order('display_order'),
      supabase.from('criteria_weight_sets').select('criteria_weights(criterion_code,weight)').eq('is_active', true).maybeSingle(),
      supabase.from('v_application_criteria_source').select('*').eq('application_id', id).maybeSingle(),
      supabase.from('results').select('rank,closeness,recommended,pay_tier_amount,run_id,ranking_runs!inner(is_official)').eq('application_id', id).eq('ranking_runs.is_official', true).limit(1),
      supabase.from('evaluations').select('id,decision,remarks,is_override,created_at,profiles(full_name)').eq('application_id', id).order('created_at', { ascending: false }),
      supabase.from('ml_feedback').select('staff_need,note,created_at,profiles(full_name)').eq('application_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('interviews').select('id,slot_start,location,status,notes').eq('application_id', id).order('slot_start', { ascending: false }),
    ])
    setApp(a.data as unknown as StaffAppRow)
    setMembers((m.data as HouseholdMember[]) ?? [])
    setGates((g.data as Gate[]) ?? [])
    setPred((p.data?.[0] as Prediction) ?? null)
    const weights = ((w.data as { criteria_weights: { criterion_code: string; weight: number }[] } | null)?.criteria_weights) ?? []
    // weights are shown as the ranking uses them: rescaled over the active criteria so they add up to 1
    const active = ((c.data as CriterionRow[]) ?? []).map((x) => ({ ...x, weight: weights.find((y) => y.criterion_code === x.code)?.weight ?? null }))
    const total = active.reduce((t, x) => t + Number(x.weight ?? 0), 0)
    setCriteria(active.map((x) => ({ ...x, weight: x.weight != null && total > 0 ? Math.round((Number(x.weight) / total) * 1000) / 1000 : x.weight })))
    setValues((v.data as Record<string, number | null>) ?? {})
    setResult((r.data?.[0] as unknown as ResultRow) ?? null)
    setEvals((e.data as unknown as Evaluation[]) ?? [])
    setFeedback((f.data?.[0] as unknown as Feedback) ?? null)
    setInterviews((iv.data as InterviewRow[]) ?? [])
    const who = (a.data as unknown as { applicant_id?: string } | null)?.applicant_id
    if (who) {
      const { data: d } = await supabase.rpc('has_open_duplicate', { p_user: who })
      setDupOpen(d === true)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function act(fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(true)
    setMsg(null)
    const { error } = await fn()
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: ok })
    await load()
    refreshCounts()
  }

  if (!app) return <p className="muted">Loading…</p>
  const p = app.applicants?.profiles
  const docs = app.documents.filter((d) => d.is_current)
  const docsDone = docs.every((d) => d.verification_status === 'pass' || d.verification_status === 'accepted')
  const pendingDocs = docs.filter((d) => d.verification_status === 'pending' || d.verification_status === 'review')
  const canDecide = ['ranked', 'approved', 'waitlisted', 'not_selected'].includes(app.status)
  const ivActive = interviews.find((i) => i.status === 'scheduled') ?? null
  const ivLast = interviews[0] ?? null
  const failedGates = gates.filter((g) => !g.passed)
  const tab = tabSel ?? (pendingDocs.length ? 'documents' : app.stage === 2 && !pred && ['submitted', 'under_review', 'eligible'].includes(app.status) ? 'need' : 'documents')
  const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function ivStatus(status: 'done' | 'no_show') {
    if (!ivActive) return
    await act(async () => await supabase.rpc('set_interview_status', { p_interview: ivActive.id, p_status: status, p_notes: null }),
      status === 'done' ? 'Interview passed: the applicant goes into the ranking.' : 'Marked as no show. Reschedule on Interviews, or forfeit.')
  }
  async function forfeit() {
    if (!forfeitWhy.trim()) return setForfeitMissing(true)
    await act(async () => await supabase.rpc('forfeit_application', { p_app: app!.id, p_reason: forfeitWhy.trim() }),
      'Application forfeited. The applicant sees the reason in the portal.')
    setForfeitOpen(false)
    setForfeitWhy('')
  }

  // the one thing that can be done now, by stage
  const next: { title: string; body?: React.ReactNode; actions?: React.ReactNode } = (() => {
    if (app.status === 'draft') return { title: 'Not submitted yet', body: 'The applicant is still filling in the application.' }
    if (app.status === 'withdrawn') return { title: 'Withdrawn', body: 'This application was withdrawn. See History.' }
    if (pendingDocs.length) return {
      title: `Check ${pendingDocs.length} document${pendingDocs.length === 1 ? '' : 's'}`,
      body: 'The eligibility gates run by themselves once the last document is accepted.',
      actions: <Link className="btn btn-block" to={`/staff/documents/${pendingDocs[0].id}`} state={back.state}>Check {labelDoc(pendingDocs[0].type_code).toLowerCase()}</Link>,
    }
    if (app.status === 'under_review') return { title: 'Waiting for the applicant', body: 'A clearer copy of a document was requested. It appears here once uploaded.' }
    if (app.status === 'ineligible') return {
      title: 'Not eligible',
      body: <>{failedGates.map((g) => g.reason ?? GATE_LABEL[g.gate_code]).join('; ') || 'A rule was not met.'} Clear a rule with a reason under Eligibility gates if it should not apply.</>,
    }
    if (app.status === 'exam_eligible') return { title: 'Waiting for the exam result', body: <>Cleared for the qualifying exam. Scores are entered on <Link to="/staff/exam">Qualifying exam</Link>.</> }
    if (app.status === 'exam_failed') return { title: 'Did not proceed to step 2', body: app.exam_result === 'absent' ? 'Absent from the qualifying exam.' : 'Below the step 2 line after the exam.' }
    if (app.stage === 2 && ['submitted', 'eligible'].includes(app.status)) {
      if (ivActive) return {
        title: 'Record the interview result',
        body: <>{when(ivActive.slot_start)}{ivActive.location ? ` · ${ivActive.location}` : ''}</>,
        actions: forfeitOpen ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <textarea aria-label="Why is the application forfeited?" aria-invalid={forfeitMissing && !forfeitWhy.trim()} rows={3}
              placeholder="Why? (required) e.g. both parents work; income higher than declared" value={forfeitWhy} onChange={(e) => setForfeitWhy(e.target.value)} />
            {forfeitMissing && !forfeitWhy.trim() && <span className="field-error" role="alert">Write why the application is forfeited.</span>}
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-danger-outline" disabled={busy} onClick={forfeit}>Forfeit application</button>
              <button className="btn-danger-link" onClick={() => { setForfeitOpen(false); setForfeitMissing(false) }}>Back</button>
            </span>
          </div>
        ) : (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ok" style={{ flex: 1 }} disabled={busy} onClick={() => ivStatus('done')}>Passed</button>
            <button className="btn btn-plain" disabled={busy} onClick={() => ivStatus('no_show')}>No show</button>
            <button className="btn-danger-link" onClick={() => setForfeitOpen(true)}>Forfeit…</button>
          </span>
        ),
      }
      if (ivLast?.status === 'done') return { title: 'Interview passed', body: 'In the ranking. The final selection is automatic once every interview is settled and step 2 has closed.' }
      if (app.status === 'eligible') return {
        title: ivLast?.status === 'no_show' ? 'No show: reschedule the interview' : 'Schedule the interview',
        body: 'Only applicants who pass the interview are ranked.',
        actions: <Link className="btn btn-block" to="/staff/interviews">Go to Interviews</Link>,
      }
      return { title: 'Step 2 submitted', body: 'Check the documents; the gates run by themselves after the last one.' }
    }
    if (canDecide) return {
      title: app.status === 'approved' ? 'Selected (approved)' : app.status === 'waitlisted' ? 'On the waitlist' : app.status === 'ranked' ? 'Ranked: final selection in progress' : 'Not selected',
      body: 'Decided by the automatic selection. To change this one result, record a decision with a reason below; it is logged as an override.',
    }
    return { title: app.status.replaceAll('_', ' ') }
  })()

  const TABS: [typeof tab, string, number | null][] = [
    ['documents', 'Documents', docs.length], ['need', 'Need estimate', null], ['values', 'Ranking values', null],
    ['household', 'Household', members.length], ['forms', 'Office forms', null], ['history', 'History', evals.length + interviews.length],
  ]

  return (
    <>
      <div className="page-head sticky-head">
        <div style={{ minWidth: 0 }}>
          <Link to={back.to} className="back">← {back.label}</Link>
          <h1>{p?.full_name} <span className="pill info" style={{ verticalAlign: 'middle', fontSize: 14 }}>{app.status.replaceAll('_', ' ')}</span></h1>
          <div className="fact-chips">
            {app.applicant_no && <span className="pill small">{app.applicant_no}</span>}
            {p?.student_number && <span className="pill small">{p.student_number}</span>}
            <span className="pill small">{app.applicants?.course ?? '—'}</span>
            <span className="pill small">Incoming year {app.applicants?.year_level ?? '—'}</span>
            <span className="pill small">{app.applicants?.barangays?.name ?? '—'}</span>
            <span className="pill small">Step {app.stage}</span>
            {app.exam_score != null && <span className="pill small">Exam {app.exam_score}% · combined {Number(app.combined_score).toFixed(2)}%</span>}
            {app.household_size ? <span className="pill small">Household of {app.household_size}</span> : null}
            {result && <span className="pill small">Rank #{result.rank}</span>}
          </div>
        </div>
      </div>
      {app.flags?.length > 0 && (
        <p className="banner warn" role="note">Needs your judgment: {app.flags.map(flagText).join('; ')}</p>
      )}
      {dupOpen && (
        <p className="banner warn" role="note">
          <strong>Possible duplicate account.</strong> This applicant matches another account. Until an admin resolves it on the{' '}
          <Link to="/admin/duplicates">Duplicates</Link> screen, this application cannot be cleared for the exam or the ranking.
        </p>
      )}
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}

      <div className="split">
        <div className="main">
          <div className="chips" role="group" aria-label="Sections" style={{ marginBottom: 12 }}>
            {TABS.map(([k, label, n]) => (
              <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTabSel(k)}>
                {label}{n != null && n > 0 && <span className="count">{n}</span>}
              </button>
            ))}
          </div>

          {tab === 'documents' && (
            <section className="card" aria-label="Documents">
              <table className="table">
                <thead><tr><th>Document</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>{labelDoc(d.type_code)}</td>
                      <td><span className={`status-dot ${d.verification_status}`} /> {d.verification_status}</td>
                      <td className="num"><Link className={d.verification_status === 'pending' || d.verification_status === 'review' ? 'btn' : 'btn btn-plain'} to={`/staff/documents/${d.id}`} state={back.state}>{d.verification_status === 'pending' || d.verification_status === 'review' ? 'Check' : 'View'}</Link></td>
                    </tr>
                  ))}
                  {docs.length === 0 && <tr><td colSpan={3} className="muted">No documents uploaded.</td></tr>}
                </tbody>
              </table>
            </section>
          )}

          {tab === 'need' && (
            <section className="card" aria-label="Estimated need">
              {pred?.qualification_prob != null ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 38, fontWeight: 800 }}>{pred.qualification_prob.toFixed(2)}</span><span className="muted">probability of being in need</span></div>
                  <div className="gauge" aria-hidden="true"><i style={{ left: `${pred.qualification_prob * 100}%` }} /></div>
                  <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span>below 0.10: not recommended</span><span>0.10–0.70: staff review</span><span>0.70+: ranking pool</span></div>
                  <h3 className="mt">Main reasons</h3>
                  {pred.shap_reasons.map((r) => (
                    <div className="reason-row" key={r.label}>
                      <span>{r.label}</span>
                      <span className="eff" style={{ color: r.effect > 0 ? 'var(--ok-ink)' : 'var(--warn-ink)' }}>
                        <span className="bar" style={{ width: Math.min(100, Math.abs(r.effect) * 500), background: r.effect > 0 ? 'var(--ok)' : 'var(--warn)' }} />
                        {r.direction}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {app.stage === 2 && app.status !== 'draft'
                    ? 'No model score yet. Ask the ML service for an estimate; it reads only the household, income and living-condition answers.'
                    : 'The need estimate runs after step 2 is submitted (household and income are collected in step 2).'}
                </p>
              )}
              {app.stage === 2 && app.status !== 'draft' && (
                <button aria-busy={busy} className={`btn ${pred ? 'btn-plain' : ''}`} style={{ marginTop: 12 }} disabled={busy}
                  onClick={() => act(async () => {
                    const { error } = await supabase.functions.invoke('ml-score', { body: { application_id: app.id } })
                    if (!error) return { error: null }
                    const ctx = (error as { context?: Response }).context
                    const body = ctx ? await ctx.json().catch(() => null) : null
                    return { error: { message: body?.error ?? error.message } }
                  }, 'Need estimate saved.')}>
                  {busy ? 'Estimating…' : pred ? 'Estimate again' : 'Get need estimate'}
                </button>
              )}
              {busy && <p className="small muted busy-note" role="status">Working. If the estimating service was asleep, this can take up to a minute.</p>}
              {pred && app.stage === 2 && (
                <div className="mt">
                  <h3 style={{ marginBottom: 4 }}>Do you agree? Your judgement</h3>
                  <p className="small muted" style={{ marginTop: 0 }}>
                    After reading the documents, is this household in need? Your answer is saved as a label to check and later
                    retrain the model (Administration &gt; Models). It does not change the ranking.
                  </p>
                  {feedback && (
                    <p className="small" style={{ marginTop: 0 }}>
                      Last answer: <strong>{FEEDBACK_LABEL[feedback.staff_need] ?? feedback.staff_need}</strong>
                      {feedback.profiles?.full_name ? ` by ${feedback.profiles.full_name}` : ''}, {new Date(feedback.created_at).toLocaleDateString()}
                      {feedback.note ? ` · “${feedback.note}”` : ''}
                    </p>
                  )}
                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="small">Note (optional)</span>
                    <input value={fbNote} onChange={(e) => setFbNote(e.target.value)} maxLength={300} placeholder="e.g. both parents are vendors" />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {(['in_need', 'not_in_need', 'unsure'] as const).map((k) => (
                      <button key={k} className={`btn ${feedback?.staff_need === k ? '' : 'btn-plain'}`} disabled={busy}
                        onClick={() => act(async () => {
                          const { error } = await supabase.rpc('record_need_feedback', { p_app: app.id, p_need: k, p_note: fbNote || null })
                          if (!error) setFbNote('')
                          return { error }
                        }, 'Your answer is saved.')}>
                        {FEEDBACK_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === 'values' && (
            <section className="card" aria-label="Values used for ranking">
              <table className="table">
                <thead><tr><th>Criterion</th><th>Value</th><th className="num">Weight</th></tr></thead>
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c.code}><td>{c.code} {c.name}</td><td><strong>{fmtValue(c.source_field, values[c.source_field])}</strong></td><td className="num">{c.weight != null ? Number(c.weight).toFixed(3) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === 'household' && (
            <section className="card" aria-label="Household roster">
              <table className="table">
                <thead><tr><th>Name</th><th>Relationship</th><th>Age</th><th>Studying</th><th>Working</th><th>Ill / PWD</th><th className="num">Monthly income</th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}><td>{m.full_name}</td><td>{m.relationship}</td><td>{m.age}</td><td>{m.is_studying ? 'Yes' : 'No'}</td><td>{m.is_working ? 'Yes' : 'No'}</td><td>{m.has_illness ? 'Yes' : 'No'}</td><td className="num">PHP {Number(m.monthly_income).toLocaleString()}</td></tr>
                  ))}
                  {members.length === 0 && <tr><td colSpan={7} className="muted">The household is entered in step 2.</td></tr>}
                </tbody>
              </table>
              <p className="small muted" style={{ marginBottom: 0 }}>Declared household income: PHP {Number(app.declared_monthly_income ?? 0).toLocaleString()} per month.</p>
            </section>
          )}

          {tab === 'forms' && <OfficeFormsCard appId={app.id} canSetCategory={!busy} />}

          {tab === 'history' && (
            <>
              <section className="card" aria-label="History">
                {interviews.length === 0 && evals.length === 0 && <p className="muted" style={{ margin: 0 }}>No interviews or decisions yet.</p>}
                {interviews.map((i) => (
                  <p key={`i${i.id}`} className="small" style={{ margin: '0 0 8px' }}>
                    <strong>Interview · {i.status === 'done' ? 'passed' : i.status.replace('_', ' ')}</strong> · {when(i.slot_start)}{i.location ? ` · ${i.location}` : ''}
                    {i.notes && <><br /><span className="muted">{i.notes}</span></>}
                  </p>
                ))}
                {evals.map((e) => (
                  <p key={e.id} className="small" style={{ margin: '0 0 8px' }}>
                    <strong>{e.decision.replace('_', ' ')}</strong>{e.is_override && ' (override)'} · {e.profiles?.full_name ?? 'automatic selection'} · {new Date(e.created_at).toLocaleString('en-PH')}<br />
                    <span className="muted">{e.remarks}</span>
                  </p>
                ))}
              </section>
              {!['draft', 'withdrawn'].includes(app.status) && (
                <Withdraw busy={busy} approved={app.status === 'approved'}
                  onSave={(why) => act(async () => await supabase.rpc('withdraw_application', { p_app: app.id, p_reason: why }),
                    'Application withdrawn.' + (app.status === 'approved' ? ' The next on the waitlist is approved automatically.' : ''))} />
              )}
            </>
          )}
        </div>

        <aside className="side">
          <section className="card next-step" aria-labelledby="next-h">
            <span className="eyebrow">Next step</span>
            <h2 id="next-h">{next.title}</h2>
            {next.body && <p className="small muted" style={{ margin: '0 0 10px' }}>{next.body}</p>}
            {next.actions}
          </section>

          <section className="card" aria-labelledby="gates">
            <h2 id="gates" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>Eligibility gates
              {gates.length > 0 && (failedGates.length ? <span className="pill warn small">{failedGates.length} not met</span> : <span className="pill ok small">all passed</span>)}</h2>
            {gates.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>{docsDone ? 'Not run yet.' : 'They run by themselves once every document is accepted.'}</p>
            ) : (
              <ul className="checklist">
                {STEP_GATES[app.stage ?? 1].map((code) => {
                  const g = gates.find((x) => x.gate_code === code)
                  return (
                    <li key={code} className={g?.passed ? 'ok' : 'missing'}>
                      <span aria-hidden>{g?.passed ? '✓' : '✗'}</span> {GATE_LABEL[code]}
                      {g && !g.passed && g.reason && <div className="small muted">{g.reason}</div>}
                      {g?.override_reason && <div className="small muted">Cleared by staff: {g.override_reason}</div>}
                      {g && !g.passed && <OverrideGate onSave={(why) => act(async () => await supabase.rpc('override_gate', { p_app: app.id, p_gate: code, p_reason: why }), 'Gate cleared and logged.')} busy={busy} />}
                    </li>
                  )
                })}
              </ul>
            )}
            {docsDone && ['submitted', 'under_review', 'eligible', 'ineligible', 'exam_eligible'].includes(app.status) && gates.length > 0 && (
              <button className="btn btn-plain btn-block" style={{ marginTop: 8 }} aria-busy={busy} disabled={busy}
                onClick={() => act(async () => await supabase.rpc('evaluate_gates', { p_app: app.id }), 'Gates checked again.')}>
                Check the gates again
              </button>
            )}
            {docsDone && gates.length === 0 && ['submitted', 'under_review'].includes(app.status) && (
              <button className="btn btn-block" style={{ marginTop: 8 }} aria-busy={busy} disabled={busy}
                onClick={() => act(async () => await supabase.rpc('evaluate_gates', { p_app: app.id }), 'Gates evaluated.')}>
                Run the gates
              </button>
            )}
          </section>

          {result && (
            <section className="card" aria-labelledby="rank">
              <h2 id="rank">Ranking</h2>
              <p style={{ margin: 0 }}>Rank <strong>#{result.rank}</strong> · closeness {Number(result.closeness).toFixed(3)} · {result.recommended ? 'within the slots' : 'outside the slots (waitlist)'}{result.recommended && result.pay_tier_amount ? ` · allowance PHP ${Number(result.pay_tier_amount).toLocaleString()}` : ''}</p>
            </section>
          )}

          {canDecide && (
            <Decision disabled={busy} recommended={result?.recommended ?? null}
              onSave={(decision, reason) => act(async () => await supabase.rpc('record_decision', { p_app: app.id, p_decision: decision, p_reason: reason }), 'Decision saved; the applicant was notified.')} />
          )}
        </aside>
      </div>
    </>
  )
}

function fmtValue(field: string, v: number | null | undefined): string {
  if (v == null) return '—'
  if (field === 'per_capita_income') return `PHP ${Math.round(Number(v)).toLocaleString()}`
  if (field === 'gwa') return `${v}%`
  if (field === 'distance_km') return `${v} km`
  if (field === 'ses_index') return Number(v).toFixed(2)
  return String(v)
}

function OverrideGate({ onSave, busy }: { onSave: (why: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState('')
  const need = useRequired(why, 'Write the reason first (saved to the audit log).')
  if (!open) return <button type="button" className="link-button link" onClick={() => setOpen(true)}>Override with a reason</button>
  return (
    <form className="form" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); if (need.check()) onSave(why.trim()) }}>
      <label>Reason (saved to the audit log)<textarea {...need.props} value={why} onChange={(e) => setWhy(e.target.value)} />{need.error}</label>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn" disabled={busy}>Clear this gate</button>
        <button type="button" className="btn-danger-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function Decision({ disabled, recommended, onSave }: { disabled: boolean; recommended: boolean | null; onSave: (d: string, reason: string) => void }) {
  const [decision, setDecision] = useState(recommended === false ? 'waitlisted' : 'approved')
  const [reason, setReason] = useState('')
  const need = useRequired(reason, 'Write the reason for this decision first.')
  return (
    <section className="card" aria-labelledby="dec">
      <h2 id="dec">Decision</h2>
      {disabled && <p className="small muted">Available after the official ranking.</p>}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }} disabled={disabled}>
        <legend className="sr">Decision</legend>
        {[['approved', 'Approve'], ['waitlisted', 'Waitlist'], ['returned', 'Return for more information'], ['not_selected', 'Not selected']].map(([v, l]) => (
          <label key={v} className="choice"><input type="radio" name="decision" checked={decision === v} onChange={() => setDecision(v)} /> {l}</label>
        ))}
        <label className="field" style={{ marginTop: 8 }}>Reason (required)<textarea {...need.props} value={reason} onChange={(e) => setReason(e.target.value)} />{need.error}</label>
        <button className="btn btn-lg btn-block" disabled={disabled} onClick={() => need.check() && onSave(decision, reason.trim())}>Save decision</button>
      </fieldset>
    </section>
  )
}

/** Staff record that the applicant gave up the application or the scholarship; frees a slot if they were approved. */
function Withdraw({ onSave, busy, approved }: { onSave: (why: string) => void; busy: boolean; approved: boolean }) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState('')
  const need = useRequired(why, 'Write the reason first (the applicant sees it).')
  return (
    <section className="card" aria-labelledby="withdraw">
      <h2 id="withdraw">Withdraw</h2>
      {!open ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            When the applicant gives up {approved ? 'the scholarship' : 'the application'} (for example, transferred school).
            {approved ? ' Their slot opens for the next waitlisted applicant.' : ''}
          </p>
          <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setOpen(true)}>Withdraw this application…</button>
        </>
      ) : (
        <>
          <label className="field">Reason (shown to the applicant and logged)
            <textarea {...need.props} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Applicant transferred to another school" />
            {need.error}
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger-outline" disabled={busy} onClick={() => need.check() && onSave(why.trim())}>Yes, withdraw</button>
            <button type="button" className="btn-danger-link" onClick={() => setOpen(false)}>Cancel</button>
          </span>
        </>
      )}
    </section>
  )
}
