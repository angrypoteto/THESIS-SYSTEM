import { useState } from 'react'
import { ACCEPTED_TYPES, formatBytes, prepareUpload, sha256Hex } from '../../lib/files'
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
        {error && <div className="error small">{error}</div>}
      </div>
      {!readOnly && (
        <label className={`button ${current ? 'ghost' : ''} small file-button`}>
          {busy ? 'Uploading…' : current ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) upload(f)
            }}
          />
        </label>
      )}
    </div>
  )
}
