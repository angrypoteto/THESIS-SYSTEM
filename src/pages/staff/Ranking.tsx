import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
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
  const { cycle, reloadCycles } = useStaff()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [tau, setTau] = useState<number | null>(null)
  const [placeholder, setPlaceholder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const cycleId = cycle?.id

  const loadRuns = useCallback(async () => {
    if (cycleId == null) return
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

  async function run(method: 'topsis' | 'saw', official: boolean) {
    if (cycleId == null) return
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('run_ranking', { p_cycle: cycleId, p_method: method, p_official: official })
    setBusy(false)
    setConfirming(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: official ? 'Official ranking saved. It cannot be run again for this cycle.' : `${method.toUpperCase()} run #${data} saved.` })
    await loadRuns()
    if (method === 'topsis') setRunId(data as number)
  }

  const current = runs.find((r) => r.id === runId)
  const hasOfficial = runs.some((r) => r.is_official)
  const slots = cycle?.slots ?? 0
  const recommended = results.filter((r) => r.recommended)
  const total = recommended.reduce((s, r) => s + Number(r.pay_tier_amount ?? 0), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ranking · {cycle?.name}</h1>
          <p>{current ? `Run #${current.id} · ${current.method.toUpperCase()}${current.method === 'topsis' ? ' with AHP weights' : ' baseline'} · ${current.applicant_count} eligible · ${slots} slots · ${current.is_official ? 'official' : 'not official'}` : 'No run yet for this cycle.'}</p>
        </div>
        {isAdmin && (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-plain" disabled={busy || hasOfficial} onClick={() => run('saw', false)}>Compare with SAW</button>
            <button className="btn btn-lg" disabled={busy || hasOfficial} onClick={() => run('topsis', false)}>Run ranking</button>
            <span className="divider-v" aria-hidden="true" />
            {confirming ? (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-danger-outline" disabled={busy} onClick={() => run('topsis', true)}>Yes, make it official</button>
                <button className="btn-danger-link" onClick={() => setConfirming(false)}>Cancel</button>
              </span>
            ) : (
              <button className="btn btn-danger-outline" disabled={busy || hasOfficial} onClick={() => setConfirming(true)}>Make official…</button>
            )}
          </div>
        )}
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}
      {placeholder && (
        <div className="banner warn" role="note">
          The active weights are the Build Plan's placeholder judgments. Replace them with the office staff's AHP judgments
          (Criteria &amp; weights) before the official run. An official run cannot be repeated for this cycle.
        </div>
      )}
      {confirming && <div className="banner warn" role="alert">Making this official ranks every eligible applicant once, marks them as ranked and locks the cycle's ranking. Staff then approve or waitlist each one.</div>}

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
            {!results.length && <tr><td colSpan={9} className="muted" style={{ padding: 24 }}>{runs.length ? 'This run has no rows.' : isAdmin ? 'Run the ranking once eligible applicants exist.' : 'An admin runs the ranking.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {hasOfficial && cycleId != null && <Waitlist cycleId={cycleId} slots={slots} isAdmin={isAdmin} finalizedAt={cycle?.selection_finalized_at ?? null} onFinalized={reloadCycles} />}

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
        <td><Link to={`/staff/applicants/${r.application_id}`} style={{ fontWeight: 600 }}>{r.applications?.applicants?.profiles?.full_name ?? 'Applicant'}</Link></td>
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
function Waitlist({ cycleId, slots, isAdmin, finalizedAt, onFinalized }: { cycleId: number; slots: number; isAdmin: boolean; finalizedAt: string | null; onFinalized: () => void }) {
  const [ranked, setRanked] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [approved, setApproved] = useState<number | null>(null)
  const [waiting, setWaiting] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

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

  async function finalize() {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('finalize_selection', { p_cycle: cycleId })
    setBusy(false)
    setConfirm(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    const d = data as { approved: number; waitlisted: number }
    setMsg({ kind: 'ok', text: `Final selection done: ${d.approved} approved, ${d.waitlisted} waitlisted. Everyone was emailed.` })
    load()
    onFinalized()
  }

  const open = approved == null ? null : Math.max(0, slots - approved)
  return (
    <section className="card" aria-labelledby="waitlist">
      <h2 id="waitlist">Final selection</h2>
      {!finalizedAt && (
        <div className="banner info" style={{ marginBottom: 12 }}>
          The system selects the final beneficiaries from this ranking: the top-ranked applicants up to the {slots} slots are approved,
          the rest are waitlisted, and everyone is emailed. {ranked ?? '…'} ranked applicant{ranked === 1 ? '' : 's'} waiting.
          {isAdmin ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {confirm ? (
                <>
                  <button className="btn btn-danger-outline" disabled={busy} onClick={finalize}>Yes, select and email everyone</button>
                  <button type="button" className="btn-danger-link" onClick={() => setConfirm(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn" disabled={busy || !ranked} onClick={() => setConfirm(true)}>Finalize selection…</button>
              )}
            </div>
          ) : <> An admin finalizes the selection.</>}
        </div>
      )}
      {finalizedAt && <p className="small muted" style={{ marginTop: 0 }}>Selection finalized {new Date(finalizedAt).toLocaleString('en-PH')}. A slot freed by a withdrawal goes to the next on the waitlist automatically. A change to one applicant needs a written reason on their file and is logged as an override.</p>}
      <p style={{ marginTop: 0 }}>
        <strong>{approved ?? '…'}</strong> of {slots} slots approved · <strong>{open ?? '…'}</strong> open · <strong>{waiting ?? '…'}</strong> on the waitlist
      </p>
      {open != null && open > 0 && (waiting ?? 0) > 0 ? (
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field">Reason (logged)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Slot freed: scholar transferred school" />
          </label>
          <div><button className="btn" disabled={busy || !reason.trim()} onClick={promote}>Approve the next on the waitlist</button></div>
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
