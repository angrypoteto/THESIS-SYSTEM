import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SealStamp } from '../components/Journey'
import { supabase } from '../lib/supabase'

/** Six yes/no questions from the program's rules (redesign, Nov 24). Nothing is saved. */
export function EligibilityCheck() {
  const [cutoff, setCutoff] = useState(81)
  useEffect(() => {
    supabase.from('program_cycles').select('gwa_cutoff').in('status', ['open', 'closed']).order('opens_at', { ascending: false }).limit(1)
      .then(({ data }) => { const c = (data?.[0] as { gwa_cutoff: number } | undefined)?.gwa_cutoff; if (c) setCutoff(Number(c)) })
  }, [])
  const QUESTIONS: { q: string; hint?: string; no: string }[] = [
    { q: 'Are you enrolled at Rizal Technological University (RTU) this term?', hint: 'You will upload your RTU Certificate of Registration.',
      no: 'The program is only for students enrolled at RTU this term.' },
    { q: 'Are you an incoming 1st or 2nd year college student?', no: 'The program is for incoming 1st and 2nd year students only.' },
    { q: 'Do you live in Mandaluyong?', no: 'You need to be a resident of the City of Mandaluyong.' },
    { q: `Is your general weighted average (GWA) ${cutoff}% or higher?`, hint: 'From your latest report card (Form 138) or RTU grades (IER).',
      no: `The GWA must be at least ${cutoff}%.` },
    { q: 'Are you and both your parents registered voters in Mandaluyong?', hint: 'If a parent has passed away or is not around, the office decides case by case.',
      no: 'You and your parents need to be registered voters in the city. If a parent has passed away or is not around, ask the office.' },
    { q: 'Are you free of any other scholarship right now?', no: 'You cannot receive another scholarship at the same time.' },
  ]
  const [answers, setAnswers] = useState<(boolean | null)[]>(QUESTIONS.map(() => null))
  const set = (i: number, v: boolean) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)))
  const answered = answers.filter((a) => a !== null).length
  const done = answered === QUESTIONS.length
  const failed = QUESTIONS.filter((_, i) => answers[i] === false)

  return (
    <div className="check-page">
      <section className="card check-questions" aria-labelledby="check-h">
        <div className="card-head">
          <h1 id="check-h" style={{ margin: 0 }}>Can I apply?</h1>
          <span className={`pill small ${done ? 'ok' : 'info'}`}>{answered} of {QUESTIONS.length} answered</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Six quick questions from the program's rules. Nothing you answer here is saved.</p>
        <ol className="yn-list">
          {QUESTIONS.map((x, i) => (
            <li key={x.q}>
              <div><b>{x.q}</b>{x.hint && <span className="small muted">{x.hint}</span>}</div>
              <div className="yn" role="group" aria-label={x.q}>
                <button type="button" aria-pressed={answers[i] === true} onClick={() => set(i, true)}>Yes</button>
                <button type="button" aria-pressed={answers[i] === false} onClick={() => set(i, false)}>No</button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card check-result" aria-live="polite">
        {!done ? (
          <div className="moment" style={{ padding: '12px 8px' }}>
            <h2 style={{ margin: 0 }}>Your answer appears here</h2>
            <p>Answer all six questions. It takes about 30 seconds.</p>
          </div>
        ) : failed.length === 0 ? (
          <div className="moment" style={{ padding: '8px' }}>
            <SealStamp />
            <h1>Yes, you can apply.</h1>
            <p>You meet the six rules. Applying takes about 20 minutes. Keep these ready:</p>
            <ul className="prepare">
              <li>RTU Certificate of Registration (COR)</li>
              <li>Grade report: RTU IER, or Form 138 if you are an incoming 1st year</li>
              <li>An email address you open often</li>
            </ul>
            <Link className="btn btn-lg" to="/signup">Create my account</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Not this time, based on your answers</h2>
            <ul className="reasons">{failed.map((x) => <li key={x.q}>{x.no}</li>)}</ul>
            <p className="muted" style={{ margin: 0 }}>
              If something here does not fit your situation, ask the Mandaluyong Educational Service Office at City Hall, 2nd floor,
              Monday to Friday, 8:00 AM to 5:00 PM, before you apply.
            </p>
            <div className="actions" style={{ marginTop: 0 }}>
              <Link className="btn btn-plain" to="/">Back to the home page</Link>
              <button type="button" className="btn btn-plain" onClick={() => setAnswers(QUESTIONS.map(() => null))}>Start over</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
