import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
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

  // the preview also counts scores typed but not saved yet, so staff see the effect of a score right away
  const preview = useMemo(() => {
    if (finalized) return ranked.map((r) => ({ r, exam: Number(r.exam_score), comb: Number(r.combined_score), unsaved: false }))
    const out: { r: Row; exam: number; comb: number; unsaved: boolean }[] = []
    for (const r of all) {
      if (r.status !== 'exam_eligible' && r.exam_result !== 'absent') continue
      const e = edits[r.id]
      const absent = e ? e.absent : r.exam_result === 'absent'
      if (absent) continue
      const typed = e && e.score !== '' && Number(e.score) >= 0 && Number(e.score) <= 100 ? Number(e.score) : null
      const exam = typed ?? (r.exam_score != null ? Number(r.exam_score) : null)
      if (exam == null) continue
      out.push({ r, exam, comb: combined(exam, r.gwa_converted), unsaved: typed != null && typed !== Number(r.exam_score) })
    }
    return out.sort((a, b) => b.comb - a.comb || b.exam - a.exam || Number(b.r.gwa_converted) - Number(a.r.gwa_converted)
      || String(a.r.step1_submitted_at).localeCompare(String(b.r.step1_submitted_at)))
  }, [all, edits, finalized, ranked])
  const rankBox = useRef<HTMLDivElement>(null)
  function jumpToLine() {
    const box = rankBox.current
    const row = box?.querySelector<HTMLTableRowElement>('tr.slot-line')
    if (box && row) box.scrollTo({ top: row.offsetTop - box.clientHeight / 2, behavior: 'smooth' })
  }
  const [uploadOpen, setUploadOpen] = useState(false)

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

  const due = cycle.exam_results_final_at ? new Date(cycle.exam_results_final_at) : null
  const fmtDate = (d: Date) => d.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
  const absentCount = all.filter((r) => r.exam_result === 'absent').length
  const duePassed = due != null && due.getTime() < Date.now()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qualifying exam</h1>
          <p>
            Given on paper at RTU{cycle.exam_at ? ` on ${fmtDate(new Date(cycle.exam_at))}` : ''}
            {cycle.exam_venue ? `, ${cycle.exam_venue}` : ''}. Combined result = 70% exam score + 30% GWA.
          </p>
        </div>
        {!finalized && takers.length > 0 && (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-outline" onClick={() => setUploadOpen(true)}>Upload Excel or CSV</button>
            <button className="btn btn-plain" onClick={downloadList}>Download the list</button>
          </div>
        )}
      </div>

      <div className="status-line" role="status">
        {finalized ? (
          <>
            <span className="pill ok small">{all.filter((r) => r.exam_result === 'passed').length} proceeded to step 2</span>
            <span className="pill small">{all.filter((r) => r.exam_result === 'failed').length} did not proceed</span>
            <span className="pill small">{absentCount} absent</span>
            <span className="sep">·</span><span>The cut-off was made {fmtDate(new Date(cycle.exam_finalized_at!))}.</span>
          </>
        ) : (
          <>
            <span className={`pill small ${noScore.length ? 'warn' : 'info'}`}>{rows ? takers.length - noScore.length : '…'} of {takers.length} scored</span>
            <span className="pill small">{absentCount} absent</span>
            <span className="pill small">Top {take} proceed</span>
            <span className="sep">·</span>
            {due ? (
              <span>The cut-off is automatic on <b>{fmtDate(due)}</b>{duePassed
                ? (noScore.length ? `, once the last ${noScore.length} score${noScore.length === 1 ? ' is' : 's are'} in.` : ', within the hour.')
                : '. Scores can be corrected until then.'}</span>
            ) : (
              <span>No exam results date yet, so the cut-off cannot happen. <Link to="/admin/cycles">Set it on Cycles &amp; slots.</Link></span>
            )}
          </>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
      {saveSummary && (saveSummary.not_found.length > 0 || saveSummary.skipped.length > 0) && (
        <div className="banner warn" role="status">
          {saveSummary.not_found.length > 0 && <>Not found: {saveSummary.not_found.join(', ')}. </>}
          {saveSummary.skipped.length > 0 && <>Not saved: {saveSummary.skipped.map((x) => `${x.student_number} (${x.error})`).join(', ')}.</>}
        </div>
      )}

      {takers.length === 0 ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nobody is cleared for the exam in this cycle yet. Applicants appear here once their step 1 documents are accepted
            and they pass the step 1 rules.
          </p>
        </section>
      ) : (
        <div className="side-by-side">
          <section className="card" aria-labelledby="scores-h">
            <div className="card-head">
              <h2 id="scores-h">Scores ({takers.length})</h2>
              <input type="search" placeholder="Find a name or student number" aria-label="Find an exam taker" value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ width: 260, maxWidth: '100%' }} />
            </div>
            <div className="scroll-box">
              <table className="table">
                <thead>
                  <tr><th>Applicant</th><th className="num">GWA</th><th>Score (%)</th><th>Absent</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const e = edits[r.id]
                    const absent = e ? e.absent : isAbsent(r)
                    const value = e && !e.absent ? e.score : absent ? '' : r.exam_score != null ? String(r.exam_score) : ''
                    const dirty = changed.some(([id]) => id === r.id)
                    const bad = badEdits.some(([id]) => id === r.id)
                    return (
                      <tr key={r.id} style={dirty ? { background: 'var(--blue-tint)' } : undefined}>
                        <td><Link to={`/staff/applicants/${r.id}`} state={{ from: '/staff/exam' }}>{name(r)}</Link><div className="small muted">{sn(r) || '—'}</div></td>
                        <td className="num">{r.gwa_converted ?? '—'}%</td>
                        <td>
                          {finalized ? (r.exam_score != null ? `${r.exam_score}%` : '—') : (
                            <input type="number" min={0} max={100} step={0.01} inputMode="decimal" style={{ width: 100 }}
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
                        <td>
                          {finalized ? (
                            r.exam_result === 'passed' ? <span className="pill ok small">{r.applicant_no ?? 'proceeded'}</span>
                              : r.exam_result === 'absent' ? <span className="pill small">absent</span>
                              : <span className="pill warn small">did not proceed</span>
                          ) : dirty ? <span className="pill info small">{e?.fromFile ? 'from file' : 'not saved'}</span>
                            : isAbsent(r) ? <span className="pill small">absent</span>
                            : r.exam_score != null ? <span className="pill ok small">recorded</span>
                            : <span className="pill warn small">waiting</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {shown.length === 0 && <tr><td colSpan={5} className="muted">No exam taker matches “{search}”.</td></tr>}
                </tbody>
              </table>
            </div>
            {!finalized && changed.length > 0 && (
              <div className="unsaved-bar" role="status">
                <span>{changed.length} change{changed.length === 1 ? '' : 's'} not saved yet{changed.some(([, x]) => x.absent) ? '. Students marked absent are emailed when you save.' : '.'}</span>
                <button className="btn" aria-busy={busy === 'save'} disabled={busy === 'save'} onClick={saveAll}>
                  {busy === 'save' ? 'Saving…' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="rank-h">
            <div className="card-head">
              <h2 id="rank-h">{finalized ? 'Final ranking' : 'Ranking preview'}</h2>
              {preview.length > take && take > 0 && <button type="button" className="btn btn-plain small" onClick={jumpToLine}>Jump to the line</button>}
            </div>
            {!finalized && <p className="small muted" style={{ margin: 0 }}>Updates as you type. Rows marked “not saved” use a score you have not saved yet.</p>}
            {preview.length === 0 ? <p className="muted">The ranking appears as soon as scores are entered.</p> : (
              <div className="scroll-box" ref={rankBox}>
                <table className="table">
                  <thead>
                    <tr><th className="num">#</th><th>Applicant</th><th className="num">Exam</th><th className="num">GWA</th><th className="num">Combined</th>{finalized && <th>Applicant ID</th>}</tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={p.r.id} className={`${i === take && take > 0 ? 'slot-line' : ''}${i >= take ? ' below-line' : ''}`}>
                        <td className="num"><strong>{finalized ? p.r.academic_rank : i + 1}</strong></td>
                        <td><Link to={`/staff/applicants/${p.r.id}`} state={{ from: '/staff/exam' }}>{name(p.r)}</Link>
                          {p.unsaved && <> <span className="pill info small">not saved</span></>}</td>
                        <td className="num">{p.exam.toFixed(2)}</td>
                        <td className="num">{Number(p.r.gwa_converted).toFixed(2)}</td>
                        <td className="num"><strong>{p.comb.toFixed(2)}</strong></td>
                        {finalized && <td>{p.r.applicant_no ?? <span className="muted">did not proceed</span>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {take > 0 && preview.length > take && <p className="small muted" style={{ margin: 0 }}>Blue line: the top {take} get an Applicant ID and go to step 2.</p>}
          </section>
        </div>
      )}

      {uploadOpen && (
        <>
          <div className="drawer-shade" onClick={() => setUploadOpen(false)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="upload-h">
            <div className="drawer-head">
              <h2 id="upload-h">Upload RTU's score list</h2>
              <button type="button" className="drawer-close" aria-label="Close" onClick={() => setUploadOpen(false)}>×</button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              An Excel (.xlsx) or CSV file with a <strong>student number</strong> column and a <strong>score</strong> column (0 to 100; write
              {' '}<code>absent</code> for a student who did not take the exam). Other columns do not matter. The scores are filled into the list by
              student number; nothing is saved until you press Save.
            </p>
            <label className="btn file-button" aria-busy={busy === 'file'}>
              {busy === 'file' ? 'Reading…' : 'Choose a file'}
              <input type="file" accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={onFile} disabled={busy === 'file'} />
            </label>
            {fileResult && (
              <div className={`banner ${fileResult.notFound.length || fileResult.invalid.length ? 'warn' : 'info'}`} role="status">
                <strong>{fileResult.file}:</strong> {fileResult.matched} score{fileResult.matched === 1 ? '' : 's'} filled in (not saved yet).
                {fileResult.notFound.length > 0 && <> Not exam takers of this cycle: {fileResult.notFound.slice(0, 8).join(', ')}{fileResult.notFound.length > 8 ? ` and ${fileResult.notFound.length - 8} more` : ''}.</>}
                {fileResult.invalid.length > 0 && <> Score not readable (must be 0 to 100 or absent): {fileResult.invalid.join(', ')}.</>}
                {fileResult.duplicates.length > 0 && <> Listed twice (the last one is used): {fileResult.duplicates.join(', ')}.</>}
                {fileResult.matched === 0 && fileResult.notFound.length === 0 && <> No student numbers found. The file needs a student number column and a score column.</>}
              </div>
            )}
            <details>
              <summary className="small">Or paste the two columns</summary>
              <label className="field">
                <span className="sr">Pasted score list</span>
                <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'2026-00123\t87.5\n2026-00456\t72\n2026-00789\tabsent'} />
              </label>
              <button className="btn btn-plain" onClick={() => { if (paste.trim()) { applyMatches(textToRows(paste), 'Pasted list'); setPaste('') } }}>Fill in the list</button>
            </details>
            <p className="small muted" style={{ margin: 0 }}>Tip: send RTU the downloaded list, ask them to fill in the Score column, and upload it back.</p>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setUploadOpen(false)}>{fileResult?.matched ? 'Check the scores in the list' : 'Close'}</button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
