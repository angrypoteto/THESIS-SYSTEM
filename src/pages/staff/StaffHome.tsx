import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { loadCycleApplications, queueItems, waited, type QueueKind, type StaffAppRow } from '../../lib/staff'

const KIND_PILL: Record<QueueKind, [string, string]> = {
  document: ['warn', 'Document'],
  gates: ['info', 'Gates'],
  household: ['', 'Household'],
  waiting: ['', 'Waiting'],
}

/** Design screen 5: everything the system could not settle on its own, oldest first. */
export function StaffHome() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<StaffAppRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<QueueKind | 'all'>('all')
  const cycleId = cycle?.id

  useEffect(() => {
    if (cycleId == null) return
    let live = true
    loadCycleApplications(cycleId)
      .then((r) => live && setRows(r))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [cycleId])

  const items = useMemo(() => queueItems(rows ?? []), [rows])
  const count = (k: QueueKind) => items.filter((i) => i.kind === k).length
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const statusCount = (s: string) => (rows ?? []).filter((r) => r.status === s).length

  if (!cycle) return <p className="muted">No program cycle yet. An admin creates one under Cycles &amp; slots.</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p>Everything the system could not settle on its own. Oldest first.</p>
        </div>
        {shown[0] && (
          <Link to={shown[0].link} className="btn btn-lg">
            Start with the oldest →
          </Link>
        )}
      </div>

      {cycle.selection_finalized_at && (
        <div className="banner info" role="note">
          This cycle is finished: the final selection was made {new Date(cycle.selection_finalized_at).toLocaleString('en-PH')}
          ({statusCount('approved')} approved, {statusCount('waitlisted')} waitlisted), so nothing is waiting for review here.
          See <Link to="/staff/ranking">Ranking</Link> or <Link to="/staff/reports">Reports</Link>, or pick another cycle on the left.
        </div>
      )}

      <div className="grid four" style={{ marginBottom: 0 }}>
        <div className="stat"><div className="stat-value">{rows?.length ?? '…'}</div><div className="stat-label">Submitted applications</div></div>
        <div className="stat warn"><div className="stat-value">{count('document')}</div><div className="stat-label">Documents to check</div></div>
        <div className="stat"><div className="stat-value">{count('gates')}</div><div className="stat-label">Ready for eligibility gates</div></div>
        <div className="stat"><div className="stat-value">{statusCount('eligible')}</div><div className="stat-label">Eligible for ranking</div></div>
        <div className="stat"><div className="stat-value">{count('waiting')}</div><div className="stat-label">Waiting for the applicant</div></div>
      </div>

      <div className="chips" role="group" aria-label="Filter the queue">
        {(['all', 'document', 'gates', 'household', 'waiting'] as const).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === 'all' ? `All (${items.length})` : `${KIND_PILL[k][1]} (${count(k)})`}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th scope="col">Applicant</th>
              <th scope="col">Why it is here</th>
              <th scope="col">Type</th>
              <th scope="col">Waiting</th>
              <th scope="col"><span className="sr">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ app, kind, why, link }) => (
              <tr key={app.id}>
                <td>
                  <strong>{app.applicants?.profiles?.full_name ?? '—'}</strong>
                  <div className="small muted">
                    {app.applicants?.profiles?.student_number ?? ''} · {app.applicants?.barangays?.name ?? '—'}
                  </div>
                </td>
                <td>{why}</td>
                <td><span className={`pill small ${KIND_PILL[kind][0]}`}>{KIND_PILL[kind][1]}</span></td>
                <td className="muted">{waited(app.submitted_at)}</td>
                <td className="num">
                  <Link to={link} className="btn">Review</Link>
                </td>
              </tr>
            ))}
            {rows && shown.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing waiting. Well done.</td></tr>
            )}
            {!rows && !error && (
              <tr><td colSpan={5} className="muted" style={{ padding: 24 }}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Every decision taken from this queue needs a written reason and is written to the audit log.</p>
    </>
  )
}
