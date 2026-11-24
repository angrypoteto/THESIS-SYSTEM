import { useEffect, useState } from 'react'
import { cycleStage } from '../../components/CycleProgress'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import type { ProgramCycle } from '../../lib/types'

type Form = {
  name: string
  school_year: string
  term: string
  opens_at: string
  closes_at: string
  exam_at: string
  exam_results_final_at: string
  exam_venue: string
  step2_closes_at: string
  slots: string
  step2_slots: string
  gwa_cutoff: string
  status: ProgramCycle['status']
}

const STATUSES: [ProgramCycle['status'], string][] = [
  ['draft', 'Draft (hidden from applicants)'],
  ['open', 'Open for step 1'],
  ['closed', 'Step 1 closed (exam and step 2 continue)'],
  ['ranked', 'Ranked'],
  ['finalized', 'Finalized'],
]

// <input type="datetime-local"> works in local time without a zone
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

const blank = (): Form => ({
  name: '', school_year: '', term: '1st semester', opens_at: '', closes_at: '', exam_at: '', exam_venue: 'Rizal Technological University, Boni Avenue', exam_results_final_at: '',
  step2_closes_at: '', slots: '', step2_slots: '', gwa_cutoff: '81', status: 'draft',
})

const fromCycle = (c: ProgramCycle): Form => ({
  name: c.name, school_year: c.school_year, term: c.term, opens_at: toLocal(c.opens_at), closes_at: toLocal(c.closes_at),
  exam_at: toLocal(c.exam_at), exam_venue: c.exam_venue ?? '', exam_results_final_at: toLocal(c.exam_results_final_at), step2_closes_at: toLocal(c.step2_closes_at),
  slots: String(c.slots), step2_slots: c.step2_slots == null ? '' : String(c.step2_slots), gwa_cutoff: String(c.gwa_cutoff), status: c.status,
})

