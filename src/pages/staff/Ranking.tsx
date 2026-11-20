import { useRequired } from '../../components/useRequired'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'

interface Run { id: number; method: string; is_official: boolean; applicant_count: number; started_at: string; weight_set_id: number }
interface Result {
  rank: number; closeness: number; recommended: boolean; pay_tier_amount: number | null; application_id: string
  criterion_values: Record<string, number>
  applications: { applicants: { profiles: { full_name: string } | null } | null } | null
}

/** Kendall's tau-a between two rankings of the same applicants (agreement of TOPSIS with the SAW baseline). */
function kendall(a: Map<string, number>, b: Map<string, number>): number | null {
  const ids = [...a.keys()].filter((k) => b.has(k))
  if (ids.length < 2) return null
  let s = 0
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      s += Math.sign((a.get(ids[i])! - a.get(ids[j])!) * (b.get(ids[i])! - b.get(ids[j])!))
  return s / ((ids.length * (ids.length - 1)) / 2)
}

/** Design screen 8. */
export function Ranking() {
  const { cycle } = useStaff()
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [tau, setTau] = useState<number | null>(null)
  const [placeholder, setPlaceholder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const cycleId = cycle?.id

  const loadRuns = useCallback(async () => {
    if (cycleId == null) return
    // ranked automatically (client, 2026-11-21): re-ranks only if something changed since the last ranking
    const auto = await supabase.rpc('ensure_current_ranking', { p_cycle: cycleId })
    if (auto.error) setMsg({ kind: 'error', text: auto.error.message })
    const [{ data }, ws] = await Promise.all([
      supabase.from('ranking_runs').select('id,method,is_official,applicant_count,started_at,weight_set_id').eq('cycle_id', cycleId).order('started_at', { ascending: false }),
      supabase.from('criteria_weight_sets').select('is_placeholder').eq('is_active', true).maybeSingle(),
    ])
    const list = (data as Run[]) ?? []
    setRuns(list)
    setPlaceholder(Boolean((ws.data as { is_placeholder: boolean } | null)?.is_placeholder))
    setRunId((cur) => (cur && list.some((r) => r.id === cur) ? cur : (list.find((r) => r.is_official) ?? list.find((r) => r.method === 'topsis') ?? list[0])?.id ?? null))
  }, [cycleId])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (runId == null) return setResults([])
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('results')
        .select('rank,closeness,recommended,pay_tier_amount,application_id,criterion_values,applications(applicants(profiles(full_name)))')
        .eq('run_id', runId)
        .order('rank')
      if (!live) return
      const rs = (data as unknown as Result[]) ?? []
      setResults(rs)
      const run = runs.find((r) => r.id === runId)
      const saw = runs.find((r) => r.method === 'saw' && r.id !== runId)
      if (run?.method === 'topsis' && saw) {
        const { data: s } = await supabase.from('results').select('application_id,rank').eq('run_id', saw.id)
        if (!live) return
        const a = new Map(rs.map((r) => [r.application_id, r.rank]))
        const b = new Map(((s as { application_id: string; rank: number }[]) ?? []).map((r) => [r.application_id, r.rank]))
        setTau(kendall(a, b))
      } else setTau(null)
    })()
    return () => {
      live = false
    }
  }, [runId, runs])

  /** SAW baseline for comparison only (the TOPSIS ranking itself runs automatically) */
  async function compareSaw() {
    if (cycleId == null) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('run_ranking', { p_cycle: cycleId, p_method: 'saw', p_official: false })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: 'SAW comparison saved; Kendall tau shows how close the two orders are.' })
    await loadRuns()
  }

  const current = runs.find((r) => r.id === runId)
  const hasOfficial = runs.some((r) => r.is_official)
  const slots = cycle?.slots ?? 0
  const recommended = results.filter((r) => r.recommended)
  const total = recommended.reduce((s, r) => s + Number(r.pay_tier_amount ?? 0), 0)
  const deadline = cycle?.step2_closes_at ? new Date(cycle.step2_closes_at) : null
  const fmt = (d: Date) => d.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ranking · {cycle?.name}</h1>
          <p>{current
            ? `${current.is_official ? 'Official ranking' : current.method === 'saw' ? 'SAW comparison' : 'Ranked automatically'} · ${current.applicant_count} eligible · ${slots} slots · updated ${new Date(current.started_at).toLocaleString('en-PH')}`
            : 'Nobody is eligible for ranking yet.'}</p>
        </div>
        {!hasOfficial && results.length > 0 && (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-plain" aria-busy={busy} disabled={busy} onClick={compareSaw}>Compare with SAW</button>
          </div>
        )}
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}
      {placeholder && (
        <div className="banner warn" role="note">
          The active weights are the Build Plan's placeholder judgments. Replace them with the office staff's AHP judgments
          (Criteria &amp; weights) before step 2 closes: the final selection uses the weights active at that moment.
        </div>
      )}
      {!hasOfficial && (deadline ? (
        <div className="banner info" role="note">
          Only applicants who passed the interview are ranked; the order updates by itself. The final selection is automatic:
          after step 2 closes ({fmt(deadline)}), once every step-2 application has been checked and every interview is settled
          (Passed or Forfeited), the top {slots} are approved and the rest are waitlisted.
          {deadline.getTime() < Date.now() && ' Step 2 has closed; the selection is made within the hour once the last interview is settled.'}
        </div>
      ) : (
        <div className="banner warn" role="note">
          No step 2 deadline is set for this cycle, so the final selection cannot happen yet. Set the deadline on Cycles &amp; slots:
          the selection is made automatically after it.
        </div>
      ))}

      {runs.length > 1 && (
        <label className="field" style={{ maxWidth: 360 }}>Show run
          <select value={runId ?? ''} onChange={(e) => setRunId(Number(e.target.value))}>
            {runs.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.method.toUpperCase()} · {new Date(r.started_at).toLocaleString('en-PH')}{r.is_official ? ' · official' : ''}</option>)}
          </select>
        </label>
      )}

      {results.length > 0 && (
        <div className="grid four" style={{ marginBottom: 0 }}>
          <div className="stat"><div className="stat-value">{recommended.length} of {results.length}</div><div className="stat-label">Recommended for a slot</div></div>
          {total > 0 && <div className="stat"><div className="stat-value">PHP {total.toLocaleString()}</div><div className="stat-label">Allowances per release</div></div>}
          <div className="stat"><div className="stat-value">{tau == null ? '—' : tau.toFixed(2)}</div><div className="stat-label">Kendall τ vs SAW baseline</div></div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr><th>Rank</th><th>Applicant</th><th>Closeness</th><th>Income / person</th><th>SES</th><th>Household</th><th>GWA</th><th>Selection</th></tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <RowWithLine key={r.application_id} r={r} showLine={i === slots - 1 && results.length > slots} />
            ))}
            {!results.length && <tr><td colSpan={9} className="muted" style={{ padding: 24 }}>{runs.length ? 'This run has no rows.' : 'Nobody to rank yet. Applicants appear here by themselves once their interview is marked Passed.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {hasOfficial && cycleId != null && <Waitlist cycleId={cycleId} slots={slots} finalizedAt={cycle?.selection_finalized_at ?? null} />}

      <p className="small muted" style={{ margin: 0 }}>Ties are broken by lower income per person, then higher GWA, then earlier submission. The whole pool is ranked in one stored run, so the order is reproducible.</p>
    </>
  )
}

