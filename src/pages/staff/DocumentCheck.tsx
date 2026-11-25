import { Fragment, useEffect, useRef, useState } from 'react'
import { SkeletonPage } from '../../components/Skeleton'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStaff } from '../../components/StaffLayout'
import { supabase } from '../../lib/supabase'
import { labelDoc } from '../../lib/staff'

interface DocRow {
  id: string
  type_code: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  sha256: string | null
  verification_status: string
  uploaded_at: string
  application_id: string
  applications: {
    id: string
    gwa_declared: number | null
    gwa_scale: string | null
    is_registered_voter: boolean | null
    applicants: {
      course: string | null
      year_level: number | null
      street: string | null
      address_line: string | null
      barangays: { name: string } | null
      schools: { name: string } | null
      profiles: { full_name: string; student_number: string | null } | null
    } | null
  } | null
}
interface Check { id: number; reviewer_decision: string | null; reviewer_note: string | null; reviewed_at: string | null; outcome: string; risk_score: number | null; reasons: string[]; layers: { forensics?: { tamper_prob: number | null; threshold: number | null } } | null }
interface ReadField { field: string; value: string | null; confidence: number | null; matches_form: boolean | null }

const FIELD_LABEL: Record<string, string> = {
  student_name: 'Name', name: 'Name', resident_name: 'Name', patient_name: 'Patient', school: 'School', student_number: 'Student number',
  year_level: 'Year level', course: 'Course', school_year: 'School year', gwa: 'Average', barangay: 'Barangay', issue_date: 'Issued',
  precinct: 'Precinct', document_kind: 'Kind', tin: 'TIN', taxable_year: 'Taxable year', gross_annual_income: 'Gross income (year)',
  physician: 'Physician',
}

