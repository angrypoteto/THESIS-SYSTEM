import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { SkeletonRows } from '../../components/Skeleton'
import { useStaff } from '../../components/StaffLayout'
import { normSn, textToRows, type Cell } from '../../lib/examImport'
import { download } from '../../lib/report'
import { supabase } from '../../lib/supabase'

interface Row {
  id: string; exam_room: string | null; exam_room_emailed: string | null
  applicants: { course: string | null; profiles: { full_name: string; student_number: string | null } | null } | null
}
const name = (r: Row) => r.applicants?.profiles?.full_name ?? '—'
const sn = (r: Row) => r.applicants?.profiles?.student_number ?? ''

/** Find the student number and room columns of RTU's list (any order; without headers: first two columns). */
function readRooms(rows: Cell[][]): { pairs: { student_number: string; room: string }[]; unread: number } {
  const head = (rows[0] ?? []).map((c) => String(c ?? '').toLowerCase())
  let snCol = head.findIndex((h) => /student\s*(no|number|#)|^sn$|stud.*no|^id\s*no/.test(h))
  let roomCol = head.findIndex((h) => /room|classroom|venue|bldg|building/.test(h))
  let start = 1
  if (snCol < 0 || roomCol < 0) { snCol = 0; roomCol = 1; start = 0 }
  const pairs: { student_number: string; room: string }[] = []
  let unread = 0
  for (const r of rows.slice(start)) {
    const s = normSn(r[snCol])
    const room = String(r[roomCol] ?? '').trim()
    if (!s) continue
    if (!room) { unread++; continue }
    pairs.push({ student_number: s, room })
  }
  return { pairs, unread }
}

/**
 * Exam rooms (client, Nov 24): RTU sends MESO the room of each exam taker; MESO types or uploads them, emails each
 * exam taker their room, and downloads the list to post on the office's Facebook page.
 */
export function ExamRooms() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [paste, setPaste] = useState('')
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase.from('applications')
      .select('id,exam_room,exam_room_emailed,applicants(course,profiles(full_name,student_number))')
      .eq('cycle_id', cycleId).eq('status', 'exam_eligible')
    if (error) return setMsg({ ok: false, text: error.message })
    setRows(((data as unknown as Row[]) ?? []).sort((a, b) => name(a).localeCompare(name(b))))
  }, [cycleId])
  useEffect(() => { setEdits({}); load() }, [load])

  const all = useMemo(() => rows ?? [], [rows])
  const roomOf = (r: Row) => (r.id in edits ? edits[r.id] : r.exam_room ?? '')
  const changed = all.filter((r) => r.id in edits && (edits[r.id].trim() || null) !== (r.exam_room ?? null))
  const withRoom = all.filter((r) => r.exam_room)
  const toEmail = all.filter((r) => r.exam_room && r.exam_room !== r.exam_room_emailed)
  const shown = all.filter((r) => !search.trim() || `${name(r)} ${sn(r)} ${roomOf(r)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const rooms = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) if (r.exam_room) m.set(r.exam_room, (m.get(r.exam_room) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [all])

  async function save(pairs: { student_number: string; room: string }[], what: string) {
    if (!cycleId || pairs.length === 0) return
    setBusy('save')
    setMsg(null)
    const { data, error } = await supabase.rpc('set_exam_rooms', { p_cycle: cycleId, p_rows: pairs })
    setBusy(null)
    if (error) return setMsg({ ok: false, text: error.message })
    const d = data as { saved: number; not_found: string[] }
    setMsg({ ok: d.not_found.length === 0, text: `${what}: ${d.saved} room${d.saved === 1 ? '' : 's'} saved.${d.not_found.length ? ` Not exam takers of this cycle: ${d.not_found.slice(0, 8).join(', ')}${d.not_found.length > 8 ? ` and ${d.not_found.length - 8} more` : ''}.` : ''}` })
    setEdits({})
    load()
  }

  async function onFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    try {
      let table: Cell[][]
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import('read-excel-file')
        table = (await readXlsxFile(f)) as Cell[][]
      } else table = textToRows(await f.text())
      const { pairs, unread } = readRooms(table)
      if (!pairs.length) return setMsg({ ok: false, text: `${f.name}: no student numbers with a room found. The file needs a student number column and a room column.` })
      await save(pairs, `${f.name}${unread ? ` (${unread} row${unread === 1 ? '' : 's'} without a room skipped)` : ''}`)
    } catch (e) {
      setMsg({ ok: false, text: `Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  async function emailRooms() {
    if (!cycleId) return
    setBusy('email')
    setMsg(null)
    const { data, error } = await supabase.rpc('email_exam_rooms', { p_cycle: cycleId })
    setBusy(null)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Emailed ${data} exam taker${data === 1 ? '' : 's'} their room. They also see it on their home screen.` })
    load()
  }

  /** The list to post on the office's Facebook page: name and room only, grouped by room. */
  function downloadPosting() {
    const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const list = [...withRoom].sort((a, b) => (a.exam_room ?? '').localeCompare(b.exam_room ?? '', undefined, { numeric: true }) || name(a).localeCompare(name(b)))
    const lines = list.map((r) => [r.exam_room, name(r)].map(q).join(','))
    download(`exam-rooms-${cycle?.name.replace(/[^\w-]+/g, '_')}.csv`, '﻿' + ['Room,Name', ...lines].join('\r\n') + '\r\n')
  }
  function downloadTemplate() {
    const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = all.map((r) => [sn(r), name(r), r.applicants?.course ?? '', r.exam_room ?? ''].map(q).join(','))
    download(`exam-takers-for-rooms-${cycle?.name.replace(/[^\w-]+/g, '_')}.csv`, '﻿' + ['Student number,Name,Course,Room', ...lines].join('\r\n') + '\r\n')
  }

  if (!cycle) return <p className="muted">No program cycle yet.</p>
  const exam = cycle.exam_at ? new Date(cycle.exam_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }) : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Exam rooms</h1>
          <p>RTU gives the room of each exam taker. Enter or upload them, email each student their room, and download the list to post on Facebook.</p>
        </div>
        {all.length > 0 && (
          <div className="actions" style={{ marginTop: 0 }}>
            <label className="btn btn-outline file-button">Upload RTU's room list
              <input type="file" accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={onFile} />
            </label>
            <button className="btn btn-plain" onClick={downloadTemplate}>Download the list for RTU</button>
          </div>
        )}
      </div>

      <div className="status-line" role="status">
        <span className="pill info small">{rows ? all.length : '…'} exam takers</span>
        <span className={`pill small ${withRoom.length === all.length && all.length ? 'ok' : 'warn'}`}>{withRoom.length} with a room</span>
        <span className="pill small">{rooms.length} room{rooms.length === 1 ? '' : 's'}</span>
        <span className={`pill small ${toEmail.length ? 'warn' : 'ok'}`}>{toEmail.length} not emailed yet</span>
        <span className="sep">·</span>
        <span>Exam {exam ? <b>{exam}</b> : <>date not set (<Link to="/admin/cycles">Cycles &amp; slots</Link>)</>}{cycle.exam_venue ? ` · ${cycle.exam_venue}` : ''}</span>
      </div>

      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}

      <div className="side-by-side">
        <section className="card" aria-labelledby="rooms-h">
          <div className="card-head">
            <h2 id="rooms-h">Exam takers</h2>
            <input type="search" placeholder="Find a name, student number or room" aria-label="Find an exam taker" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ width: 280, maxWidth: '100%' }} />
          </div>
          {rows && all.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Nobody is cleared for the exam in this cycle yet.</p>
          ) : (
            <div className="scroll-box">
              <table className="table">
                <thead><tr><th>Applicant</th><th>Room</th><th>Email</th></tr></thead>
                <tbody>
                  {!rows && <SkeletonRows rows={6} cols={3} />}
                  {shown.map((r) => {
                    const dirty = r.id in edits && (edits[r.id].trim() || null) !== (r.exam_room ?? null)
                    return (
                      <tr key={r.id} style={dirty ? { background: 'var(--blue-tint)' } : undefined}>
                        <td><Link to={`/staff/applicants/${r.id}`} state={{ from: '/staff/exam-rooms' }}>{name(r)}</Link><div className="small muted">{sn(r)}</div></td>
                        <td><input aria-label={`Room of ${name(r)}`} value={roomOf(r)} placeholder="e.g. Room 301" style={{ width: 150 }}
                          onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} /></td>
                        <td>{!r.exam_room ? <span className="pill small">no room</span>
                          : r.exam_room === r.exam_room_emailed ? <span className="pill ok small">emailed</span>
                          : <span className="pill warn small">{r.exam_room_emailed ? 'room changed' : 'not emailed'}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {changed.length > 0 && (
            <div className="unsaved-bar" role="status">
              <span>{changed.length} room{changed.length === 1 ? '' : 's'} not saved yet.</span>
              <button className="btn" aria-busy={busy === 'save'} disabled={busy === 'save'}
                onClick={() => save(changed.map((r) => ({ student_number: sn(r), room: edits[r.id].trim() })), 'Saved')}>
                {busy === 'save' ? 'Saving…' : `Save ${changed.length} room${changed.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="send-h">
          <h2 id="send-h">Send and post</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Each exam taker gets one email with their room, the exam date and time, and the venue. A room changed later is emailed again.
          </p>
          <button className="btn btn-lg" aria-busy={busy === 'email'} disabled={busy === 'email'}
            onClick={() => (toEmail.length ? emailRooms() : setMsg({ ok: false, text: changed.length ? 'Save the rooms first, then email them.' : 'Every exam taker with a room has already been emailed. Enter or upload rooms first.' }))}>
            {busy === 'email' ? 'Sending…' : `Email the rooms${toEmail.length ? ` to ${toEmail.length} student${toEmail.length === 1 ? '' : 's'}` : ''}`}
          </button>
          <button className="btn btn-plain" onClick={() => (withRoom.length ? downloadPosting() : setMsg({ ok: false, text: 'No rooms yet: enter or upload them first.' }))}>
            Download the list for Facebook
          </button>
          <p className="small muted" style={{ margin: 0 }}>The Facebook list has only the room and the name, grouped by room.</p>
          {rooms.length > 0 && (
            <>
              <h3 style={{ margin: '8px 0 0' }}>Rooms</h3>
              <ul className="room-list">
                {rooms.map(([room, n]) => <li key={room}><span>{room}</span><b>{n}</b></li>)}
              </ul>
            </>
          )}
          <details>
            <summary className="small">Or paste the two columns (student number, room)</summary>
            <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'2026-00123\tRoom 301\n2026-00456\tRoom 302'} style={{ width: '100%', marginTop: 8 }} />
            <button className="btn btn-plain" onClick={() => { const { pairs } = readRooms(textToRows(paste)); if (pairs.length) { save(pairs, 'Pasted list'); setPaste('') } else setMsg({ ok: false, text: 'No student number and room pairs found in the pasted text.' }) }}>Fill in the rooms</button>
          </details>
        </section>
      </div>
    </>
  )
}
