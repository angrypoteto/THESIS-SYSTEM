import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import type { ApplicationStatus } from '../../lib/types'

interface Row {
  id: string
  status: ApplicationStatus
  stage: 1 | 2
  exam_result: 'passed' | 'failed' | 'absent' | null
  exam_score: number | null
  combined_score: number | null
  academic_rank: number | null
  applicant_no: string | null
  gwa_converted: number | null
  step1_submitted_at: string | null
  applicants: { course: string | null; profiles: { full_name: string; student_number: string | null } | null } | null
}

interface ImportSummary {
  recorded: number
  not_found: string[]
  skipped: { student_number: string; error?: string }[]
}

type Parsed = { student_number: string; score?: number; result?: 'absent' }

/** Parse "student number, score" lines (CSV or tab-separated, as pasted from RTU's spreadsheet). "absent" instead of a score marks a no-show. */
function parseList(text: string): { rows: Parsed[]; bad: string[] } {
  const rows: Parsed[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [num, val = ''] = line.split(/[,\t;]/).map((x) => x.trim())
    if (!num || /student/i.test(num)) continue // header row
    if (/^a(bsent)?$/i.test(val)) rows.push({ student_number: num, result: 'absent' })
    else if (val !== '' && Number(val) >= 0 && Number(val) <= 100) rows.push({ student_number: num, score: Number(val) })
    else bad.push(line)
  }
  return { rows, bad }
}

const combined = (score: number, gwa: number | null) => Math.round((score * 0.7 + Number(gwa ?? 0) * 0.3) * 1000) / 1000

/**
 * Qualifying exam (client flow v3). RTU gives a course-specific exam; staff record each applicant's SCORE. The
 * combined academic result is 70% exam score + 30% GWA. When every score is in, the admin finalizes the ranking:
 * the top N (cycle setting) proceed to step 2 and are emailed their official Applicant ID; the rest are told
 * they did not qualify to proceed.
 */
