import { useRequired } from '../../components/useRequired'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import type { ReportRow } from '../../lib/report'

interface Interview {
  id: number; application_id: string; slot_start: string; slot_end: string; location: string | null
  status: 'scheduled' | 'done' | 'no_show' | 'cancelled' | 'forfeited'; notes: string | null
}

const INTERVIEWABLE = ['eligible', 'ranked', 'approved', 'waitlisted', 'submitted', 'under_review']
const STATUS_TEXT: Record<Interview['status'], string> = { scheduled: 'Scheduled', done: 'Passed', no_show: 'No show', cancelled: 'Cancelled', forfeited: 'Forfeited' }
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Tomorrow 9:00 in the browser's time zone, as a datetime-local value. */
function defaultStart(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`
}

/**
 * Interview queue (Objective 5, "virtual queue"). Staff pick applicants (in rank order) and give one start time:
 * slots are laid back to back and roll to the next working day when the day ends. Applicants are emailed their
 * slot (and a reminder the day before), and see it in the portal. Selecting someone who already has a slot moves them.
 */
export function Interviews() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [ivs, setIvs] = useState<Interview[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [start, setStart] = useState(defaultStart)
  const [minutes, setMinutes] = useState(20)
  const [dayEnd, setDayEnd] = useState('17:00')
  const [location, setLocation] = useState('Mandaluyong Educational Service Office, City Hall')
  const [filter, setFilter] = useState<'today' | 'unscheduled' | 'notsettled' | 'scheduled' | 'all' | null>(null)
  const [panel, setPanel] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})
  // forfeit at the interview (client, 2026-11-21): the reason is required
  const [forfeitFor, setForfeitFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reasonMissing, setReasonMissing] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase.rpc('cycle_report', { p_cycle: cycleId })
    if (error) return setMsg({ kind: 'error', text: error.message })
    // step 2 applicants only (a step-1 "submitted" application has no exam result yet)
    const list = ((data as ReportRow[]) ?? []).filter((r) => INTERVIEWABLE.includes(r.status)
      && (!['submitted', 'under_review'].includes(r.status) || r.exam_result === 'passed'))
    setRows(list)
    const ids = list.map((r) => r.application_id)
    if (ids.length === 0) return setIvs([])
    const { data: iv } = await supabase.from('interviews').select('id,application_id,slot_start,slot_end,location,status,notes')
      .in('application_id', ids).order('slot_start', { ascending: false })
    setIvs((iv as Interview[]) ?? [])
  }, [cycleId])

  useEffect(() => {
    load()
  }, [load])

  const active = useMemo(() => {
    const m = new Map<string, Interview>()
    for (const i of ivs) if (i.status === 'scheduled') m.set(i.application_id, i)
    return m
  }, [ivs])
  const latest = useMemo(() => {
    const m = new Map<string, Interview>()
    for (const i of ivs) if (!m.has(i.application_id)) m.set(i.application_id, i)
    return m
  }, [ivs])

  const ordered = (rows ?? []).filter((r) => picked.has(r.application_id)) // rows are already in rank order
  const needStart = useRequired(start, 'Set the date and time of the first interview.')

  function toggle(id: string) {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  async function schedule() {
    if (ordered.length === 0) return
    setBusy('schedule')
    setMsg(null)
    const { data, error } = await supabase.rpc('schedule_interviews', {
      p_apps: ordered.map((r) => r.application_id), p_start: new Date(start).toISOString(),
      p_minutes: minutes, p_day_end: dayEnd, p_location: location,
    })
    setBusy(null)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: `Scheduled ${data} interview${data === 1 ? '' : 's'}. Each applicant was emailed their slot.` })
    setPicked(new Set())
    load()
  }

  async function setStatus(i: Interview, status: 'done' | 'no_show' | 'cancelled') {
    setBusy(String(i.id))
    setMsg(null)
    const { error } = await supabase.rpc('set_interview_status', { p_interview: i.id, p_status: status, p_notes: notes[i.id]?.trim() || null })
    setBusy(null)
    if (error) setMsg({ kind: 'error', text: error.message })
    else load()
  }

  async function forfeit(appId: string) {
    if (!reason.trim()) return setReasonMissing(true)
    setBusy(appId)
    setMsg(null)
    const { error } = await supabase.rpc('forfeit_application', { p_app: appId, p_reason: reason.trim() })
    setBusy(null)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: 'Application forfeited. It is out of the ranking, and the applicant sees the reason in the portal.' })
    setForfeitFor(null)
    setReason('')
    load()
  }

  if (!cycle) return <p className="muted">No program cycle yet.</p>

  // preview: where the picked applicants land (same rule as the database)
  const preview = (() => {
    const out: string[] = []
    if (!start || ordered.length === 0) return out
    const first = new Date(start)
    let t = new Date(first)
    const [eh, em] = dayEnd.split(':').map(Number)
    for (let k = 0; k < ordered.length; k++) {
      const end = new Date(t.getTime() + minutes * 60000)
      const dayLimit = new Date(t); dayLimit.setHours(eh, em, 0, 0)
      if (end > dayLimit || end.getDate() !== t.getDate()) {
        t = new Date(t); t.setDate(t.getDate() + 1); t.setHours(first.getHours(), first.getMinutes(), 0, 0)
        while (t.getDay() === 0) t.setDate(t.getDate() + 1)
      }
      out.push(when(t.toISOString()))
      t = new Date(t.getTime() + minutes * 60000)
    }
    return out
  })()

  const all = rows ?? []
  const todayKey = new Date().toDateString()
  const isToday = (iso: string) => new Date(iso).toDateString() === todayKey
  const decided = (r: ReportRow) => ['approved', 'waitlisted', 'not_selected', 'ranked'].includes(r.status)
  const settled = (r: ReportRow) => ['done', 'forfeited'].includes(latest.get(r.application_id)?.status ?? '')
  const lists = {
    today: all.filter((r) => { const a = active.get(r.application_id); return a && isToday(a.slot_start) })
      .sort((x, y) => active.get(x.application_id)!.slot_start.localeCompare(active.get(y.application_id)!.slot_start)),
    unscheduled: all.filter((r) => !active.has(r.application_id) && !settled(r) && !decided(r)),
    notsettled: all.filter((r) => r.status === 'eligible' && !settled(r)),
    scheduled: all.filter((r) => active.has(r.application_id))
      .sort((x, y) => active.get(x.application_id)!.slot_start.localeCompare(active.get(y.application_id)!.slot_start)),
    all,
  }
  const view = filter ?? (lists.today.length ? 'today' : 'unscheduled')
  const list = lists[view]
  const passed = ivs.filter((i) => i.status === 'done').length
  const forfeited = ivs.filter((i) => i.status === 'forfeited').length
  const LABEL: Record<keyof typeof lists, string> = { today: 'Today', unscheduled: 'Without a slot', notsettled: 'Not settled', scheduled: 'Scheduled', all: 'All' }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Interviews</h1>
          <p>The final check before the ranking: only applicants marked <b>Passed</b> are ranked.</p>
        </div>
      </div>

      <div className="status-line" role="status">
        <span className="pill info small">{all.length} to interview</span>
        <span className="pill small">{lists.today.length} today</span>
        <span className="pill ok small">{passed} passed</span>
        <span className="pill small">{forfeited} forfeited</span>
        <span className={`pill small ${lists.notsettled.length ? 'warn' : 'ok'}`}>{lists.notsettled.length} not settled</span>
        <span className="sep">·</span>
        <span>{lists.notsettled.length ? 'The final selection waits until every interview is Passed or Forfeited.' : 'Every interview is settled.'}</span>
      </div>

      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}

      <div className="chips" role="group" aria-label="Show">
        {(Object.keys(LABEL) as (keyof typeof lists)[]).map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={view === f} onClick={() => setFilter(f)}>
            {LABEL[f]}<span className="count">{lists[f].length}</span>
          </button>
        ))}
        {list.length > 0 && (
          <button type="button" className="btn btn-plain small" style={{ marginLeft: 'auto' }}
            onClick={() => setPicked(new Set(list.filter((r) => !decided(r) && !settled(r)).map((r) => r.application_id)))}>Select all shown</button>
        )}
      </div>

      <section className="card" aria-label={LABEL[view]}>
        {rows && list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {view === 'today' ? 'No interviews today.' : view === 'notsettled' ? 'Every interview is settled.' : 'Nobody here. Applicants appear once they have submitted step 2.'}
          </p>
        ) : (
          <div className="scroll-box" style={{ maxHeight: 'calc(100vh - var(--stick-top) - 260px)' }}>
            <table className="table" style={{ minWidth: 860 }}>
              <thead><tr><th><span className="sr">Select</span></th><th>{view === 'today' || view === 'scheduled' ? 'Time' : 'Rank'}</th><th>Applicant</th><th>Interview</th><th>Result</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const a = active.get(r.application_id)
                  const last = latest.get(r.application_id)
                  const canPick = !decided(r) && !settled(r)
                  return (
                    <tr key={r.application_id} style={picked.has(r.application_id) ? { background: 'var(--blue-tint)' } : undefined}>
                      <td>{canPick && <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={picked.has(r.application_id)} onChange={() => toggle(r.application_id)} />}</td>
                      <td>{(view === 'today' || view === 'scheduled') && a
                        ? <strong>{new Date(a.slot_start).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</strong>
                        : r.rank ?? '—'}</td>
                      <td><Link to={`/staff/applicants/${r.application_id}`} state={{ from: '/staff/interviews' }}>{r.full_name}</Link><div className="small muted">{r.student_number ?? ''}</div></td>
                      <td>
                        {a ? <>{when(a.slot_start)}<div className="small muted">{a.location ?? ''}</div></>
                          : last ? <span className="muted">{STATUS_TEXT[last.status]} · {when(last.slot_start)}{last.notes ? ` · ${last.notes}` : ''}</span>
                          : <span className="muted">no slot yet</span>}
                      </td>
                      <td>
                        {forfeitFor === r.application_id ? (
                          <span style={{ display: 'grid', gap: 6 }}>
                            <textarea aria-label="Why is the application forfeited?" aria-invalid={reasonMissing && !reason.trim()} rows={2}
                              placeholder="Why? (required) e.g. both parents work; income higher than declared"
                              value={reason} onChange={(e) => setReason(e.target.value)} style={{ minWidth: 260 }} />
                            {reasonMissing && !reason.trim() && <span className="field-error" role="alert">Write why the application is forfeited.</span>}
                            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="btn btn-danger-outline" aria-busy={busy === r.application_id} disabled={busy === r.application_id}
                                onClick={() => forfeit(r.application_id)}>Forfeit application</button>
                              <button className="btn-danger-link" onClick={() => { setForfeitFor(null); setReason(''); setReasonMissing(false) }}>Back</button>
                            </span>
                          </span>
                        ) : last?.status === 'done' ? <span className="pill ok small">Passed</span>
                          : last?.status === 'forfeited' ? <span className="pill small">Forfeited</span>
                          : (
                          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {a ? (
                              <>
                                <input aria-label="Interview notes" placeholder="Notes (optional)" style={{ maxWidth: 160 }}
                                  value={notes[a.id] ?? ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
                                <button className="btn btn-ok" disabled={busy === String(a.id)} onClick={() => setStatus(a, 'done')}>Passed</button>
                                <button className="btn btn-plain" disabled={busy === String(a.id)} onClick={() => setStatus(a, 'no_show')}>No show</button>
                                <button className="btn-danger-link" disabled={busy === String(a.id)} onClick={() => setStatus(a, 'cancelled')}>Cancel slot</button>
                              </>
                            ) : <span className="muted small">{last?.status === 'no_show' ? 'No show: tick to reschedule, or' : 'Tick to schedule'}</span>}
                            {['submitted', 'under_review', 'eligible'].includes(r.status) && (
                              <button className="btn-danger-link" onClick={() => { setForfeitFor(r.application_id); setReason(''); setReasonMissing(false) }}>Forfeit…</button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {picked.size > 0 && !panel && (
        <div className="action-bar" role="region" aria-label="Selected applicants">
          <strong>{picked.size} selected</strong>
          <button className="btn" onClick={() => setPanel(true)}>Schedule {picked.size} interview{picked.size === 1 ? '' : 's'}…</button>
          <button type="button" className="link-light" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      {panel && (
        <>
          <div className="drawer-shade" onClick={() => setPanel(false)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="sched-h">
            <div className="drawer-head">
              <h2 id="sched-h">Schedule {ordered.length} interview{ordered.length === 1 ? '' : 's'}</h2>
              <button type="button" className="drawer-close" aria-label="Close" onClick={() => setPanel(false)}>×</button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Back-to-back slots in rank order from the start time; when the day ends, the next ones continue the next working day
              (Sundays skipped). Each applicant is emailed, and reminded the day before at 8:00 AM. Someone who already has a slot is moved.
            </p>
            <label className="field">First interview starts<input {...needStart.props} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />{needStart.error}</label>
            <div className="row">
              <label className="field">Minutes each<input type="number" min={5} max={240} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
              <label className="field">Day ends at<input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></label>
            </div>
            <label className="field">Place<input value={location} onChange={(e) => setLocation(e.target.value)} /></label>
            {preview.length > 0 && (
              <div className="card" style={{ padding: '10px 14px', margin: 0 }}>
                <div className="small muted">Preview</div>
                <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
                  {ordered.map((r, k) => <li key={r.application_id}>{preview[k]} · {r.full_name}</li>)}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              <button aria-busy={busy === 'schedule'} className="btn btn-lg" style={{ flex: 1 }} disabled={busy === 'schedule'}
                onClick={async () => { if (needStart.check()) { await schedule(); setPanel(false) } }}>
                {busy === 'schedule' ? 'Scheduling…' : `Schedule ${ordered.length} and email them`}
              </button>
              <button className="btn btn-plain" onClick={() => setPanel(false)}>Cancel</button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
