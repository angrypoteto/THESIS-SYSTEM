import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { download, type ReportRow, reportCsv, STATUS_LABEL } from '../../lib/report'
import { supabase } from '../../lib/supabase'

const peso = (n: number | null) => (n == null ? '—' : `PHP ${Math.round(Number(n)).toLocaleString()}`)
const ORDER = ['submitted', 'under_review', 'exam_eligible', 'exam_failed', 'ineligible', 'eligible', 'ranked', 'approved', 'waitlisted', 'not_selected', 'withdrawn']

/**
 * Cycle report: totals, the ranked list with every criterion value, decision and interview, and an export
 * (CSV for Excel; "Print / PDF" uses the browser's print dialog with a print layout).
 */
export function Reports() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'ranked' | 'all'>('ranked')
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase.rpc('cycle_report', { p_cycle: cycleId })
    if (error) setError(error.message)
    else setRows((data as ReportRow[]) ?? [])
  }, [cycleId])

  useEffect(() => {
    load()
  }, [load])

  const all = rows ?? []
  const byStatus = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) m.set(r.status, (m.get(r.status) ?? 0) + 1)
    return ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const)
  }, [all])
  const byBarangay = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) if (r.rank != null) m.set(r.barangay ?? 'Not set', (m.get(r.barangay ?? 'Not set') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [all])
  const approved = all.filter((r) => r.status === 'approved')
  const overrides = all.filter((r) => r.decision_override).length
  const allowance = approved.reduce((s, r) => s + Number(r.pay_tier_amount ?? 0), 0)
  const shown = view === 'ranked' ? all.filter((r) => r.rank != null) : all
  const maxStatus = Math.max(1, ...byStatus.map(([, n]) => n))
  const maxBrgy = Math.max(1, ...byBarangay.map(([, n]) => n))

  if (!cycle) return <p className="muted">No program cycle yet.</p>

  const stamp = new Date().toISOString().slice(0, 10)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Report · {cycle.name}</h1>
          <p>{cycle.school_year} · {cycle.term} · {cycle.slots} slots · printed {new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
        </div>
        <div className="actions no-print" style={{ marginTop: 0 }}>
          <button className="btn btn-plain" disabled={!rows?.length} onClick={() => download(`scholarship-report-${cycle.school_year}-${stamp}.csv`, reportCsv(all))}>Export to Excel (CSV)</button>
          <button className="btn" disabled={!rows?.length} onClick={() => window.print()}>Print / save as PDF</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="grid four" style={{ marginBottom: 0 }}>
        <div className="stat"><div className="stat-value">{rows ? all.length : '…'}</div><div className="stat-label">Applications submitted</div></div>
        <div className="stat"><div className="stat-value">{approved.length} / {cycle.slots}</div><div className="stat-label">Approved / slots</div></div>
        {allowance > 0 && <div className="stat"><div className="stat-value">{peso(allowance)}</div><div className="stat-label">Allowances of approved (per release)</div></div>}
        <div className="stat"><div className="stat-value">{overrides}</div><div className="stat-label">Decisions against the recommendation</div></div>
      </div>

      <div className="grid two">
        <section className="card">
          <h2>By status</h2>
          <table className="table"><tbody>
            {byStatus.map(([s, n]) => (
              <tr key={s}><td>{STATUS_LABEL[s] ?? s}</td>
                <td style={{ width: '55%' }}><span className="bar" style={{ width: `${(n / maxStatus) * 100}%` }} /></td>
                <td className="num">{n}</td></tr>
            ))}
            {byStatus.length === 0 && <tr><td className="muted">No submitted applications yet.</td></tr>}
          </tbody></table>
        </section>
        <section className="card">
          <h2>Ranked applicants by barangay</h2>
          <table className="table"><tbody>
            {byBarangay.map(([b, n]) => (
              <tr key={b}><td>{b}</td>
                <td style={{ width: '55%' }}><span className="bar" style={{ width: `${(n / maxBrgy) * 100}%` }} /></td>
                <td className="num">{n}</td></tr>
            ))}
            {byBarangay.length === 0 && <tr><td className="muted">No ranking yet.</td></tr>}
          </tbody></table>
        </section>
      </div>

      <section className="card">
        <div className="chips no-print" role="group" aria-label="Rows">
          <button type="button" className="chip" aria-pressed={view === 'ranked'} onClick={() => setView('ranked')}>Ranked list</button>
          <button type="button" className="chip" aria-pressed={view === 'all'} onClick={() => setView('all')}>All applications</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table report-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr><th>Rank</th><th>Applicant</th><th>Barangay</th><th className="num">Income / person</th><th className="num">SES</th>
                <th className="num">Household</th><th className="num">GWA</th><th className="num">Distance</th><th className="num">Closeness</th>
                <th>Status</th><th className="num">Allowance</th><th>Interview</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.application_id}>
                  <td>{r.rank ?? '—'}{r.recommended ? <span className="pill ok small" style={{ marginLeft: 6 }}>slot</span> : null}</td>
                  <td><Link to={`/staff/applicants/${r.application_id}`}>{r.full_name}</Link><div className="small muted">{r.student_number ?? ''}{r.course ? ` · ${r.course}` : ''}</div></td>
                  <td>{r.barangay ?? '—'}</td>
                  <td className="num">{peso(r.per_capita_income)}</td>
                  <td className="num">{r.ses_index != null ? Number(r.ses_index).toFixed(2) : '—'}</td>
                  <td className="num">{r.household_size ?? '—'}</td>
                  <td className="num">{r.gwa != null ? `${r.gwa}%` : '—'}</td>
                  <td className="num">{r.distance_km != null ? `${r.distance_km} km` : '—'}</td>
                  <td className="num">{r.closeness != null ? Number(r.closeness).toFixed(3) : '—'}</td>
                  <td>{STATUS_LABEL[r.status] ?? r.status}{r.decision_override ? <span className="pill warn small" style={{ marginLeft: 6 }}>override</span> : null}</td>
                  <td className="num">{r.status === 'approved' ? peso(r.pay_tier_amount) : '—'}</td>
                  <td>{r.interview_at ? `${new Date(r.interview_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${r.interview_status?.replace('_', ' ')}` : '—'}</td>
                </tr>
              ))}
              {rows && shown.length === 0 && <tr><td colSpan={12} className="muted" style={{ padding: 24 }}>{view === 'ranked' ? 'No ranking run for this cycle yet.' : 'No submitted applications yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Income per person is the verified declared income, or the model&rsquo;s estimate when no document supports it. The export
          also lists sex (for the fairness report only; it is never used to rank), flags, decision reasons and dates.
        </p>
      </section>
    </>
  )
}