export function ExamResults() {
  const { cycle, reloadCycles } = useStaff()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [confirming, setConfirming] = useState(false)
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase
      .from('applications')
      .select('id,status,stage,exam_result,exam_score,combined_score,academic_rank,applicant_no,gwa_converted,step1_submitted_at,applicants(course,profiles(full_name,student_number))')
      .eq('cycle_id', cycleId)
      .or('status.in.(exam_eligible,exam_failed),exam_result.not.is.null')
    if (error) setError(error.message)
    else setRows((data as unknown as Row[]) ?? [])
  }, [cycleId])

  useEffect(() => {
    load()
  }, [load])

  const parsed = useMemo(() => parseList(paste), [paste])
  const all = rows ?? []
  const finalized = !!cycle?.exam_finalized_at
  const take = cycle?.step2_slots ?? cycle?.slots ?? 0
  const waiting = all.filter((r) => r.status === 'exam_eligible')
  const noScore = waiting.filter((r) => r.exam_score == null)

  // live ranking: same order as the database (combined, exam score, GWA, earlier step 1)
  const ranked = useMemo(() => {
    const pool = all.filter((r) => (finalized ? r.academic_rank != null : r.status === 'exam_eligible' && r.exam_score != null))
    return [...pool].sort((a, b) => finalized
      ? a.academic_rank! - b.academic_rank!
      : Number(b.combined_score) - Number(a.combined_score) || Number(b.exam_score) - Number(a.exam_score)
        || Number(b.gwa_converted) - Number(a.gwa_converted) || String(a.step1_submitted_at).localeCompare(String(b.step1_submitted_at)))
  }, [all, finalized])
  const others = all.filter((r) => !ranked.includes(r))

  async function call(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, done?: string) {
    setBusy(key)
    setError(null)
    setOk(null)
    const { error } = await fn()
    setBusy(null)
    if (error) return setError(error.message)
    if (done) setOk(done)
    await load()
  }

  const saveScore = (r: Row) => {
    const v = draft[r.id]
    if (v == null || v === '' || !(Number(v) >= 0 && Number(v) <= 100)) return setError('The exam score is a percentage from 0 to 100.')
    return call(r.id, () => supabase.rpc('record_exam_score', { p_app: r.id, p_score: Number(v) }))
  }

  async function runImport() {
    if (!cycleId || parsed.rows.length === 0) return
    setBusy('import')
    setError(null)
    const { data, error } = await supabase.rpc('import_exam_scores', { p_cycle: cycleId, p_rows: parsed.rows })
    setBusy(null)
    if (error) return setError(error.message)
    setSummary(data as ImportSummary)
    setPaste('')
    load()
  }

  async function finalize() {
    if (!cycleId) return
    setBusy('finalize')
    setError(null)
    const { data, error } = await supabase.rpc('finalize_exam_ranking', { p_cycle: cycleId })
    setBusy(null)
    setConfirming(false)
    if (error) return setError(error.message)
    const d = data as { proceed: number; not_proceed: number }
    setOk(`Ranking finalized: ${d.proceed} proceed to step 2 and were emailed their Applicant ID; ${d.not_proceed} did not qualify and were emailed their result.`)
    reloadCycles()
    load()
  }

  if (!cycle) return <p className="muted">No program cycle yet. An admin creates one under Cycles &amp; slots.</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qualifying exam</h1>
          <p>
            Course-specific exam given on paper at RTU
            {cycle.exam_at ? ` on ${new Date(cycle.exam_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}` : ' (date not set)'}
            {cycle.exam_venue ? `, ${cycle.exam_venue}` : ''}. Combined result = 70% exam score + 30% GWA. The top {take} proceed to step 2.
          </p>
        </div>
      </div>

      <div className="grid four" style={{ marginBottom: 0 }}>
        <div className="stat warn"><div className="stat-value">{rows ? noScore.length : '…'}</div><div className="stat-label">Waiting for a score</div></div>
        <div className="stat"><div className="stat-value">{finalized ? all.filter((r) => r.academic_rank != null).length : waiting.length - noScore.length}</div><div className="stat-label">Scores recorded</div></div>
        <div className="stat"><div className="stat-value">{finalized ? all.filter((r) => r.exam_result === 'passed').length : Math.min(take, ranked.length)} / {take}</div><div className="stat-label">{finalized ? 'Proceeded to step 2' : 'Would proceed now'}</div></div>
        <div className="stat"><div className="stat-value">{all.filter((r) => r.exam_result === 'absent').length}</div><div className="stat-label">Absent</div></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="success" role="status">{ok}</p>}

      {!finalized && (
        <section className="card">
          <h2>Paste RTU's score list</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            One student per line: <code>student number, score</code> (0 to 100). Write <code>absent</code> instead of a score for a
            student who did not take the exam. Copy two columns from RTU's spreadsheet.
          </p>
          <label className="field">
            <span className="sr">Score list</span>
            <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'2026-00123, 87.5\n2026-00456, 72\n2026-00789, absent'} />
          </label>
          {paste && (
            <p className="small">
              {parsed.rows.length} line{parsed.rows.length === 1 ? '' : 's'} ready
              {parsed.bad.length > 0 && <span className="error"> · {parsed.bad.length} not understood: {parsed.bad.slice(0, 3).join(' | ')}</span>}
            </p>
          )}
          <button aria-busy={busy === 'import'} className="btn btn-lg" disabled={busy === 'import' || parsed.rows.length === 0} onClick={runImport}>
            {busy === 'import' ? 'Recording…' : `Record ${parsed.rows.length || ''} line${parsed.rows.length === 1 ? '' : 's'}`}
          </button>
          {summary && (
            <div className="banner info" style={{ marginTop: 14 }} role="status">
              Recorded {summary.recorded}.
              {summary.not_found.length > 0 && <> Not found in this cycle: {summary.not_found.join(', ')}.</>}
              {summary.skipped.length > 0 && <> Skipped: {summary.skipped.map((s) => `${s.student_number} (${s.error})`).join(', ')}.</>}
            </div>
          )}
        </section>
      )}

      {!finalized && noScore.length > 0 && (
        <section className="card">
          <h2>Waiting for a score ({noScore.length})</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead><tr><th>Applicant</th><th>Student no.</th><th>Course</th><th className="num">GWA</th><th>Exam score (%)</th></tr></thead>
              <tbody>
                {noScore.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/staff/applicants/${r.id}`}>{r.applicants?.profiles?.full_name ?? '—'}</Link></td>
                    <td>{r.applicants?.profiles?.student_number ?? '—'}</td>
                    <td>{r.applicants?.course ?? '—'}</td>
                    <td className="num">{r.gwa_converted ?? '—'}%</td>
                    <td>
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="number" min={0} max={100} step={0.01} aria-label={`Exam score of ${r.applicants?.profiles?.full_name}`} style={{ width: 110 }}
                          value={draft[r.id] ?? ''} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })} />
                        <button className="btn" disabled={busy === r.id || !draft[r.id]} onClick={() => saveScore(r)}>Save</button>
                        <button className="btn btn-plain" disabled={busy === r.id}
                          onClick={() => call(r.id, () => supabase.rpc('record_exam_result', { p_app: r.id, p_result: 'absent', p_note: null }))}>Absent</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Academic and examination ranking{finalized ? ' (final)' : ' (preview)'}</h2>
          {!finalized && isAdmin && (
            confirming ? (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-danger-outline" disabled={busy === 'finalize'} onClick={finalize}>Yes, finalize and email everyone</button>
                <button className="btn-danger-link" onClick={() => setConfirming(false)}>Cancel</button>
              </span>
            ) : (
              <button className="btn btn-danger-outline" disabled={ranked.length === 0 || noScore.length > 0} onClick={() => setConfirming(true)}>Finalize ranking…</button>
            )
          )}
        </div>
        {!finalized && (
          <p className="small muted">
            {noScore.length > 0 ? `${noScore.length} applicant${noScore.length === 1 ? ' has' : 's have'} no score yet: record a score or mark them absent before finalizing. `
              : ranked.length > 0 ? (isAdmin ? 'All scores are in. ' : 'All scores are in. An admin finalizes the ranking. ') : ''}
            Finalizing can be done once per cycle: the top {take} get an Applicant ID and proceed to step 2, the others are told they did not qualify.
          </p>
        )}
        {confirming && <div className="banner warn" role="alert">This emails every applicant below their result and cannot be run again for this cycle. A score can still be corrected before you confirm.</div>}
        {ranked.length === 0 && <p className="muted">No scores yet. Applicants appear in “Waiting for a score” after they pass the step 1 screening.</p>}
        {ranked.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr><th>Rank</th><th>Applicant</th><th>Course</th><th className="num">Exam (70%)</th><th className="num">GWA (30%)</th><th className="num">Combined</th><th>{finalized ? 'Applicant ID' : 'Change score'}</th></tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <RankRow key={r.id} r={r} rank={finalized ? r.academic_rank! : i + 1} line={i === take - 1 && ranked.length > take} finalized={finalized}
                    draft={draft[r.id]} setDraft={(v) => setDraft({ ...draft, [r.id]: v })} busy={busy === r.id} onSave={() => saveScore(r)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {others.filter((r) => r.exam_result && r.academic_rank == null).length > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Not ranked: {others.filter((r) => r.exam_result && r.academic_rank == null).map((r) => `${r.applicants?.profiles?.full_name ?? '—'} (${r.exam_result})`).join(', ')}.
          </p>
        )}
      </section>
    </>
  )
}

function RankRow({ r, rank, line, finalized, draft, setDraft, busy, onSave }: {
  r: Row; rank: number; line: boolean; finalized: boolean; draft: string | undefined; setDraft: (v: string) => void; busy: boolean; onSave: () => void
}) {
  const preview = draft != null && draft !== '' ? combined(Number(draft), r.gwa_converted) : null
  return (
    <>
      <tr>
        <td><strong>{rank}</strong></td>
        <td><Link to={`/staff/applicants/${r.id}`}>{r.applicants?.profiles?.full_name ?? '—'}</Link><div className="small muted">{r.applicants?.profiles?.student_number ?? ''}</div></td>
        <td>{r.applicants?.course ?? '—'}</td>
        <td className="num">{r.exam_score}%</td>
        <td className="num">{r.gwa_converted}%</td>
        <td className="num"><strong>{Number(r.combined_score).toFixed(2)}%</strong></td>
        <td>
          {finalized ? (r.applicant_no ?? <span className="muted">did not proceed</span>) : (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" min={0} max={100} step={0.01} aria-label="New exam score" style={{ width: 100 }} value={draft ?? ''} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn btn-plain" disabled={busy || !draft} onClick={onSave}>Save</button>
              {preview != null && <span className="small muted">→ {preview.toFixed(2)}%</span>}
            </span>
          )}
        </td>
      </tr>
      {line && <tr className="slot-line"><td colSpan={7}><div>Step 2 line. Applicants below do not proceed.</div></td></tr>}
    </>
  )
}
