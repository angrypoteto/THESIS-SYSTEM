import { useEffect, useMemo, useState } from 'react'
import { LoadMore, useLazyCount } from '../../components/Skeleton'
import { Link, useSearchParams } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { loadCycleApplications, type StaffAppRow } from '../../lib/staff'

const STATUS_PILL: Record<string, string> = {
  submitted: 'info', under_review: 'warn', eligible: 'ok', ineligible: '', ranked: 'info',
  approved: 'ok', waitlisted: '', not_selected: '', withdrawn: '',
}

export function Applicants() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<StaffAppRow[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const step = Number(useSearchParams()[0].get('step')) || null
  const cycleId = cycle?.id

  useEffect(() => {
    if (cycleId == null) return
    let live = true
    loadCycleApplications(cycleId).then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [cycleId])

  const shown = useMemo(() => (rows ?? []).filter((r) => {
    const name = `${r.applicants?.profiles?.full_name ?? ''} ${r.applicants?.profiles?.student_number ?? ''}`.toLowerCase()
    return (status === 'all' || r.status === status) && (!step || r.stage === step) && name.includes(q.toLowerCase())
  }), [rows, q, status, step])

  const lazy = useLazyCount(shown.length, 40)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{step ? `Step ${step} applications` : 'All applicants'}</h1>
          <p>{cycle?.name ?? ''} · {rows?.length ?? 0} submitted</p>
        </div>
      </div>
      <div className="row" style={{ maxWidth: 640 }}>
        <label className="field">Search name or student number<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Lacson or 2026-92031" /></label>
        <label className="field">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            {Object.keys(STATUS_PILL).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </div>
      <p className="small muted" style={{ margin: '-6px 0 0' }}>Showing {shown.length} of {rows?.length ?? 0}</p>
      <div className="table-wrap scroll-box" style={{ maxHeight: 'calc(100vh - var(--stick-top) - 250px)' }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead><tr><th>Applicant</th><th>School</th><th>Household</th><th>GWA</th><th>Status</th><th><span className="sr">Open</span></th></tr></thead>
          <tbody>
            {shown.slice(0, lazy.count).map((r) => (
              <tr key={r.id}>
                <td><strong>{r.applicants?.profiles?.full_name}</strong><div className="small muted">{r.applicants?.profiles?.student_number} · {r.applicants?.barangays?.name}</div></td>
                <td>{r.applicants?.schools?.name ?? '—'}</td>
                <td>{r.household_size ?? '—'}</td>
                <td>{r.gwa_converted != null ? `${r.gwa_converted}%` : '—'}</td>
                <td><span className={`pill small ${STATUS_PILL[r.status] ?? ''}`}>{r.status.replace('_', ' ')}</span></td>
                <td className="num"><Link className="btn btn-outline" to={`/staff/applicants/${r.id}`} state={{ from: '/staff/applicants' }}>Open</Link></td>
              </tr>
            ))}
            {rows && !shown.length && <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No applicants match.</td></tr>}
          </tbody>
        </table>
          <LoadMore sentinel={lazy.sentinel} more={lazy.more} shown={lazy.count} total={shown.length} />
      </div>
    </>
  )
}
