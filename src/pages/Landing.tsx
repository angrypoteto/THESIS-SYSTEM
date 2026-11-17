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

const CRITERIA: [string, string][] = [
  ['Income per person', 'Household income divided by the number of people in the household. Lower income ranks higher.'],
  ['Living conditions', 'Housing, water, electricity, appliances, and your parents’ education and work. Income is not counted again here.'],
  ['Household size', 'How many people live and eat with you.'],
  ['Grades', 'Your general weighted average, converted from RTU’s 1.00 to 5.00 scale (1.00 is highest).'],
]

const FAQ: [string, string][] = [
  ['I am an incoming 1st year. I have no IER yet.', 'Upload your Senior High School report card (Form 138) instead. Incoming 2nd years upload their RTU IER.'],
  ['Where and when is the qualifying exam?', 'RTU gives the exam on paper. The date and venue appear on this page and in your account once the office sets them.'],
  ['When do I get an Applicant ID?', 'After the exam. Only applicants who qualify to proceed receive an official Applicant ID (for example MESO-2026-00125) by email. You keep signing in with your email and password.'],
  ['Our income is above PHP 250,000 a year. Can I still apply?', 'Yes. The application is not rejected automatically; an evaluator reviews it, for example when the household includes extended family.'],
  ['One of my parents has passed away or is not with us.', 'Upload what you have and add a note. A staff member reviews it and can clear the voter-certificate requirement with a written reason.'],
  ['Someone in my family is sick or has a disability.', 'Tick "Ill / PWD" for that person in the household list. You will be asked for a medical certificate, and the office takes it into account.'],
  ['My phone photo is blurry. Will I be rejected?', 'No. Unclear documents go to a staff member, who can ask you for a clearer copy. You upload it again without redoing the form.'],
  ['Does a computer decide who gets the scholarship?', 'No. The system checks documents, estimates need and ranks applicants with published criteria, but office staff make every final decision, and you can ask why you were or were not selected.'],
  ['Can I edit my application after submitting?', 'Not after you submit a step, so check the review page first. If staff ask for a clearer copy of a document, you can replace just that document.'],
]

