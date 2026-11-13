import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import type { ApplicationStatus } from '../../lib/types'

type ExamResult = 'passed' | 'failed' | 'absent'

interface Row {
  id: string
  status: ApplicationStatus
  stage: 1 | 2
  exam_result: ExamResult | null
  exam_recorded_at: string | null
  gwa_converted: number | null
  applicants: { year_level: number | null; profiles: { full_name: string; student_number: string | null } | null } | null
}

interface ImportSummary {
  recorded: number
  not_found: string[]
  skipped: { student_number: string; status?: string; error?: string }[]
}

const RESULT_TEXT: Record<ExamResult, string> = { passed: 'Passed', failed: 'Did not pass', absent: 'Absent' }

/** Parse "student number, result" lines (CSV or tab-separated, as pasted from RTU's spreadsheet). */
function parseList(text: string): { rows: { student_number: string; result: ExamResult }[]; bad: string[] } {
  const rows: { student_number: string; result: ExamResult }[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [num, res = 'passed'] = line.split(/[,\t;]/).map((x) => x.trim())
    const r = res.toLowerCase()
    const result: ExamResult | null = ['passed', 'pass', 'p'].includes(r) ? 'passed'
      : ['failed', 'fail', 'f'].includes(r) ? 'failed'
      : ['absent', 'a'].includes(r) ? 'absent' : null
    if (!num || /student/i.test(num)) continue // header row
    if (!result) bad.push(line)
    else rows.push({ student_number: num, result })
  }
  return { rows, bad }
}

/**
 * The qualifying exam is given on paper by RTU. Staff record each result here, or paste the list RTU sends.
 * "Passed" reopens the application as a step 2 draft and notifies the applicant; a result can be corrected
 * until the applicant submits step 2.
 */