/** Design screen 6: the document beside what it should say, and the person's decision with a reason. */
export function DocumentCheck() {
  const location = useLocation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { refreshCounts } = useStaff()
  const [doc, setDoc] = useState<DocRow | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [dupes, setDupes] = useState(0)
  const [read, setRead] = useState<ReadField[]>([])
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrMsg, setOcrMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [fieldsLoaded, setFieldsLoaded] = useState<string | null>(null)
  const autoTried = useRef<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('documents')
        .select('id,type_code,storage_path,mime_type,size_bytes,sha256,verification_status,uploaded_at,application_id,' +
          'applications(id,gwa_declared,gwa_scale,is_registered_voter,applicants(course,year_level,street,address_line,barangays(name),schools(name),profiles(full_name,student_number)))')
        .eq('id', id)
        .single()
      if (!live || !data) return
      const d = data as unknown as DocRow
      setDoc(d)
      const s = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 300)
      if (live) setUrl(s.data?.signedUrl ?? null)
      const c = await supabase.from('document_checks').select('id,reviewer_decision,reviewer_note,reviewed_at,outcome,risk_score,reasons,layers').eq('document_id', id).order('id', { ascending: false })
      if (live) setChecks((c.data as Check[]) ?? [])
      const f = await supabase.from('extracted_fields').select('field,value,confidence,matches_form').eq('document_id', id).order('id')
      if (live) { setRead((f.data as ReadField[]) ?? []); setFieldsLoaded(d.id) }
      if (d.sha256) {
        // layer 3 (reuse): the same image uploaded by a different application
        const r = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('sha256', d.sha256).neq('application_id', d.application_id)
        if (live) setDupes(r.count ?? 0)
      }
    })()
    return () => {
      live = false
    }
  }, [id, tick])

  async function runOcr() {
    if (!doc) return
    setOcrBusy(true)
    setOcrMsg(null)
    const { error } = await supabase.functions.invoke('doc-check', { body: { document_id: doc.id } })
    setOcrBusy(false)
    if (error) {
      const ctx = (error as { context?: Response }).context
      const body = ctx ? await ctx.json().catch(() => null) : null
      return setOcrMsg(body?.error ?? error.message)
    }
    refreshCounts()
    setTick((t) => t + 1)
  }

  // read the document automatically the first time it is opened (owner, Nov 25); "Read again" stays for a retry
  useEffect(() => {
    if (!doc || fieldsLoaded !== doc.id || doc.type_code === 'photo_2x2' || read.length > 0) return
    if (!['pending', 'review'].includes(doc.verification_status)) return   // only documents still waiting for a check
    if (autoTried.current === doc.id) return
    autoTried.current = doc.id
    runOcr()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, fieldsLoaded, read.length])

  async function decide(decision: 'accepted' | 'reupload' | 'rejected') {
    if (!doc) return
    if (!note.trim()) return setError('Write the reason first. It is saved to the audit log.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('review_document', { p_doc: doc.id, p_decision: decision, p_note: note.trim() })
    setBusy(false)
    if (error) return setError(error.message)
    refreshCounts()
    navigate(`/staff/applicants/${doc.application_id}`, { state: location.state })
  }

  if (!doc) return <SkeletonPage cards={1} side />
  const a = doc.applications?.applicants
  const isPdf = doc.mime_type === 'application/pdf'
  const expected: [string, string][] = [
    ['Name', a?.profiles?.full_name ?? '—'],
    ['Student number', a?.profiles?.student_number ?? '—'],
    ['School', a?.schools?.name ?? '—'],
    ['Course and year', `${a?.course ?? '—'}, year ${a?.year_level ?? '—'}`],
    ['GWA on the form', doc.applications?.gwa_declared != null ? `${doc.applications.gwa_declared} (${doc.applications.gwa_scale === 'one_to_five' ? '1.0–5.0 scale' : 'percent'})` : '—'],
    ['Address', `${a?.address_line ?? ''} ${a?.street ?? ''}, ${a?.barangays?.name ?? '—'}`.trim()],
    ['Registered voter (declared)', doc.applications?.is_registered_voter ? 'Yes' : 'No'],
  ]
  const decided = doc.verification_status === 'accepted' || doc.verification_status === 'rejected'

  return (
    <>
      <div className="page-head sticky-head">
        <div>
          <Link to={`/staff/applicants/${doc.application_id}`} state={location.state} className="back">← Back to the applicant</Link>
          <h1>{labelDoc(doc.type_code).replace(/^./, (c) => c.toUpperCase())} · {a?.profiles?.full_name}</h1>
          <p>Uploaded {new Date(doc.uploaded_at).toLocaleString('en-PH')} · {isPdf ? 'PDF' : 'photo'}, {Math.round((doc.size_bytes ?? 0) / 1024)} KB</p>
        </div>
        <span className={`pill ${decided ? (doc.verification_status === 'accepted' ? 'ok' : 'warn') : 'warn'}`}>{decided ? doc.verification_status : doc.verification_status === 'pass' ? 'OCR: all matched' : 'Needs a person'}</span>
      </div>

      <div className="split">
        <section className="main card" aria-label="Uploaded document">
          <div className="doc-image">
            {!url ? <p className="muted">Opening a short-lived link…</p> : isPdf ? (
              <a className="btn" href={url} target="_blank" rel="noreferrer">Open the PDF (link valid 5 minutes)</a>
            ) : (
              <img src={url} alt={`Uploaded ${labelDoc(doc.type_code)}`} />
            )}
          </div>
          <p className="small muted">Opened through a 5-minute signed link.</p>
        </section>

        <aside className="side">
          <section className="card" aria-labelledby="exp">
            <h2 id="exp">It should say</h2>
            <dl className="facts">{expected.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}</dl>
          </section>

          <section className="card" aria-labelledby="ocr">
            <h2 id="ocr">What OCR read</h2>
            {doc.type_code === 'photo_2x2' ? (
              <p className="muted" style={{ margin: 0 }}>Pictures are not read by OCR; check them by eye.</p>
            ) : read.length === 0 ? (
              <p className="muted" style={{ marginTop: 0 }}>{ocrBusy ? 'Reading the document automatically…' : 'Not read yet.'}</p>
            ) : (
              <table className="table ocr-table">
                <thead><tr><th>Field</th><th>Read</th><th className="num">Sure</th><th title="Matches the form" aria-label="Matches the form">✓</th></tr></thead>
                <tbody>
                  {read.map((f) => (
                    <tr key={f.field}>
                      <td>{FIELD_LABEL[f.field] ?? f.field}</td>
                      <td>{f.value ?? <span className="muted">not found</span>}</td>
                      <td className="num">{f.confidence != null ? `${Math.round(Number(f.confidence) * 100)}%` : '—'}</td>
                      <td>{f.matches_form == null ? <span className="muted">—</span> : f.matches_form ? <span className="ok-text" title="matches the form">✓</span> : <strong className="error" title="differs from the form">✗</strong>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {ocrMsg && <p className="error" role="alert">{ocrMsg}</p>}
            {doc.type_code !== 'photo_2x2' && (
              <button aria-busy={ocrBusy} className="btn btn-outline btn-block" style={{ marginTop: 12 }} disabled={ocrBusy} onClick={runOcr}>
                {ocrBusy ? 'Reading…' : read.length ? 'Read again' : 'Read with OCR'}
              </button>
            )}
            {ocrBusy && (
              <p className="small muted busy-note" role="status">Reading the document. If the reading service was asleep, this can take up to a minute.</p>
            )}
          </section>

          <section className="card" aria-labelledby="layers">
            <h2 id="layers">Automatic checks</h2>
            <p style={{ margin: 0 }}>{dupes > 0 ? <strong className="error">The same image was uploaded by {dupes} other application(s).</strong> : 'Image not reused by any other application.'}</p>
            {(() => {
              const auto = checks.find((c) => !c.reviewer_decision)
              if (!auto) return null
              return (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: 0 }}>
                    OCR check: <strong className={auto.outcome === 'pass' ? 'ok-text' : 'error'}>{auto.outcome === 'pass' ? 'everything matched' : 'needs your look'}</strong>
                  </p>
                  {auto.layers?.forensics?.tamper_prob != null && (
                    <p className="small" style={{ margin: '6px 0 0' }}>
                      Tamper risk <strong>{Number(auto.layers.forensics.tamper_prob).toFixed(2)}</strong>
                      <span className="muted"> (review from {auto.layers.forensics.threshold}; computed from the image itself: re-compression, grain, cloned parts)</span>
                    </p>
                  )}
                  {auto.reasons?.length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{auto.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                </div>
              )
            })()}
            {checks.filter((c) => c.reviewer_decision).map((c) => (
              <p key={c.id} className="small" style={{ margin: '8px 0 0' }}>Earlier review: <strong>{c.reviewer_decision}</strong> — {c.reviewer_note}</p>
            ))}
          </section>

          <section className="card decision-dock" aria-labelledby="dec">
            <h2 id="dec">Your decision</h2>
            <label className="field">Reason (required, saved to the audit log)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Readable; name, school and GWA match the form" />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              <button className="btn btn-lg btn-block" disabled={busy} onClick={() => decide('accepted')}>Accept document</button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" style={{ flex: '1 1 200px' }} disabled={busy} onClick={() => decide('reupload')}>Ask for a clearer copy</button>
                <RejectButton busy={busy} onConfirm={() => decide('rejected')} />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}

/** Destructive action: small, set apart, and needs a second click (no browser dialog). */
function RejectButton({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  return armed ? (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button className="btn btn-danger-outline" disabled={busy} onClick={onConfirm}>Yes, reject</button>
      <button className="btn-danger-link" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  ) : (
    <button className="btn-danger-link" onClick={() => setArmed(true)}>Reject…</button>
  )
}
