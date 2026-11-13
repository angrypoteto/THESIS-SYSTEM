import { useEffect, useState } from 'react'
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
  exam_venue: string
  step2_closes_at: string
  slots: string
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
  name: '', school_year: '', term: '1st semester', opens_at: '', closes_at: '', exam_at: '', exam_venue: 'Rizal Technological University, Boni Avenue',
  step2_closes_at: '', slots: '', gwa_cutoff: '81', status: 'draft',
})

const fromCycle = (c: ProgramCycle): Form => ({
  name: c.name, school_year: c.school_year, term: c.term, opens_at: toLocal(c.opens_at), closes_at: toLocal(c.closes_at),
  exam_at: toLocal(c.exam_at), exam_venue: c.exam_venue ?? '', step2_closes_at: toLocal(c.step2_closes_at),
  slots: String(c.slots), gwa_cutoff: String(c.gwa_cutoff), status: c.status,
})

/** Admin: the program cycle's deadlines (client: the admin sets them), exam schedule, slots and GWA cut-off. */
export function Cycles() {
  const { cycle, cycles, reloadCycles } = useStaff()
  const [editing, setEditing] = useState<number | 'new' | null>(cycle?.id ?? null)
  const [f, setF] = useState<Form>(cycle ? fromCycle(cycle) : blank())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (editing === 'new') return setF(blank())
    const c = cycles.find((x) => x.id === editing)
    if (c) setF(fromCycle(c))
  }, [editing, cycles])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  function problems(): string[] {
    const p: string[] = []
    if (!f.name.trim() || !f.school_year.trim() || !f.term.trim()) p.push('Name, school year and term are required.')
    if (!f.opens_at || !f.closes_at) p.push('Set when step 1 opens and closes.')
    else if (Date.parse(f.closes_at) <= Date.parse(f.opens_at)) p.push('Step 1 must close after it opens.')
    if (f.exam_at && f.closes_at && Date.parse(f.exam_at) < Date.parse(f.closes_at)) p.push('The exam should be after step 1 closes.')
    if (f.step2_closes_at && f.exam_at && Date.parse(f.step2_closes_at) <= Date.parse(f.exam_at)) p.push('The step 2 deadline must be after the exam.')
    if (!(Number(f.slots) >= 0) || f.slots === '') p.push('Enter the number of slots.')
    if (!(Number(f.gwa_cutoff) > 0 && Number(f.gwa_cutoff) <= 100)) p.push('GWA cut-off is a percentage (for example 81).')
    return p
  }

  async function save() {
    const p = problems()
    if (p.length) return setMsg({ ok: false, text: p.join(' ') })
    setBusy(true)
    const row = {
      name: f.name.trim(), school_year: f.school_year.trim(), term: f.term.trim(),
      opens_at: fromLocal(f.opens_at), closes_at: fromLocal(f.closes_at), exam_at: fromLocal(f.exam_at),
      exam_venue: f.exam_venue.trim() || null, step2_closes_at: fromLocal(f.step2_closes_at),
      slots: Number(f.slots), gwa_cutoff: Number(f.gwa_cutoff), status: f.status,
    }
    const res = editing === 'new'
      ? await supabase.from('program_cycles').insert(row).select('id').single()
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

      <div className="grid two">
        <section className="card">
          <h2>Cycles</h2>
          <ul className="checklist">
            {cycles.map((c) => (
              <li key={c.id}>
                <button type="button" className={`link-button ${editing === c.id ? 'active' : ''}`} onClick={() => { setEditing(c.id); setMsg(null) }}>
                  {c.name}
                </button>{' '}
                <span className="muted small">{c.school_year}, {c.term} · {c.status} · {c.slots} slots</span>
              </li>
            ))}
            {cycles.length === 0 && <li className="muted">No cycles yet.</li>}
          </ul>
        </section>

        <section className="card">
          <h2>{editing === 'new' ? 'New cycle' : `Edit: ${f.name || '…'}`}</h2>
          <label className="field">Name<input value={f.name} onChange={set('name')} placeholder="e.g. Scholarship 2027-2028, 1st semester" /></label>
          <div className="row">
            <label className="field">School year<input value={f.school_year} onChange={set('school_year')} placeholder="2027-2028" /></label>
            <label className="field">Term<input value={f.term} onChange={set('term')} /></label>
          </div>
          <h3>Step 1: initial screening</h3>
          <div className="row">
            <label className="field">Opens<input type="datetime-local" value={f.opens_at} onChange={set('opens_at')} /></label>
            <label className="field">Closes (deadline)<input type="datetime-local" value={f.closes_at} onChange={set('closes_at')} /></label>
          </div>
          <h3>Qualifying exam (given by RTU)</h3>
          <div className="row">
            <label className="field">Date and time<input type="datetime-local" value={f.exam_at} onChange={set('exam_at')} /></label>
            <label className="field">Venue<input value={f.exam_venue} onChange={set('exam_venue')} /></label>
          </div>
          <h3>Step 2: requirements for qualified examinees</h3>
          <label className="field">
            Deadline
            <input type="datetime-local" value={f.step2_closes_at} onChange={set('step2_closes_at')} />
            <span className="muted small">Leave empty to keep step 2 open until the cycle is ranked.</span>
          </label>
          <h3>Selection</h3>
          <div className="row">
            <label className="field">Slots<input type="number" min={0} value={f.slots} onChange={set('slots')} /></label>
            <label className="field">GWA cut-off (%)<input type="number" min={1} max={100} step={0.01} value={f.gwa_cutoff} onChange={set('gwa_cutoff')} /></label>
          </div>
          <label className="field">
            Status
            <select value={f.status} onChange={set('status')}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {msg && <p className={msg.ok ? 'ok-text' : 'error'} role="status">{msg.text}</p>}
          <button className="btn btn-lg" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save cycle'}</button>
        </section>
      </div>
    </>
  )
}
