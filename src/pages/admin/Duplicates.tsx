import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'

interface Account {
  id: string; name: string; birth_date: string | null; student_number: string | null; mobile: string | null; email: string
  status: string; created_at: string; barangay: string | null; course: string | null
  application: { id: string; status: string; stage: number; applicant_no: string | null } | null
}
interface Case {
  id: number; reasons: string[]; strength: 'medium' | 'strong'; status: 'open' | 'not_duplicate' | 'duplicate'
  note: string | null; created_at: string; resolved_at: string | null; kept: string | null; accounts: Account[]
}

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—')

/**
 * Possible duplicate applicant accounts (one person, two sign-ups). The database opens a case when two applicant
 * accounts share a name and birthday, a mobile number, or an uploaded document image. While a case is open, neither
 * account can be cleared for the exam or for the ranking. An admin decides; every decision is in the audit log.
 */
export function Duplicates() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [view, setView] = useState<'open' | 'all'>('open')
  const [cases, setCases] = useState<Case[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('duplicate_case_details', { p_status: view })
    if (error) setMsg({ ok: false, text: error.message })
    else setCases((data as Case[]) ?? [])
  }, [view])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Duplicate accounts</h1>
          <p>Accounts that may belong to the same person. Until a case is resolved, neither account can be cleared for the exam or the ranking.</p>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
      <div className="chips" role="group" aria-label="Show">
        <button type="button" className="chip" aria-pressed={view === 'open'} onClick={() => setView('open')}>Open</button>
        <button type="button" className="chip" aria-pressed={view === 'all'} onClick={() => setView('all')}>All</button>
      </div>
      {cases && cases.length === 0 && <section className="card"><p className="muted" style={{ margin: 0 }}>{view === 'open' ? 'No open cases.' : 'No cases yet.'}</p></section>}
      {(cases ?? []).map((c) => (
        <CaseCard key={c.id} c={c} isAdmin={isAdmin} onDone={(text) => { setMsg({ ok: true, text }); load() }} onError={(text) => setMsg({ ok: false, text })} />
      ))}
    </>
  )
}

function CaseCard({ c, isAdmin, onDone, onError }: { c: Case; isAdmin: boolean; onDone: (t: string) => void; onError: (t: string) => void }) {
  const [keep, setKeep] = useState<string>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // what is missing after a click: the box turns red with its message (instead of a greyed-out button)
  const [missing, setMissing] = useState<{ note?: string; keep?: string }>({})
  const [a, b] = c.accounts ?? []
  const same = (f: (x: Account) => unknown) => a && b && f(a) != null && String(f(a)).toLowerCase() === String(f(b)).toLowerCase()

  async function resolve(samePerson: boolean) {
    const m: { note?: string; keep?: string } = {}
    if (!note.trim()) m.note = 'Write a note first: why you decided (saved to the audit log).'
    if (samePerson && !keep) m.keep = 'Choose which account to keep.'
    setMissing(m)
    if (m.note || m.keep) {
      document.getElementById(m.note ? `dup-note-${c.id}` : `dup-keep-${c.id}`)?.focus()
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('resolve_duplicate', { p_case: c.id, p_same_person: samePerson, p_keep: samePerson ? keep : null, p_note: note.trim() })
    setBusy(false)
    if (error) return onError(error.message)
    onDone(samePerson ? 'Resolved: same person. The other account was withdrawn and disabled.' : 'Resolved: different people. Both accounts can continue.')
  }

  const row = (label: string, f: (x: Account) => React.ReactNode, key?: (x: Account) => unknown) => (
    <tr className={key && same(key) ? 'dup-same' : ''}>
      <th scope="row">{label}</th>
      {[a, b].map((x, i) => <td key={i}>{x ? f(x) ?? '—' : '—'}</td>)}
    </tr>
  )

  return (
    <section className="card" aria-labelledby={`case-${c.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 id={`case-${c.id}`} style={{ margin: 0 }}>Case #{c.id}</h2>
        <span>
          <span className={`pill small ${c.strength === 'strong' ? 'warn' : 'info'}`}>{c.strength === 'strong' ? 'Strong match' : 'Possible match'}</span>{' '}
          {c.status !== 'open' && <span className="pill small">{c.status === 'duplicate' ? 'Same person' : 'Different people'} · {date(c.resolved_at)}</span>}
        </span>
      </div>
      <p className="small" style={{ margin: '6px 0 12px' }}>Matched on: <strong>{c.reasons.join(', ')}</strong> · found {date(c.created_at)}</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table dup-table" style={{ minWidth: 560 }}>
          <thead><tr><th /><th>Account 1</th><th>Account 2</th></tr></thead>
          <tbody>
            {row('Name', (x) => x.name, (x) => x.name)}
            {row('Birthday', (x) => x.birth_date, (x) => x.birth_date)}
            {row('Student no.', (x) => x.student_number)}
            {row('Email', (x) => x.email)}
            {row('Mobile', (x) => x.mobile, (x) => x.mobile?.replace(/\D/g, '').slice(-10))}
            {row('Barangay · course', (x) => [x.barangay, x.course].filter(Boolean).join(' · ') || null)}
            {row('Signed up', (x) => date(x.created_at))}
            {row('Application', (x) => x.application ? <Link to={`/staff/applicants/${x.application.id}`} state={{ from: '/admin/duplicates' }}>{x.application.status.replace('_', ' ')}{x.application.applicant_no ? ` · ${x.application.applicant_no}` : ''}</Link> : 'none yet')}
            {row('Account', (x) => (c.kept === x.id ? 'kept' : x.status === 'disabled' ? 'disabled' : 'active'))}
          </tbody>
        </table>
      </div>
      {c.note && <p className="small muted" style={{ marginBottom: 0 }}>Note: {c.note}</p>}

      {c.status === 'open' && (isAdmin ? (
        <div className="dup-decide">
          <label className="field">Note (required, saved to the audit log)
            <textarea id={`dup-note-${c.id}`} rows={2} value={note} placeholder="e.g. Checked the IDs: siblings sharing a phone"
              aria-invalid={missing.note ? true : undefined} aria-describedby={missing.note ? `dup-note-err-${c.id}` : undefined}
              onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setMissing((x) => ({ ...x, note: undefined })) }} />
            {missing.note && <span id={`dup-note-err-${c.id}`} className="field-error" role="alert">{missing.note}</span>}
          </label>
          <div className="dup-actions">
            <button className="btn btn-plain" disabled={busy} onClick={() => resolve(false)}>Different people</button>
            <span className="dup-same-person">
              <select id={`dup-keep-${c.id}`} aria-label="Account to keep" value={keep}
                aria-invalid={missing.keep ? true : undefined} aria-describedby={missing.keep ? `dup-keep-err-${c.id}` : undefined}
                onChange={(e) => { setKeep(e.target.value); if (e.target.value) setMissing((x) => ({ ...x, keep: undefined })) }}>
                <option value="">Same person: keep which account?</option>
                {[a, b].filter(Boolean).map((x, i) => <option key={x.id} value={x.id}>Keep account {i + 1} ({x.email})</option>)}
              </select>
              {missing.keep && <span id={`dup-keep-err-${c.id}`} className="field-error" role="alert">{missing.keep}</span>}
              <button className="btn btn-danger-outline" disabled={busy} onClick={() => resolve(true)}>Same person: remove the other</button>
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            &ldquo;Same person&rdquo; withdraws the other account&rsquo;s application (the applicant is emailed) and disables that account so it cannot sign in.
          </p>
        </div>
      ) : <p className="small muted" style={{ marginBottom: 0 }}>An admin resolves this case.</p>)}
    </section>
  )
}