function RowWithLine({ r, showLine }: { r: Result; showLine: boolean }) {
  const v = r.criterion_values
  return (
    <>
      <tr style={{ color: r.recommended ? undefined : 'var(--muted)' }}>
        <td><strong>{r.rank}</strong></td>
        <td><Link to={`/staff/applicants/${r.application_id}`} state={{ from: '/staff/ranking' }} style={{ fontWeight: 600 }}>{r.applications?.applicants?.profiles?.full_name ?? 'Applicant'}</Link></td>
        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="bar" style={{ width: Math.max(4, Number(r.closeness) * 100) }} />{Number(r.closeness).toFixed(3)}</span></td>
        <td>{v.C1 != null ? `PHP ${Math.round(v.C1).toLocaleString()}` : '—'}</td>
        <td>{v.C2 != null ? Number(v.C2).toFixed(2) : '—'}</td>
        <td>{v.C3 ?? '—'}</td>
        <td>{v.C4 != null ? `${v.C4}%` : '—'}</td>
        <td>{r.recommended ? (r.pay_tier_amount ? `PHP ${Number(r.pay_tier_amount).toLocaleString()}` : 'Within the slots') : 'Waitlist'}</td>
      </tr>
      {showLine && <tr className="slot-line"><td colSpan={8}><div>Slot line. Applicants below are waitlisted in rank order.</div></td></tr>}
    </>
  )
}

/** After the official ranking: open slots (slots minus approved) and promotion of the best-ranked waitlisted applicant. */
function Waitlist({ cycleId, slots, finalizedAt }: { cycleId: number; slots: number; finalizedAt: string | null }) {
  const [ranked, setRanked] = useState<number | null>(null)
  const [approved, setApproved] = useState<number | null>(null)
  const [waiting, setWaiting] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const need = useRequired(reason, 'Write the reason first (it is logged).')

  const load = useCallback(async () => {
    const [a, w, rk] = await Promise.all([
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId).eq('status', 'approved'),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId).eq('status', 'waitlisted'),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId).eq('status', 'ranked'),
    ])
    setRanked(rk.count ?? 0)
    setApproved(a.count ?? 0)
    setWaiting(w.count ?? 0)
  }, [cycleId])

  useEffect(() => {
    load()
  }, [load])

  async function promote() {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('promote_from_waitlist', { p_cycle: cycleId, p_reason: reason.trim() })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: 'Promoted and approved; the applicant was emailed.' })
    setReason('')
    load()
    return data
  }

  const open = approved == null ? null : Math.max(0, slots - approved)
  return (
    <section className="card" aria-labelledby="waitlist">
      <h2 id="waitlist">Final selection</h2>
      {!finalizedAt && <p className="small muted" style={{ marginTop: 0 }}>The ranking is official; the system is selecting the final beneficiaries ({ranked ?? '…'} ranked applicant{ranked === 1 ? '' : 's'} waiting).</p>}
      {finalizedAt && <p className="small muted" style={{ marginTop: 0 }}>Selection finalized automatically {new Date(finalizedAt).toLocaleString('en-PH')}. A slot freed by a withdrawal goes to the next on the waitlist automatically. A change to one applicant needs a written reason on their file and is logged as an override.</p>}
      <p style={{ marginTop: 0 }}>
        <strong>{approved ?? '…'}</strong> of {slots} slots approved · <strong>{open ?? '…'}</strong> open · <strong>{waiting ?? '…'}</strong> on the waitlist
      </p>
      {open != null && open > 0 && (waiting ?? 0) > 0 ? (
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field">Reason (logged)
            <input {...need.props} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Slot freed: scholar transferred school" />
            {need.error}
          </label>
          <div><button className="btn" disabled={busy} onClick={() => need.check() && promote()}>Approve the next on the waitlist</button></div>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {open === 0 ? 'All slots are filled. When an approved scholar withdraws (Withdraw on their file), a slot opens here.' : 'Nobody is on the waitlist.'}
        </p>
      )}
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}
    </section>
  )
}
