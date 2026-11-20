import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { DocumentType, ProgramCycle } from '../lib/types'

/** Sends each role to its home screen. */
export function Dashboard() {
  const { profile } = useAuth()
  if (!profile) return null
  if (profile.role === 'admin' || profile.role === 'evaluator') return <Navigate to="/staff" replace />
  return <ApplicantHome />
}

interface ApplicantRow { school_id: number | null; barangay_id: number | null; course: string | null; year_level: number | null }
interface AppRow {
  id: string; status: string; stage: 1 | 2; submitted_at: string | null; cycle_id: number; applicant_no: string | null
  documents: { type_code: string; verification_status: string; is_current: boolean }[]
}
interface Note { id: number; title: string; body: string; created_at: string; read_at: string | null }

const DOC_NAME: Record<string, string> = {
  cor: 'Certificate of Registration', gwa_certificate: 'GWA certificate', barangay_indigency: 'Barangay certificate of indigency',
  voter_certificate: 'Voter certificate (COMELEC)', income_proof: 'Proof of income',
}
const DOC_STATUS: Record<string, [string, string]> = {
  pending: ['Being checked', 'muted'], review: ['Being checked', 'muted'], pass: ['Verified', 'success'],
  accepted: ['Verified', 'success'], rejected: ['Needs a clearer copy', 'error'],
}

