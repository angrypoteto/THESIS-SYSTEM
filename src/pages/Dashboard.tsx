import type React from 'react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Journey, journeyStop } from '../components/Journey'
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

/** A calendar file for the student's own calendar app (exam, interview). */
function downloadIcs(title: string, startIso: string, minutes: number, location: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = new Date(startIso)
  const end = new Date(start.getTime() + minutes * 60000)
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CMCS Portal//EN', 'BEGIN:VEVENT', `UID:${start.getTime()}@cmcs`,
    `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${title}`, `LOCATION:${location}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = `${title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

interface NextStep { title: string; text: React.ReactNode; to?: string; cta?: string; when?: string; where?: string; bring?: string; calendar?: [string, string, number, string]; tone?: 'blue' | 'warn' | 'calm' }

/** Redesign (Nov 24): greeting, the path with "you are here", one Do-this-now card, documents and messages. */
function ApplicantHome() {
  const { profile } = useAuth()
  const [applicant, setApplicant] = useState<ApplicantRow | null>(null)
  const [app, setApp] = useState<AppRow | null>(null)
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [step2Docs, setStep2Docs] = useState<DocumentType[]>([])
  const [interview, setInterview] = useState<{ slot_start: string; location: string | null } | null>(null)
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
        const row = r.data as AppRow | null
        if (live) setApp(row)
        // the step 2 requirements are shown only to applicants who passed the exam (client, 2026-11-21)
        if (row?.stage === 2) {
          const [d, iv] = await Promise.all([
            supabase.from('document_types').select('code,name,required,stage,required_when').eq('stage', 2).order('required', { ascending: false }),
            supabase.from('interviews').select('slot_start,location,status').eq('application_id', row.id).eq('status', 'scheduled').order('slot_start').limit(1),
          ])
          if (live) {
            setStep2Docs((d.data as DocumentType[]) ?? [])
            setInterview((iv.data?.[0] as { slot_start: string; location: string | null }) ?? null)
          }
        }
      }
      // opening the home screen marks messages as read
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
  const { at, finished } = journeyStop(app?.status === 'draft' && app.stage === 1 ? undefined : app?.status, app?.stage)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Magandang umaga' : hour < 18 ? 'Magandang hapon' : 'Magandang gabi'
  const longDate = (d: string) => new Date(d).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const next: NextStep = (() => {
    if (!profileComplete) return { title: 'Complete your profile', text: 'Add your school, course, year level and barangay. It takes two minutes.', to: '/profile', cta: 'Complete my profile' }
    if (reupload.length) return { tone: 'warn', title: `Upload a clearer copy of your ${DOC_NAME[reupload[0].type_code] ?? 'document'}`, text: 'The office could not read it. Take the photo again in good light, with the whole page flat in the frame.', to: '/app/application', cta: 'Upload again' }
    if (app?.stage === 2 && app.status === 'draft') return { title: 'Complete step 2', text: 'You passed the qualifying exam. Add your household, income and living conditions, and upload the step 2 requirements.', when: cycle?.step2_closes_at ?? undefined, to: '/app/application', cta: 'Continue to step 2' }
    if (s === 'exam_eligible' && cycle?.exam_at) return { title: 'Take the qualifying exam', text: 'You are cleared for the exam. Come on time.', when: cycle.exam_at, where: cycle.exam_venue ?? 'Rizal Technological University', bring: 'Your RTU ID and a pencil', calendar: ['CMCS qualifying exam', cycle.exam_at, 180, cycle.exam_venue ?? 'RTU'] }
    if (s === 'exam_eligible') return { tone: 'calm', title: 'You are cleared for the qualifying exam', text: 'The exam schedule will be emailed to you and shown here.' }
    if (s === 'eligible' && interview) return { title: 'Go to your interview', text: 'Bring the original copies of your step 2 documents.', when: interview.slot_start, where: interview.location ?? 'Mandaluyong City Hall', calendar: ['CMCS scholarship interview', interview.slot_start, 30, interview.location ?? 'Mandaluyong City Hall'] }
    if (s === 'eligible') return { tone: 'calm', title: 'Your interview comes next', text: 'The office schedules it and emails you the date, time and place.' }
    if (['submitted', 'under_review'].includes(s)) return { tone: 'calm', title: 'The office is checking your documents', text: 'Usually 1 to 3 working days. You get a message here when they are done.' }
    if (s === 'ranked') return { tone: 'calm', title: 'The final selection is being made', text: 'You will see your result here.' }
    if (['approved', 'waitlisted', 'not_selected', 'exam_failed', 'ineligible', 'withdrawn'].includes(s)) return { tone: 'calm', title: s === 'approved' ? 'Your result is ready' : 'See your result', text: 'Open your application for the details and the next steps.', to: '/app/application', cta: 'See my result' }
    if (!cycle || cycle.status !== 'open') return { tone: 'calm', title: 'No application period is open right now', text: 'We will show the next one here.' }
    return { title: app ? 'Finish your application' : 'Start your application', text: 'Short steps, saved as you go. Have your COR and grade report ready.', when: cycle.closes_at, to: '/app/application', cta: app ? 'Continue' : 'Start my application' }
  })()
  const days = next.when ? Math.ceil((Date.parse(next.when) - Date.now()) / 86400000) : null

  return (
    <>
      <div className="page-head" style={{ marginBottom: 4 }}>
        <div>
          <p>{greeting},</p>
          <h1 style={{ fontSize: 'clamp(30px, 4vw, 42px)' }}>{profile?.full_name.split(' ')[0] || 'applicant'}</h1>
        </div>
        {/* the official Applicant ID exists only after the applicant qualifies to proceed (client, 2026-11-15) */}
        {app?.applicant_no && <span className="pill info">Applicant ID {app.applicant_no}</span>}
      </div>

      {app && app.status !== 'draft' || app?.stage === 2 ? (
        <section className="card" aria-label="Your scholarship path" style={{ padding: '20px 12px 16px' }}>
          <Journey at={at} finished={finished} notes={[
            app?.submitted_at ? `Sent ${new Date(app.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : null,
            cycle?.exam_at ? new Date(cycle.exam_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null,
            'If you pass', 'City Hall', 'In the portal',
          ]} />
        </section>
      ) : null}

      <div className="split">
        <div className="main">
          <section className={`do-now ${next.tone ?? 'blue'}`} aria-labelledby="todo">
            <div className="do-now-text">
              <span className="eyebrow">{next.tone === 'calm' ? 'Where things are' : 'Do this now'}</span>
              <h2 id="todo">{next.title}</h2>
              <p>{next.text}</p>
              {(next.when || next.where || next.bring) && (
                <ul className="do-now-facts">
                  {next.when && <li>📅 {longDate(next.when)}</li>}
                  {next.where && <li>📍 {next.where}</li>}
                  {next.bring && <li>🪪 Bring {next.bring.charAt(0).toLowerCase() + next.bring.slice(1)}</li>}
                </ul>
              )}
              <div className="actions" style={{ marginTop: 4 }}>
                {next.to && <Link to={next.to} className="btn btn-lg btn-on-blue">{next.cta}</Link>}
                {next.calendar && <button type="button" className="btn btn-lg btn-on-blue" onClick={() => downloadIcs(...next.calendar!)}>Add to my calendar</button>}
              </div>
            </div>
            {days != null && days >= 0 && (
              <div className="do-now-count" aria-label={`${days} days to go`}><b>{days}</b><span>{days === 1 ? 'day' : 'days'} {next.calendar ? 'to go' : 'left'}</span></div>
            )}
          </section>

          {app?.stage === 2 && step2Docs.length > 0 && app.status === 'draft' && (
            <section className="card" aria-labelledby="step2req">
              <h2 id="step2req">Step 2 requirements</h2>
              <p className="muted" style={{ marginTop: 0 }}>Prepare these and upload them in your application.</p>
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
          {docs.length > 0 && (
            <section className="card" aria-labelledby="docs-h">
              <h2 id="docs-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>Your documents
                <span className={`pill small ${reupload.length ? 'warn' : docs.every((d) => ['pass', 'accepted'].includes(d.verification_status)) ? 'ok' : 'info'}`}>
                  {docs.filter((d) => ['pass', 'accepted'].includes(d.verification_status)).length} of {docs.length} accepted</span></h2>
              {docs.map((d) => (
                <div key={d.type_code} className="doc-line"><span>{DOC_NAME[d.type_code] ?? d.type_code}</span><span className={DOC_STATUS[d.verification_status]?.[1]}>{DOC_STATUS[d.verification_status]?.[0]}</span></div>
              ))}
            </section>
          )}
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
          <section className="card help-card">
            <b>Questions?</b>
            <span className="small">Mandaluyong Educational Service Office, City Hall 2nd floor · Mon to Fri, 8:00 AM to 5:00 PM</span>
          </section>
        </aside>
      </div>
    </>
  )
}