export function ExamResults() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<'waiting' | 'recorded' | 'all'>('waiting')
  const [paste, setPaste] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase
      .from('applications')
      .select('id,status,stage,exam_result,exam_recorded_at,gwa_converted,applicants(year_level,profiles(full_name,student_number))')
      .eq('cycle_id', cycleId)
      .or('status.in.(exam_eligible,exam_failed),exam_result.not.is.null')
      .order('step1_submitted_at', { ascending: true })
    if (error) setError(error.message)
    else setRows((data as unknown as Row[]) ?? [])
  }, [cycleId])

  useEffect(() => {
    load()
  }, [load])

  const parsed = useMemo(() => parseList(paste), [paste])
  const waiting = (rows ?? []).filter((r) => r.status === 'exam_eligible')
  const shown = (rows ?? []).filter((r) => filter === 'all' || (filter === 'waiting' ? r.status === 'exam_eligible' : r.exam_result))
  // a result can be changed until the passer submits step 2
  const editable = (r: Row) => r.status === 'exam_eligible' || r.status === 'exam_failed' || (r.stage === 2 && r.status === 'draft')

  async function record(r: Row, result: ExamResult) {
    setBusy(r.id)
    setError(null)
    const { error } = await supabase.rpc('record_exam_result', { p_app: r.id, p_result: result, p_note: null })
    setBusy(null)
    if (error) setError(error.message)
    else load()
  }

  async function runImport() {
    if (!cycleId || parsed.rows.length === 0) return
    setBusy('import')
    setError(null)
    const { data, error } = await supabase.rpc('import_exam_results', { p_cycle: cycleId, p_rows: parsed.rows })
    setBusy(null)
    if (error) return setError(error.message)
    setSummary(data as ImportSummary)
    setPaste('')
    load()
  }

  if (!cycle) return <p className="muted">No program cycle yet. An admin creates one under Cycles &amp; slots.</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qualifying exam</h1>
          <p>
            Given on paper at RTU
            {cycle.exam_at ? ` on ${new Date(cycle.exam_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}` : ' (date not set)'}
            {cycle.exam_venue ? `, ${cycle.exam_venue}` : ''}. Record the results RTU gives you; passers are asked for the step 2 requirements.
          </p>
        </div>
      </div>

      <div className="grid four" style={{ marginBottom: 0 }}>
        <div className="stat warn"><div className="stat-value">{rows ? waiting.length : '…'}</div><div className="stat-label">Waiting for a result</div></div>
        <div className="stat"><div className="stat-value">{(rows ?? []).filter((r) => r.exam_result === 'passed').length}</div><div className="stat-label">Passed</div></div>
        <div className="stat"><div className="stat-value">{(rows ?? []).filter((r) => r.exam_result === 'failed').length}</div><div className="stat-label">Did not pass</div></div>
        <div className="stat"><div className="stat-value">{(rows ?? []).filter((r) => r.exam_result === 'absent').length}</div><div className="stat-label">Absent</div></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="card">
        <h2>Paste RTU's result list</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          One student per line: <code>student number, result</code> (passed, failed or absent). Copy two columns from RTU's
          spreadsheet; a line with only the student number counts as passed.
        </p>
        <label className="field">
          <span className="sr">Result list</span>
          <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'2026-00123, passed\n2026-00456, failed'} />
        </label>
        {paste && (
          <p className="small">
            {parsed.rows.length} line{parsed.rows.length === 1 ? '' : 's'} ready
            {parsed.bad.length > 0 && <span className="error"> · {parsed.bad.length} not understood: {parsed.bad.slice(0, 3).join(' | ')}</span>}
          </p>
        )}
        <button className="btn btn-lg" disabled={busy === 'import' || parsed.rows.length === 0} onClick={runImport}>
          {busy === 'import' ? 'Recording…' : `Record ${parsed.rows.length || ''} result${parsed.rows.length === 1 ? '' : 's'}`}
        </button>
        {summary && (
          <div className="banner info" style={{ marginTop: 14 }} role="status">
            Recorded {summary.recorded}.
            {summary.not_found.length > 0 && <> Not found in this cycle: {summary.not_found.join(', ')}.</>}
            {summary.skipped.length > 0 && <> Skipped: {summary.skipped.map((s) => `${s.student_number} (${s.status ?? s.error})`).join(', ')}.</>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="chips" role="group" aria-label="Filter">
          {(['waiting', 'recorded', 'all'] as const).map((f) => (
            <button key={f} type="button" className={`chip ${filter === f ? 'active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'waiting' ? `Waiting (${waiting.length})` : f === 'recorded' ? 'Recorded' : 'All'}
            </button>
          ))}
        </div>
        {rows && shown.length === 0 && <p className="muted">Nobody here. Applicants appear after they pass the step 1 screening gates.</p>}
        {shown.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr><th>Applicant</th><th>Student no.</th><th>Year</th><th className="num">GWA</th><th>Result</th><th>Record</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/staff/applicants/${r.id}`}>{r.applicants?.profiles?.full_name ?? '—'}</Link></td>
                    <td>{r.applicants?.profiles?.student_number ?? '—'}</td>
                    <td>{r.applicants?.year_level ? `Incoming ${r.applicants.year_level === 1 ? '1st' : '2nd'}` : '—'}</td>
                    <td className="num">{r.gwa_converted ?? '—'}</td>
                    <td>
                      {r.exam_result ? RESULT_TEXT[r.exam_result] : <span className="muted">not yet</span>}
                      {r.stage === 2 && r.status !== 'draft' && <span className="muted small"> · step 2 submitted</span>}
                    </td>
                    <td>
                      {editable(r) ? (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(['passed', 'failed', 'absent'] as const).map((res) => (
                            <button key={res} type="button" className={res === 'passed' ? 'btn' : 'btn btn-plain'}
                              disabled={busy === r.id || r.exam_result === res} onClick={() => record(r, res)}>
                              {RESULT_TEXT[res]}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="muted small">locked after step 2</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