/** Design screen 2: where the application is, what to do now, documents, messages. */
function ApplicantHome() {
  const { profile } = useAuth()
  const [applicant, setApplicant] = useState<ApplicantRow | null>(null)
  const [app, setApp] = useState<AppRow | null>(null)
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [step2Docs, setStep2Docs] = useState<DocumentType[]>([])
  const userId = profile?.id

  useEffect(() => {
    if (!userId) return
    let live = true
    Promise.all([
      supabase.from('applicants').select('school_id,barangay_id,course,year_level').eq('id', userId).maybeSingle(),
      supabase.from('program_cycles').select('*').in('status', ['open', 'closed', 'ranked', 'finalized']).order('opens_at', { ascending: false }).limit(1),
      supabase.from('notifications').select('id,title,body,created_at,read_at').order('created_at', { ascending: false }).limit(5),
    ]).then(async ([a, c, n]) => {
      if (!live) return
      setApplicant(a.data as ApplicantRow)
      const cyc = (c.data?.[0] as ProgramCycle) ?? null
      setCycle(cyc)
      setNotes((n.data as Note[]) ?? [])
      if (cyc) {
        const r = await supabase.from('applications').select('id,status,stage,submitted_at,cycle_id,applicant_no,documents(type_code,verification_status,is_current)').eq('cycle_id', cyc.id).maybeSingle()
        if (live) setApp(r.data as AppRow | null)
        // the step 2 requirements are shown only to applicants who passed the exam (client, 2026-11-21)
        if ((r.data as AppRow | null)?.stage === 2) {
          const d = await supabase.from('document_types').select('code,name,required,stage,required_when').eq('stage', 2).order('required', { ascending: false })
          if (live) setStep2Docs((d.data as DocumentType[]) ?? [])
        }
      }
      // opening the dashboard marks messages as read
      const unread = ((n.data as Note[]) ?? []).filter((x) => !x.read_at).map((x) => x.id)
      if (unread.length) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread)
    })
    return () => {
      live = false
    }
  }, [userId])

  const profileComplete = Boolean(applicant?.school_id && applicant?.barangay_id && applicant?.course && applicant?.year_level)
  const docs = (app?.documents ?? []).filter((d) => d.is_current)
  const reupload = docs.filter((d) => d.verification_status === 'rejected')
  const s = app?.status ?? 'none'
  const reached =
    s === 'none' || s === 'draft' ? -1 : s === 'submitted' ? 0 : s === 'under_review' ? 0 : s === 'eligible' || s === 'ineligible' ? 2 : s === 'ranked' ? 3 : 4
  const labels: [string, string][] = [
    ['Submitted', app?.submitted_at ? new Date(app.submitted_at).toLocaleDateString('en-PH') : 'Not yet'],
    ['Documents checked', reupload.length ? 'Action needed' : docs.length && docs.every((d) => ['pass', 'accepted'].includes(d.verification_status)) ? 'Done' : 'Waiting'],
    ['Eligibility', s === 'ineligible' ? 'Not eligible' : reached >= 2 ? 'Eligible' : 'Waiting'],
    ['Ranking', reached >= 3 ? 'Ranked' : cycle ? `After ${new Date(cycle.closes_at).toLocaleDateString('en-PH')}` : '—'],
    ['Result', reached >= 4 ? s.replace('_', ' ') : 'Staff decision'],
  ]

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <p>{cycle ? `${cycle.term}, S.Y. ${cycle.school_year}` : ''}</p>
          <h1>Welcome, {profile?.full_name.split(' ')[0] || 'applicant'}</h1>
        </div>
        {/* the official Applicant ID exists only after the applicant qualifies to proceed (client, 2026-11-15) */}
        {app?.applicant_no && <span className="pill info">Applicant ID {app.applicant_no}</span>}
      </div>

      {app && app.status !== 'draft' && (
        <section className="card" aria-labelledby="where">
          <div className="page-head" style={{ marginBottom: 18 }}>
            <h2 id="where" style={{ margin: 0 }}>Where your application is</h2>
            {reupload.length > 0 && <span className="pill warn">{reupload.length} document needs a clearer copy</span>}
          </div>
          <ol className="timeline" aria-label="Application progress">
            {labels.map(([t, sub], i) => (
              <li key={t} className={i === 1 && reupload.length ? 'attention' : i <= reached || (i === 1 && sub === 'Done') ? 'done' : ''}>
                <strong>{t}</strong><span>{sub}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="split">
        <div className="main">
          <section className="card" aria-labelledby="todo">
            <h2 id="todo">What to do now</h2>
            {!profileComplete ? (
              <ToDo title="Complete your profile" text="Add your school, course, year level and barangay." to="/profile" cta="Complete my profile" />
            ) : app?.stage === 2 && app.status === 'draft' ? (
              <ToDo title="Complete step 2" text="You passed the qualifying exam. Add your household, income and living conditions, and upload the step 2 requirements listed below." to="/app/application" cta="Continue to step 2" />
            ) : !cycle || cycle.status !== 'open' ? (
              <p className="muted" style={{ margin: 0 }}>No application period is open right now.</p>
            ) : !app || app.status === 'draft' ? (
              <ToDo title={app ? 'Finish your application' : 'Start your application'} text="Six short steps. Everything is saved as you go." to="/app/application" cta={app ? 'Continue' : 'Start'} />
            ) : reupload.length ? (
              <ToDo warn title={`Re-upload your ${DOC_NAME[reupload[0].type_code]}`} text="A staff member could not read it clearly. Take the photo again in good light, with the whole page flat in the frame." to="/app/application" cta="Upload again" />
            ) : (
              <p style={{ margin: 0 }}>Nothing to do right now. We will message you when something changes.</p>
            )}
            {docs.length > 0 && (
              <>
                <h3 className="mt">Your documents</h3>
                <table className="table">
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.type_code}><td>{DOC_NAME[d.type_code] ?? d.type_code}</td><td className={DOC_STATUS[d.verification_status]?.[1]} style={{ fontWeight: 600 }}>{DOC_STATUS[d.verification_status]?.[0]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
          {app?.stage === 2 && step2Docs.length > 0 && (
            <section className="card" aria-labelledby="step2req">
              <h2 id="step2req">Step 2 requirements</h2>
              <p className="muted" style={{ marginTop: 0 }}>Because you passed the qualifying exam, prepare and upload these in your application.</p>
              <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
                {step2Docs.map((d) => (
                  <li key={d.code}>{d.name}{d.required_when === 'member_ill' && <span className="muted"> (if a household member is ill)</span>}</li>
                ))}
              </ul>
              <p className="small muted" style={{ marginBottom: 0 }}>Clear phone photos in good light are fine. PDF scans also work.</p>
            </section>
          )}
        </div>
        <aside className="side">
          <section className="card" aria-labelledby="msgs">
            <h2 id="msgs">Messages</h2>
            {notes.length === 0 && <p className="muted" style={{ margin: 0 }}>No messages yet.</p>}
            {notes.map((n) => (
              <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <strong style={{ display: 'block' }}>{!n.read_at && <span className="status-dot pending" style={{ marginRight: 6 }} />}{n.title}</strong>
                <span className="small">{n.body}</span>
                <div className="small muted">{new Date(n.created_at).toLocaleString('en-PH')}</div>
              </div>
            ))}
          </section>
          <section className="banner info">You can ask the office why you were or were not selected. The result page shows the reasons.</section>
        </aside>
      </div>
    </>
  )
}

function ToDo({ title, text, to, cta, warn }: { title: string; text: string; to: string; cta: string; warn?: boolean }) {
  return (
    <div className={`card ${warn ? 'warn' : ''}`} style={{ marginBottom: 0, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 300px' }}>
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>{text}</p>
      </div>
      <Link to={to} className="btn btn-lg">{cta}</Link>
    </div>
  )
}
