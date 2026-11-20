import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { matchScores, textToRows, type Cell, type MatchResult } from '../../lib/examImport'
import { download } from '../../lib/report'
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
interface ImportSummary { recorded: number; not_found: string[]; skipped: { student_number: string; error?: string }[] }
/** What the screen holds before saving: a score typed or read from the file, or "absent". */
interface Edit { score: string; absent: boolean; fromFile?: boolean }

const combined = (score: number, gwa: number | null) => Math.round((score * 0.7 + Number(gwa ?? 0) * 0.3) * 1000) / 1000
const name = (r: Row) => r.applicants?.profiles?.full_name ?? '—'
const sn = (r: Row) => r.applicants?.profiles?.student_number ?? ''

/**
 * Qualifying exam (client flow v3, screen v2 2026-11-18). Every applicant cleared for the exam is listed with a
 * score box. Staff type scores (or tick Absent), or upload RTU's list (Excel or CSV) and the scores are filled in by
 * student number; one Save records them all. Combined result = 70% exam + 30% GWA. When every score is in, the
 * cut-off is automatic after the exam results date: the top N proceed to step 2 and are emailed their Applicant ID.
 */
export function ExamResults() {
  const { cycle } = useStaff()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [fileResult, setFileResult] = useState<(MatchResult & { file: string }) | null>(null)
  const [saveSummary, setSaveSummary] = useState<ImportSummary | null>(null)
  const [paste, setPaste] = useState('')
  const cycleId = cycle?.id

  const load = useCallback(async () => {
    if (cycleId == null) return
    const { data, error } = await supabase
      .from('applications')
      .select('id,status,stage,exam_result,exam_score,combined_score,academic_rank,applicant_no,gwa_converted,step1_submitted_at,applicants(course,profiles(full_name,student_number))')
      .eq('cycle_id', cycleId)
      .or('status.in.(exam_eligible,exam_failed),exam_result.not.is.null')
    if (error) setError(error.message)
    else setRows(((data as unknown as Row[]) ?? []).sort((a, b) => name(a).localeCompare(name(b))))
  }, [cycleId])

  useEffect(() => {
    setEdits({})
    setFileResult(null)
    setSaveSummary(null)
    load()
  }, [load])

  const all = useMemo(() => rows ?? [], [rows])
  const finalized = !!cycle?.exam_finalized_at
  const take = cycle?.step2_slots ?? cycle?.slots ?? 0
  // the exam takers: cleared for the exam, plus anyone already marked absent (can still be corrected)
  const takers = all.filter((r) => r.status === 'exam_eligible' || r.exam_result === 'absent' || (finalized && r.exam_result))
  const isAbsent = (r: Row) => r.exam_result === 'absent'
  const changed = Object.entries(edits).filter(([id, e]) => {
    const r = all.find((x) => x.id === id)
    if (!r) return false
    if (e.absent) return !isAbsent(r)
    return e.score !== '' && (isAbsent(r) || Number(e.score) !== Number(r.exam_score))
  })
  const badEdits = changed.filter(([, e]) => !e.absent && !(Number(e.score) >= 0 && Number(e.score) <= 100))
  const noScore = takers.filter((r) => r.status === 'exam_eligible' && r.exam_score == null)
  const shown = takers.filter((r) => !search.trim() || `${name(r)} ${sn(r)}`.toLowerCase().includes(search.trim().toLowerCase()))

  // live ranking: same order as the database (combined, exam score, GWA, earlier step 1)
  const ranked = useMemo(() => {
    const pool = all.filter((r) => (finalized ? r.academic_rank != null : r.status === 'exam_eligible' && r.exam_score != null))
    return [...pool].sort((a, b) => finalized
      ? a.academic_rank! - b.academic_rank!
      : Number(b.combined_score) - Number(a.combined_score) || Number(b.exam_score) - Number(a.exam_score)
        || Number(b.gwa_converted) - Number(a.gwa_converted) || String(a.step1_submitted_at).localeCompare(String(b.step1_submitted_at)))
  }, [all, finalized])

  const setEdit = (id: string, e: Partial<Edit>) =>
    setEdits((cur) => ({ ...cur, [id]: { score: cur[id]?.score ?? '', absent: cur[id]?.absent ?? false, ...e, fromFile: false } }))

  /** Put the file's scores into the list (nothing is saved yet). */
  function applyMatches(rowsIn: Cell[][], file: string) {
    const res = matchScores(rowsIn, takers.map((r) => ({ id: r.id, student_number: sn(r) || null })))
    setFileResult({ ...res, file })
    setEdits((cur) => {
      const next = { ...cur }
      for (const [id, e] of Object.entries(res.entries)) {
        next[id] = e.absent ? { score: '', absent: true, fromFile: true } : { score: String(e.score), absent: false, fromFile: true }
      }
      return next
    })
    setOk(null)
    setSaveSummary(null)
  }

  async function onFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    setError(null)
    setBusy('file')
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import('read-excel-file')
        applyMatches((await readXlsxFile(f)) as Cell[][], f.name)
      } else if (/\.(csv|txt|tsv)$/i.test(f.name)) {
        applyMatches(textToRows(await f.text()), f.name)
      } else {
        setError('Upload an Excel file (.xlsx) or a CSV file. For an old .xls file, open it in Excel and save it as .xlsx first.')
      }
    } catch (e) {
      setError(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function saveAll() {
    if (!cycleId || changed.length === 0) return
    if (badEdits.length > 0) return setError('Each exam score is a percentage from 0 to 100. Fix the highlighted boxes first.')
    const byId = new Map(all.map((r) => [r.id, r]))
    const payload = changed.map(([id, e]) => (e.absent
      ? { student_number: sn(byId.get(id)!), result: 'absent' as const }
      : { student_number: sn(byId.get(id)!), score: Number(e.score) }))
    setBusy('save')
    setError(null)
    setOk(null)
    const { data, error } = await supabase.rpc('import_exam_scores', { p_cycle: cycleId, p_rows: payload })
    setBusy(null)
    if (error) return setError(error.message)
    const s = data as ImportSummary
    setSaveSummary(s)
    const failed = new Set([...s.not_found, ...s.skipped.map((x) => x.student_number)])
    setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => failed.has(sn(byId.get(id)!)))))
    setFileResult(null)
    setOk(`Saved ${s.recorded} result${s.recorded === 1 ? '' : 's'}.`)
    load()
  }

  function downloadList() {
    const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = takers.map((r) => [sn(r), name(r), r.applicants?.course ?? '', isAbsent(r) ? 'absent' : r.exam_score ?? ''].map(q).join(','))
    download(`exam-takers-${cycle?.name.replace(/[^\w-]+/g, '_')}.csv`, '﻿' + ['Student number,Name,Course,Score', ...lines].join('\r\n') + '\r\n')
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
        <div className="stat"><div className="stat-value">{rows ? takers.length : '…'}</div><div className="stat-label">Exam takers</div></div>
        <div className="stat warn"><div className="stat-value">{rows ? noScore.length : '…'}</div><div className="stat-label">Waiting for a score</div></div>
        <div className="stat"><div className="stat-value">{finalized ? all.filter((r) => r.exam_result === 'passed').length : Math.min(take, ranked.length)} / {take}</div><div className="stat-label">{finalized ? 'Proceeded to step 2' : 'Would proceed now'}</div></div>
        <div className="stat"><div className="stat-value">{all.filter((r) => r.exam_result === 'absent').length}</div><div className="stat-label">Absent</div></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="success" role="status">{ok}</p>}

      {!finalized && takers.length > 0 && (
        <section className="card">
          <h2>Upload RTU's score list</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            An Excel (.xlsx) or CSV file with a <strong>student number</strong> column and a <strong>score</strong> column (0 to 100; write
            {' '}<code>absent</code> for a student who did not take the exam). Other columns and their order do not matter. The scores are filled
            into the list below by student number; check them, then press <strong>Save</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="btn file-button" aria-busy={busy === 'file'}>
              {busy === 'file' ? 'Reading…' : 'Upload Excel or CSV'}
              <input type="file" accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={onFile} disabled={busy === 'file'} />
            </label>
            <button className="btn btn-plain" onClick={downloadList}>Download the list of exam takers (CSV)</button>
          </div>
          <p className="small muted">Tip: send the downloaded list to RTU, ask them to fill in the Score column, and upload it back.</p>
          {fileResult && (
            <div className={`banner ${fileResult.notFound.length || fileResult.invalid.length ? 'warn' : 'info'}`} style={{ marginTop: 12 }} role="status">
              <strong>{fileResult.file}:</strong> {fileResult.matched} score{fileResult.matched === 1 ? '' : 's'} filled in below (not saved yet).
              {fileResult.notFound.length > 0 && <> Not exam takers of this cycle: {fileResult.notFound.slice(0, 8).join(', ')}{fileResult.notFound.length > 8 ? ` and ${fileResult.notFound.length - 8} more` : ''}.</>}
              {fileResult.invalid.length > 0 && <> Score not readable (must be 0 to 100 or absent): {fileResult.invalid.join(', ')}.</>}
              {fileResult.duplicates.length > 0 && <> Listed twice (the last one is used): {fileResult.duplicates.join(', ')}.</>}
              {fileResult.matched === 0 && fileResult.notFound.length === 0 && <> No student numbers found. The file needs a student number column and a score column.</>}
            </div>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="small">Or paste the two columns</summary>
            <label className="field">
              <span className="sr">Pasted score list</span>
              <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'2026-00123\t87.5\n2026-00456\t72\n2026-00789\tabsent'} />
            </label>
            <button className="btn btn-plain" disabled={!paste.trim()} onClick={() => { applyMatches(textToRows(paste), 'Pasted list'); setPaste('') }}>Fill in the list</button>
          </details>
        </section>
      )}

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Exam takers ({takers.length})</h2>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {takers.length > 8 && <input type="search" placeholder="Find a name or student number" aria-label="Find an exam taker" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />}
            {!finalized && (
              <button className="btn" aria-busy={busy === 'save'} disabled={busy === 'save' || changed.length === 0} onClick={saveAll}>
                {busy === 'save' ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Save'}
              </button>
            )}
          </span>
        </div>
        {saveSummary && (saveSummary.not_found.length > 0 || saveSummary.skipped.length > 0) && (
          <div className="banner warn" style={{ marginTop: 12 }} role="status">
            {saveSummary.not_found.length > 0 && <>Not found: {saveSummary.not_found.join(', ')}. </>}
            {saveSummary.skipped.length > 0 && <>Not saved: {saveSummary.skipped.map((s) => `${s.student_number} (${s.error})`).join(', ')}.</>}
          </div>
        )}
        {takers.length === 0 ? (
          <p className="muted">
            Nobody is cleared for the exam in this cycle yet. Applicants appear here after they pass the step 1 screening
            (Applicant file → Run step 1 screening gates).
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="table" style={{ minWidth: 900 }}>
              <thead>
                <tr><th>Applicant</th><th>Student no.</th><th>Course</th><th className="num">GWA</th><th>Exam score (%)</th><th>Absent</th><th className="num">Combined</th><th>Status</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const e = edits[r.id]
                  const absent = e ? e.absent : isAbsent(r)
                  const value = e && !e.absent ? e.score : absent ? '' : r.exam_score != null ? String(r.exam_score) : ''
                  const dirty = changed.some(([id]) => id === r.id)
                  const bad = badEdits.some(([id]) => id === r.id)
                  const preview = !absent && value !== '' && Number(value) >= 0 && Number(value) <= 100 ? combined(Number(value), r.gwa_converted) : null
                  return (
                    <tr key={r.id} style={dirty ? { background: 'var(--blue-tint)' } : undefined}>
                      <td><Link to={`/staff/applicants/${r.id}`} state={{ from: '/staff/exam' }}>{name(r)}</Link></td>
                      <td>{sn(r) || '—'}</td>
                      <td className="small">{r.applicants?.course ?? '—'}</td>
                      <td className="num">{r.gwa_converted ?? '—'}%</td>
                      <td>
                        {finalized ? (r.exam_score != null ? `${r.exam_score}%` : '—') : (
                          <input type="number" min={0} max={100} step={0.01} inputMode="decimal" style={{ width: 110, borderColor: bad ? 'var(--warn)' : undefined }}
                            aria-label={`Exam score of ${name(r)}`} aria-invalid={bad} disabled={absent} value={value}
                            onChange={(ev) => setEdit(r.id, { score: ev.target.value, absent: false })} />
                        )}
                      </td>
                      <td>
                        {finalized ? (isAbsent(r) ? 'Yes' : '') : (
                          <input type="checkbox" aria-label={`${name(r)} did not take the exam`} checked={absent}
                            onChange={(ev) => setEdit(r.id, { absent: ev.target.checked, score: ev.target.checked ? '' : (r.exam_score != null ? String(r.exam_score) : '') })} />
                        )}
                      </td>
                      <td className="num">{absent ? '—' : preview != null ? `${preview.toFixed(2)}%` : '—'}</td>
                      <td>
                        {finalized ? (
                          r.exam_result === 'passed' ? <span className="pill ok small">{r.applicant_no ?? 'proceeded'}</span>
                            : r.exam_result === 'absent' ? <span className="pill small">absent</span>
                            : <span className="pill warn small">did not proceed</span>
                        ) : dirty ? <span className="pill info small">{e?.fromFile ? 'from file, not saved' : 'not saved'}</span>
                          : isAbsent(r) ? <span className="pill small">absent</span>
                          : r.exam_score != null ? <span className="pill ok small">recorded</span>
                          : <span className="pill warn small">waiting</span>}
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && <tr><td colSpan={8} className="muted">No exam taker matches “{search}”.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {!finalized && changed.length > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            {changed.length} change{changed.length === 1 ? '' : 's'} not saved yet. Marking a student absent emails them right away when you save.
          </p>
        )}
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Academic and examination ranking{finalized ? ' (final)' : ' (preview)'}</h2>
        </div>
        {!finalized && (() => {
          const due = cycle.exam_results_final_at ? new Date(cycle.exam_results_final_at) : null
          const todo = changed.length > 0 ? 'Save your changes first. '
            : noScore.length > 0 ? `${noScore.length} exam taker${noScore.length === 1 ? ' has' : 's have'} no score yet: enter a score or tick Absent. `
            : ranked.length > 0 ? 'All scores are in. ' : ''
          return due ? (
            <div className="banner info" role="note">
              {todo}The cut-off is automatic: after {due.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}, once every
              exam taker has a score or is marked absent, the top {take} get an Applicant ID and proceed to step 2 (they are emailed);
              the others see that they did not proceed. Scores can be corrected until then.
              {due.getTime() < Date.now() && noScore.length === 0 && changed.length === 0 && ranked.length > 0 && ' The date has passed: the cut-off is made within the hour.'}
            </div>
          ) : (
            <div className="banner warn" role="note">
              {todo}No exam results date is set for this cycle, so the cut-off cannot happen yet. Set &ldquo;Exam results final on&rdquo; on Cycles &amp; slots:
              the top {take} then proceed to step 2 automatically after that date.
            </div>
          )
        })()}
        {ranked.length === 0 && <p className="muted">The ranking appears here as soon as scores are saved.</p>}
        {ranked.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr><th>Rank</th><th>Applicant</th><th>Course</th><th className="num">Exam (70%)</th><th className="num">GWA (30%)</th><th className="num">Combined</th>{finalized && <th>Applicant ID</th>}</tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <RankRow key={r.id} r={r} rank={finalized ? r.academic_rank! : i + 1} line={i === take - 1 && ranked.length > take} finalized={finalized} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function RankRow({ r, rank, line, finalized }: { r: Row; rank: number; line: boolean; finalized: boolean }) {
  return (
    <>
      <tr>
        <td><strong>{rank}</strong></td>
        <td><Link to={`/staff/applicants/${r.id}`} state={{ from: '/staff/exam' }}>{name(r)}</Link><div className="small muted">{sn(r)}</div></td>
        <td className="small">{r.applicants?.course ?? '—'}</td>
        <td className="num">{r.exam_score}%</td>
        <td className="num">{r.gwa_converted}%</td>
        <td className="num"><strong>{Number(r.combined_score).toFixed(2)}%</strong></td>
        {finalized && <td>{r.applicant_no ?? <span className="muted">did not proceed</span>}</td>}
      </tr>
      {line && <tr className="slot-line"><td colSpan={finalized ? 7 : 6}><div>Step 2 line. Applicants below do not proceed.</div></td></tr>}
    </>
  )
}