/** Admin: the program cycle's deadlines (client: the admin sets them), exam schedule, slots and GWA cut-off. */
export function Cycles() {
  const { cycle, cycles, reloadCycles } = useStaff()
  const [editing, setEditing] = useState<number | 'new' | null>(cycle?.id ?? null)
  const [f, setF] = useState<Form>(cycle ? fromCycle(cycle) : blank())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // boxes turn red after the first Save attempt, then update as they are corrected
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setChecked(false)
    if (editing === 'new') return setF(blank())
    const c = cycles.find((x) => x.id === editing)
    if (c) setF(fromCycle(c))
  }, [editing, cycles])

  const errors = checked ? problems() : {}
  /** aria-invalid (red box) and the box's own message */
  const bad = (k: keyof Form) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `err-${k}` : undefined })
  const err = (k: keyof Form) => (errors[k] ? <span id={`err-${k}`} className="field-error" role="alert">{errors[k]}</span> : null)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  /** One message per box with a problem, so each box can be marked in red with its own message. */
  function problems(): Partial<Record<keyof Form, string>> {
    const p: Partial<Record<keyof Form, string>> = {}
    if (!f.name.trim()) p.name = 'Enter a name for the cycle.'
    if (!f.school_year.trim()) p.school_year = 'Enter the school year, e.g. 2027-2028.'
    if (!f.term.trim()) p.term = 'Enter the term, e.g. 1st semester.'
    if (!f.opens_at) p.opens_at = 'Set when step 1 opens.'
    if (!f.closes_at) p.closes_at = 'Set the step 1 deadline.'
    else if (f.opens_at && Date.parse(f.closes_at) <= Date.parse(f.opens_at)) p.closes_at = 'The deadline must be after step 1 opens.'
    if (f.exam_at && f.closes_at && Date.parse(f.exam_at) < Date.parse(f.closes_at)) p.exam_at = 'The exam should be after step 1 closes.'
    if (f.exam_results_final_at && f.exam_at && Date.parse(f.exam_results_final_at) <= Date.parse(f.exam_at)) p.exam_results_final_at = 'The results date must be after the exam.'
    if (f.step2_closes_at && f.exam_at && Date.parse(f.step2_closes_at) <= Date.parse(f.exam_at)) p.step2_closes_at = 'The step 2 deadline must be after the exam.'
    else if (f.step2_closes_at && f.exam_results_final_at && Date.parse(f.step2_closes_at) <= Date.parse(f.exam_results_final_at)) p.step2_closes_at = 'The step 2 deadline must be after the exam results date.'
    if (f.slots === '' || !(Number(f.slots) >= 1) || !Number.isInteger(Number(f.slots))) p.slots = 'Enter the number of scholars (a whole number, at least 1).'
    if (f.step2_slots !== '' && (!Number.isInteger(Number(f.step2_slots)) || Number(f.step2_slots) < Number(f.slots)))
      p.step2_slots = `Must be a whole number, at least the final slots (${f.slots || 0}).`
    if (!(Number(f.gwa_cutoff) > 0 && Number(f.gwa_cutoff) <= 100)) p.gwa_cutoff = 'A percentage from 1 to 100, e.g. 81.'
    return p
  }

  async function save() {
    const p = problems()
    setChecked(true)
    const bad = Object.keys(p)
    if (bad.length) {
      setMsg({ ok: false, text: `Fix the ${bad.length} box${bad.length === 1 ? '' : 'es'} marked in red.` })
      // bring the first problem into view
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setBusy(true)
    const row = {
      name: f.name.trim(), school_year: f.school_year.trim(), term: f.term.trim(),
      opens_at: fromLocal(f.opens_at), closes_at: fromLocal(f.closes_at), exam_at: fromLocal(f.exam_at),
      exam_venue: f.exam_venue.trim() || null, exam_results_final_at: fromLocal(f.exam_results_final_at), step2_closes_at: fromLocal(f.step2_closes_at),
      slots: Number(f.slots), step2_slots: f.step2_slots === '' ? null : Number(f.step2_slots),
      gwa_cutoff: Number(f.gwa_cutoff), status: f.status,
    }
    const res = editing === 'new'
      ? await supabase.from('program_cycles').insert({ ...row, pay_tiers: [] }).select('id').single()
      : await supabase.from('program_cycles').update(row).eq('id', editing as number).select('id').single()
    setBusy(false)
    if (res.error) return setMsg({ ok: false, text: res.error.message })
    setMsg({ ok: true, text: 'Saved.' })
    setEditing(res.data.id)
    reloadCycles()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cycles &amp; slots</h1>
          <p>Step 1 dates, the qualifying exam, the step 2 deadline, slots and the GWA cut-off for each program cycle.</p>
        </div>
        <button className="btn btn-plain" onClick={() => { setEditing('new'); setMsg(null) }}>+ New cycle</button>
      </div>

      <div className="grid two grid-top">
        <section className="card">
          <h2>Cycles</h2>
          <div className="cycle-cards">
            {cycles.map((c) => {
              const st = cycleStage(c)
              return (
                <button key={c.id} type="button" className={`cycle-card ${editing === c.id ? 'on' : ''}`} aria-pressed={editing === c.id} onClick={() => { setEditing(c.id); setMsg(null) }}>
                  <b>{c.name}</b>
                  <span className={`pill small ${st.done ? '' : 'info'}`}>{st.done ? 'Finished' : st.stage}</span>
                  <span className="small muted">{c.school_year}, {c.term} · {c.slots} slots{c.step2_slots ? ` · ${c.step2_slots} go to step 2` : ''}</span>
                </button>
              )
            })}
            {cycles.length === 0 && <p className="muted">No cycles yet.</p>}
          </div>
        </section>

        <section className="card">
          <h2>{editing === 'new' ? 'New cycle' : `Edit: ${f.name || '…'}`}</h2>
          <label className="field">Name<input {...bad('name')} value={f.name} onChange={set('name')} placeholder="e.g. Scholarship 2027-2028, 1st semester" />{err('name')}</label>
          <div className="row">
            <label className="field">School year<input {...bad('school_year')} value={f.school_year} onChange={set('school_year')} placeholder="2027-2028" />{err('school_year')}</label>
            <label className="field">Term<input {...bad('term')} value={f.term} onChange={set('term')} />{err('term')}</label>
          </div>
          <h3 className="tl-h"><span>1</span>Step 1 opens and closes</h3>
          <div className="row">
            <label className="field">Opens<input {...bad('opens_at')} type="datetime-local" value={f.opens_at} onChange={set('opens_at')} />{err('opens_at')}</label>
            <label className="field">Closes (deadline)<input {...bad('closes_at')} type="datetime-local" value={f.closes_at} onChange={set('closes_at')} />{err('closes_at')}</label>
          </div>
          <h3 className="tl-h"><span>2</span>Qualifying exam (given by RTU)</h3>
          <div className="row">
            <label className="field">Date and time<input {...bad('exam_at')} type="datetime-local" value={f.exam_at} onChange={set('exam_at')} />{err('exam_at')}</label>
            <label className="field">Venue<input value={f.exam_venue} onChange={set('exam_venue')} /></label>
          </div>
          <h3 className="tl-h"><span>3</span>Exam results become final</h3>
          <label className="field">
            Exam results final on
            <input {...bad('exam_results_final_at')} type="datetime-local" value={f.exam_results_final_at} onChange={set('exam_results_final_at')} />{err('exam_results_final_at')}
            <span className="muted small">After this date, once every exam taker has a score or is marked absent, the cut-off is made automatically: the top applicants get an Applicant ID and proceed to step 2. Until then scores can be corrected. Leave empty to hold the cut-off.</span>
          </label>
          <h3 className="tl-h"><span>4</span>Step 2 deadline (exam passers)</h3>
          <label className="field">
            Deadline
            <input {...bad('step2_closes_at')} type="datetime-local" value={f.step2_closes_at} onChange={set('step2_closes_at')} />{err('step2_closes_at')}
            <span className="muted small">The final selection is made automatically after this deadline, once every step-2 application has been checked and every interview is settled. Leave empty to hold the selection.</span>
          </label>
          <h3 className="tl-h"><span>5</span>Interviews and final selection</h3>
          <label className="field">
            Applicants who proceed to step 2
            <input {...bad('step2_slots')} type="number" min={0} value={f.step2_slots} onChange={set('step2_slots')} placeholder="e.g. twice the slots" />{err('step2_slots')}
            <span className="muted small">After the exam, applicants are ranked on 70% exam score + 30% GWA and this many proceed. Leave empty to use the number of slots.</span>
          </label>
          <div className="row">
            <label className="field">Final slots (scholars)<input {...bad('slots')} type="number" min={0} value={f.slots} onChange={set('slots')} />{err('slots')}</label>
            <label className="field">GWA cut-off (%)<input {...bad('gwa_cutoff')} type="number" min={1} max={100} step={0.01} value={f.gwa_cutoff} onChange={set('gwa_cutoff')} />{err('gwa_cutoff')}</label>
          </div>
          <label className="field">
            Status
            <select value={f.status} onChange={set('status')}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {msg && <p className={msg.ok ? 'ok-text' : 'error'} role="status">{msg.text}</p>}
          <button aria-busy={busy} className="btn btn-lg" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save cycle'}</button>
        </section>
      </div>
    </>
  )
}
