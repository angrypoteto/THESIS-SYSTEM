import { useState } from 'react'
import { ACCEPTED_TYPES, formatBytes, prepareUpload, sha256Hex } from '../../lib/files'
import { Icon } from '../../components/Icons'
import { supabase } from '../../lib/supabase'
import type { DocumentRow, DocumentType } from '../../lib/types'
import type { SectionProps } from './ApplicationPage'

const STATUS_TEXT: Record<DocumentRow['verification_status'], string> = {
  pending: 'Uploaded – waiting for checking',
  pass: 'Checked – OK',
  review: 'Needs staff review',
  accepted: 'Accepted by staff',
  rejected: 'Rejected – please upload a clearer or correct copy',
}

const HINTS: Record<string, string> = {
  cor: 'Your RTU Registration Form (COR) for the current term: proof of enrollment. All corners visible; name, course, year and term readable.',
  gwa_certificate: 'Incoming 1st year: your Grade 12 report card or certified copy of grades. Incoming 2nd year: your 1st and 2nd semester grades from 1st year college (or your IER). Must show your average.',
  barangay_indigency: 'Barangay residency or indigency certificate from your Mandaluyong barangay; must still be valid.',
  voter_certificate: "Your voter's ID or COMELEC certificate: name, precinct and barangay visible.",
  voter_father: "Your father's voter's ID or COMELEC certificate. If he is deceased or absent, upload a note and staff will review.",
  voter_mother: "Your mother's voter's ID or COMELEC certificate. If she is deceased or absent, upload a note and staff will review.",
  income_proof: '2025 ITR (annual income up to PHP 250,000), or an Affidavit of Non-Filing with the BIR certification.',
  medical_certificate: 'From a government or private physician, for the household member with an illness or disability.',
  photo_2x2: 'Two 2x2 ID pictures in one photo or scan, plain background.',
  statement: 'In your own handwriting, on a separate sheet: why the office should consider you as a scholar / grantee. Take a clear photo of the whole page.',
}

export function DocumentsSection({ data, readOnly, reload }: SectionProps) {
  const anyIll = data.members.some((m) => m.has_illness)
  return (
    <section className="card">
      <h2>Documents</h2>
      <p className="muted">
        Take photos in good light with the page flat and the whole page in the frame, or upload a PDF scan. Photos are reduced
        in size on your phone before upload. Unclear documents go to a staff member; they are never rejected automatically.
      </p>
      <div className="doc-list">
        {data.docTypes.filter((t) => t.required_when !== 'member_ill' || anyIll).map((t) => (
          <DocCard
            key={t.code}
            type={t.required_when === 'member_ill' && anyIll ? { ...t, required: true } : t}
            current={data.documents.find((d) => d.type_code === t.code) ?? null}
            appId={data.app.id}
            applicantId={data.app.applicant_id}
            readOnly={readOnly}
            reload={reload}
          />
        ))}
      </div>
    </section>
  )
}

/** Quick readability check on the phone before uploading (redesign, Nov 24): too dark, too blurry or too small.
 *  Advice only: the applicant can still upload. PDFs are not checked. */
async function readability(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bmp = await createImageBitmap(file)
    if (Math.min(bmp.width, bmp.height) < 600) return 'The photo is small, so the text may be hard to read.'
    const w = 320, h = Math.round((bmp.height / bmp.width) * 320)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    const g = new Float32Array(w * h)
    let sum = 0
    for (let i = 0; i < w * h; i++) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i] }
    const mean = sum / (w * h)
    if (mean < 70) return 'The photo looks too dark.'
    // sharpness: variance of a simple Laplacian
    let lsum = 0, lsq = 0, n = 0
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]
      lsum += l; lsq += l * l; n++
    }
    const variance = lsq / n - (lsum / n) ** 2
    if (variance < 60) return 'The photo looks blurry.'
    return null
  } catch {
    return null
  }
}

export function DocCard(props: {
  type: DocumentType
  current: DocumentRow | null
  appId: string
  applicantId: string
  readOnly: boolean
  reload: () => Promise<void>
}) {
  const { type, current, appId, applicantId, readOnly, reload } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doubt, setDoubt] = useState<{ file: File; reason: string } | null>(null)
  const [readable, setReadable] = useState(false)

  async function pick(file: File) {
    setError(null)
    setReadable(false)
    const reason = await readability(file)
    if (reason) return setDoubt({ file, reason })
    setDoubt(null)
    await upload(file)
    if (file.type.startsWith('image/')) setReadable(true)
  }

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const blob = await prepareUpload(file)
      const hash = await sha256Hex(blob)
      const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg'
      // folder per applicant, then application: matches the storage policy
      const path = `${applicantId}/${appId}/${type.code}-${Date.now()}.${ext}`
      const up = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type, upsert: false })
      if (up.error) throw up.error
      const ins = await supabase
        .from('documents')
        .insert({
          application_id: appId,
          type_code: type.code,
          storage_path: path,
          sha256: hash,
          mime_type: blob.type,
          size_bytes: blob.size,
        })
        .select('id')
        .single()
      if (ins.error) throw ins.error
      if (current) {
        // keep the old row for the audit trail, but it no longer counts
        const old = await supabase.from('documents').update({ is_current: false }).eq('id', current.id)
        if (old.error) throw old.error
      }
      await reload()
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function view() {
    if (!current) return
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(current.storage_path, 60)
    if (error) return setError(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className={`doc-card ${current ? 'has-doc' : ''}`}>
      <div>
        <strong>{type.name}</strong> {type.required ? <span className="pill small">required</span> : <span className="muted small">optional</span>}
        <div className="muted small">{HINTS[type.code]}</div>
        {current && (
          <div className="small">
            <span className={`status-dot ${current.verification_status}`} /> {STATUS_TEXT[current.verification_status]} ·{' '}
            {formatBytes(current.size_bytes ?? 0)} · {new Date(current.uploaded_at).toLocaleString('en-PH')} ·{' '}
            <button className="link-button link" onClick={view}>
              View
            </button>
          </div>
        )}
        {readable && !error && <div className="small success">Looks readable. Uploaded.</div>}
        {doubt && (
          <div className="doubt" role="alert">
            <b>{doubt.reason}</b> Take it again in good light, with the whole page flat and in focus.
            <span style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-plain small" onClick={() => { const f = doubt.file; setDoubt(null); upload(f) }}>Upload this one anyway</button>
            </span>
          </div>
        )}
        {error && <div className="error small">{error}</div>}
      </div>
      {!readOnly && (
        <div className="doc-actions">
          {/* phones: opens the back camera directly */}
          <label className="button ghost small file-button mobile-only">
            <Icon name="camera" size={18} /> Take a photo
            <input type="file" accept="image/*" capture="environment" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
          </label>
          <label className={`button ${current ? 'ghost' : ''} small file-button`}>
            {busy ? 'Uploading…' : current ? 'Replace' : 'Upload a file'}
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) pick(f)
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