/** Landing page: the Mandaluyong × RTU program, key dates, eligibility, requirements, how ranking works, FAQ. */
export function Landing() {
  const { session } = useAuth()
  const [cycle, setCycle] = useState<ProgramCycle | null>(null)
  const [docs, setDocs] = useState<DocumentType[]>([])

  useEffect(() => {
    supabase.from('program_cycles').select('*').in('status', ['open', 'closed']).order('opens_at', { ascending: false }).limit(1)
      .then(({ data }) => setCycle((data?.[0] as ProgramCycle) ?? null))
    supabase.from('document_types').select('code,name,required,stage,required_when').order('stage').order('required', { ascending: false })
      .then(({ data }) => setDocs((data as DocumentType[]) ?? []))
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
    <Link to="/app" className={`btn btn-lg ${onDark ? 'btn-on-blue' : ''}`}>Go to my dashboard</Link>
  ) : (
    <>
      <Link to="/signup" className={`btn btn-lg ${onDark ? 'btn-on-blue' : ''}`}>Start my application</Link>
      <Link to="/signin" className={`btn btn-lg ${onDark ? 'btn-ghost-on-blue' : 'btn-outline'}`}>I already have an account</Link>
    </>
  )

  return (
    <>
      {/* faint Mandaluyong aerial photo behind the hero (CSS var so the GitHub Pages base path is respected) */}
      <div className="hero-band has-photo"
        style={{ margin: '-28px calc(50% - 50vw) 0', '--hero-bg': `url(${new URL('images/mandaluyong-city.jpg', document.baseURI).href})` } as React.CSSProperties}>
        <div className="hero-inner">
          <div>
            <PartnerLockup size={60} onDark />
            {cycle ? (
              <span className="pill">{open ? 'Applications open' : 'Step 1 closed'} · {cycle.school_year}, {cycle.term}{open ? ` · until ${fmtDate(cycle.closes_at)}` : ''}</span>
            ) : (
              <span className="pill">No application period is open right now</span>
            )}
            <h1>Scholarship for RTU students from Mandaluyong</h1>
            <p>
              The City of Mandaluyong supports incoming 1st and 2nd year students of Rizal Technological University. Apply from home,
              upload your documents, take the qualifying exam at RTU, and follow your application until the result.
            </p>
            <div className="actions" style={{ marginTop: 0 }}>{ctaButtons(true)}</div>
          </div>
          {/* Mandaluyong and RTU photos overlap: the city and the university behind one program */}
          <div className="hero-photos">
            <figure className="hero-photo city">
              <img src={`${import.meta.env.BASE_URL}images/mandaluyong-city.jpg`} alt="Aerial view of Mandaluyong City along the Pasig River" width={1600} height={900} />
              <figcaption><Logo which="mandaluyong" size={26} /> City of Mandaluyong</figcaption>
            </figure>
            <figure className="hero-photo rtu">
              <img src={`${import.meta.env.BASE_URL}images/rtu-campus.jpg`} alt="Rizal Technological University gate arch" width={1200} height={856} />
              <figcaption><Logo which="rtu" size={26} /> Rizal Technological University</figcaption>
            </figure>
          </div>
        </div>
      </div>

      {/* the two institutions behind the program */}
      <section className="partner-band" aria-labelledby="partners">
        <h2 id="partners" className="sr">Program partners</h2>
        <div className="partner-card">
          <Logo which="mandaluyong" size={72} />
          <div>
            <h3>City of Mandaluyong</h3>
            <p>The Educational Service Office runs the scholarship: it checks requirements, ranks applicants and decides who receives the allowance.</p>
          </div>
        </div>
        <div className="partner-card">
          <Logo which="rtu" size={72} />
          <div>
            <h3>Rizal Technological University</h3>
            <p>The scholarship is for RTU students. RTU gives the qualifying exam, and your RTU COR and grades are the first requirements.</p>
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
          <p className="small" style={{ margin: '12px 0 4px' }}><strong>Step 2</strong> (only if you pass the exam)</p>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            {docs.filter((d) => d.stage === 2).map((d) => (
              <li key={d.code}>{d.name}{d.required_when === 'member_ill' && <span className="muted"> (if a household member is ill)</span>}</li>
            ))}
          </ul>
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

      <section className="card" aria-labelledby="ranking">
        <h2 id="ranking">How applicants are ranked</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Everyone who proceeds after the exam and passes the eligibility checks is compared on the same four criteria. The weight of each
          criterion is set by the office. Students with greater need rank higher, and grades also count.
        </p>
        <div className="criteria-grid">
          {CRITERIA.map(([t, d], i) => (
            <div key={t} className="criterion">
              <span className="crit-code">C{i + 1}</span>
              <strong>{t}</strong>
              <span className="small muted">{d}</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          A computer model helps staff spot households that may need a closer look, but it never rejects anyone on its own.
          Office staff make every final decision.
        </p>
      </section>

      <section className="card" aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <PartnerLockup size={44} onDark />
        <h2>{open ? 'Applications are open' : 'Get ready for the next application period'}</h2>
        <p>{open && cycle ? `Step 1 closes on ${fmtDateTime(cycle.closes_at)}. Have your COR and grades ready before you start.` : 'Create your account now so you can apply as soon as the period opens.'}</p>
        <div className="actions" style={{ justifyContent: 'center', marginTop: 0 }}>{ctaButtons(true)}</div>
      </section>
      <p className="photo-credits">
        Photos: <a href="https://commons.wikimedia.org/wiki/File:Mandaluyong_City_View_(cropped).jpg" target="_blank" rel="noreferrer">Mandaluyong City View</a> by
        Ganmatthew, CC0; <a href="https://commons.wikimedia.org/wiki/File:Rizal_Technological_University_Pasig_6.jpg" target="_blank" rel="noreferrer">Rizal
        Technological University Pasig</a> by Valenzuela400, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>,
        cropped and resized (RTU Pasig campus). Both via Wikimedia Commons.
      </p>
    </>
  )
}
