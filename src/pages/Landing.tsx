import type React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Logo, PartnerLockup } from '../components/Logos'
import { supabase } from '../lib/supabase'
import type { DocumentType, ProgramCycle } from '../lib/types'

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })

const STEPS: [string, string][] = [
  ['Step 1: initial screening', 'Create an account, enter your GWA, and upload your RTU COR and grades (IER, or SHS Form 138 if you are an incoming 1st year). Staff check them; nothing is rejected automatically.'],
  ['Qualifying exam at RTU', 'If you pass the screening, you take the qualifying exam for your course at RTU. Your exam score counts for 70% and your grades (GWA) for 30%. Applicants are ranked on this combined result.'],
  ['Step 2: requirements', 'The top-ranked applicants proceed and are emailed an official Applicant ID. They add their household, income and living conditions, and upload the step 2 documents.'],
  ['Ranking and final selection', 'Applicants who complete step 2 are ranked by need and grades, and the scholars are selected from that ranking up to the available slots. You are notified by email.'],
]

/** Landing page (client changes 2026-11-21): CMCS program title, City × MESO, key dates, who can apply, step 1 requirements, how it works. */
export function Landing() {
  const { session } = useAuth()
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [docs, setDocs] = useState<DocumentType[]>([])
  // published FAQs, written by the office on Administration > FAQs
  const [faqs, setFaqs] = useState<{ id: number; question: string; answer: string }[]>([])

  useEffect(() => {
    supabase.from('program_cycles').select('*').in('status', ['open', 'closed']).order('opens_at', { ascending: false }).limit(1)
      .then(({ data }) => setCycle((data?.[0] as ProgramCycle) ?? null))
    supabase.from('document_types').select('code,name,required,stage,required_when').order('stage').order('required', { ascending: false })
      .then(({ data }) => setDocs((data as DocumentType[]) ?? []))
    supabase.from('faqs').select('id,question,answer').eq('is_published', true).order('sort_order').order('id')
      .then(({ data }) => setFaqs((data as { id: number; question: string; answer: string }[]) ?? []))
  }, [])

  const now = Date.now()
  const open = cycle && cycle.status === 'open' && now >= Date.parse(cycle.opens_at) && now <= Date.parse(cycle.closes_at)
  const dates: { label: string; value: string | null; note: string; done: boolean }[] = cycle ? [
    { label: 'Applications open', value: fmtDate(cycle.opens_at), note: 'Step 1 starts', done: now >= Date.parse(cycle.opens_at) },
    { label: 'Step 1 deadline', value: fmtDateTime(cycle.closes_at), note: 'COR and grades', done: now > Date.parse(cycle.closes_at) },
    { label: 'Qualifying exam', value: cycle.exam_at ? fmtDateTime(cycle.exam_at) : null, note: cycle.exam_venue ?? 'At RTU', done: !!cycle.exam_at && now > Date.parse(cycle.exam_at) },
    { label: 'Step 2 deadline', value: cycle.step2_closes_at ? fmtDateTime(cycle.step2_closes_at) : null, note: 'Exam passers only', done: !!cycle.step2_closes_at && now > Date.parse(cycle.step2_closes_at) },
  ] : []

  // light hero: solid blue primary + outline; dark closing band: white + ghost
  const ctaButtons = (onDark: boolean) => session ? (
    <Link to="/app" className={`btn btn-lg ${onDark ? 'btn-on-blue' : ''}`}>Go to my home screen</Link>
  ) : (
    <>
      <Link to="/check" className={`btn btn-lg ${onDark ? 'btn-on-blue' : ''}`}>Check if I can apply</Link>
      <Link to="/signin" className={`btn btn-lg ${onDark ? 'btn-ghost-on-blue' : 'btn-outline'}`}>I have an account</Link>
    </>
  )
  const daysLeft = open && cycle ? Math.max(0, Math.ceil((Date.parse(cycle.closes_at) - now) / 86400000)) : null
  const short = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'To follow')
  const path: [string, string, string][] = cycle ? [
    ['Apply online', 'COR and grades', `Until ${short(cycle.closes_at)}`],
    ['Qualifying exam', cycle.exam_venue ?? 'At RTU', short(cycle.exam_at)],
    ['Step 2 requirements', 'Exam passers only', cycle.step2_closes_at ? `Until ${short(cycle.step2_closes_at)}` : 'To follow'],
    ['Interview', 'Mandaluyong City Hall', 'After step 2'],
    ['Result', 'In the portal', 'After the interviews'],
  ] : []
  const pathAt = cycle ? (now <= Date.parse(cycle.closes_at) ? 0 : cycle.exam_finalized_at ? (cycle.step2_closes_at && now > Date.parse(cycle.step2_closes_at) ? 3 : 2) : 1) : 0

  return (
    <>
      {/* redesign (Nov 24): the student-facing headline, a live countdown, and the cycle's path on frosted glass over the city photo */}
      <section className="hero2" aria-labelledby="hero-h">
        <div className="hero2-text">
          {cycle ? (
            <span className="live-chip">{open && <span className="live-dot" aria-hidden="true" />}
              {open ? <>Applications open for SY {cycle.school_year} · <b>{daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</b></>
                : <>{cycle.school_year}, {cycle.term} · step 1 is closed</>}
            </span>
          ) : <span className="live-chip">No application period is open right now</span>}
          <h1 id="hero-h">Your college, <em>supported by your city.</em></h1>
          <p>
            The City of Mandaluyong Collegiate Scholarship (CMCS) Program helps incoming 1st and 2nd year students of Rizal Technological University
            who live in Mandaluyong. Apply from your phone in about 20 minutes, then follow every step until the result.
          </p>
          <div className="actions" style={{ marginTop: 0 }}>{ctaButtons(false)}</div>
          <ul className="trust">
            <li>Free to apply</li><li>No fixers: apply yourself</li><li>Protected under the Data Privacy Act of 2012</li>
          </ul>
        </div>
        <div className="hero2-photo" style={{ '--hero-bg': `url(${new URL('images/mandaluyong-city.jpg', document.baseURI).href})` } as React.CSSProperties}>
          <span className="hero2-seal"><Logo which="mandaluyong" size={72} /></span>
          {cycle && (
            <div className="glass-path">
              <h2>Your path this cycle</h2>
              <ol>
                {path.map(([t, sub, when], i) => (
                  <li key={t} className={i < pathAt ? 'done' : i === pathAt ? 'now' : ''}>
                    <i aria-hidden="true">{i < pathAt ? '✓' : i + 1}</i>
                    <span>{t}<small>{sub}</small></span>
                    <small className="when">{when}</small>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>
      {/* the two institutions behind the program */}
      <section className="partner-band single" aria-labelledby="partners">
        <h2 id="partners" className="sr">Program partners</h2>
        <div className="partner-card">
          <Logo which="mandaluyong" size={72} />
          <div>
            <h3>City of Mandaluyong</h3>
            <p>The Educational Service Office runs the scholarship: it checks requirements, ranks applicants and decides who receives the allowance.</p>
          </div>
        </div>
      </section>

      {cycle && (
        <section className="card" aria-labelledby="dates">
          <h2 id="dates">Key dates</h2>
          <ol className="date-line">
            {dates.map((d) => (
              <li key={d.label} className={d.done ? 'done' : ''}>
                <span className="date-label">{d.label}</span>
                <strong>{d.value ?? 'To be announced'}</strong>
                <span className="small muted">{d.note}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid three">
        <section className="card">
          <h2>Who can apply</h2>
          <ul className="check-list">
            <li><strong>Enrolled at Rizal Technological University (RTU)</strong> this term, with a valid COR</li>
            <li>Incoming <strong>1st or 2nd year</strong> college</li>
            <li>Resident of Mandaluyong City</li>
            <li>You and both parents are registered voters in the city</li>
            <li>General weighted average of at least {cycle?.gwa_cutoff ?? 81}%</li>
            <li>Not receiving another scholarship</li>
          </ul>
        </section>
        <section className="card">
          <h2>What to prepare</h2>
          <p className="small" style={{ margin: '0 0 4px' }}><strong>Step 1</strong> (everyone)</p>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            {docs.filter((d) => d.stage === 1).map((d) => <li key={d.code}>{d.name}</li>)}
          </ul>
          <p className="small" style={{ margin: '12px 0 0' }}>If you pass the qualifying exam, the step 2 requirements appear on your dashboard.</p>
          <p className="small muted" style={{ marginBottom: 0 }}>Clear phone photos in good light are fine. PDF scans also work.</p>
        </section>
        <section className="card">
          <h2>Your data</h2>
          <p style={{ marginTop: 0 }}>
            Used only to select scholars, under the Data Privacy Act of 2012. Your sex is asked only because the office form asks it and is never used to rank you; documents are
            stored privately, and every staff action on your application is logged.
          </p>
          <p>You can ask why you were or were not selected.</p>
          <Link to="/signup" className="back">Read the privacy notice</Link>
        </section>
      </div>

      <section className="card">
        <h2>How it works</h2>
        <ol className="how-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <span className="how-num">{i + 1}</span>
              <strong>{t}</strong>
              <span className="small muted">{d}</span>
            </li>
          ))}
        </ol>
      </section>

      {faqs.length > 0 && (
        <section className="card" aria-labelledby="faq">
          <h2 id="faq">Frequently asked questions</h2>
          <div className="faq">
            {faqs.map((q) => (
              <details key={q.id}>
                <summary>{q.question}</summary>
                <p style={{ whiteSpace: 'pre-line' }}>{q.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="cta-band">
        <PartnerLockup size={44} onDark />
        <h2>{open ? 'Applications are open' : 'Get ready for the next application period'}</h2>
        <p>{open && cycle ? `Step 1 closes on ${fmtDateTime(cycle.closes_at)}. Have your COR and grades ready before you start.` : 'Create your account now so you can apply as soon as the period opens.'}</p>
        <div className="actions" style={{ justifyContent: 'center', marginTop: 0 }}>{ctaButtons(true)}</div>
      </section>
      <p className="photo-credits">
        Background photo: <a href="https://commons.wikimedia.org/wiki/File:Mandaluyong_City_View_(cropped).jpg" target="_blank" rel="noreferrer">Mandaluyong City View</a> by
        Ganmatthew, CC0, via Wikimedia Commons.
      </p>
    </>
  )
}
