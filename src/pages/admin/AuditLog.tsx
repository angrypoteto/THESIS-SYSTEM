import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface LogRow { id: number; occurred_at: string; actor_id: string | null; action: string; entity: string | null; entity_id: string | null; payload: Record<string, unknown>; ip_address: string | null; hash: string }

const GROUPS: Record<string, (a: string) => boolean> = {
  all: () => true,
  'Sign-ins': (a) => a.startsWith('auth.'),
  'Decisions and overrides': (a) => /evaluations|gate_results|application\.submit/.test(a),
  'Criteria and weights': (a) => /criteria|ahp|weight|ranking/.test(a),
  Documents: (a) => a.startsWith('documents') || a.startsWith('document_checks'),
  Settings: (a) => /app_settings|model_versions|program_cycles/.test(a),
}

/** Design screen 10. */
export function AuditLog() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [chain, setChain] = useState<{ first_broken_id: number | null; rows_checked: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const [group, setGroup] = useState('all')

  async function verify() {
    setChecking(true)
    const { data } = await supabase.rpc('verify_audit_chain')
    setChain((data as { first_broken_id: number | null; rows_checked: number }[])?.[0] ?? null)
    setChecking(false)
  }

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('system_logs').select('*').order('id', { ascending: false }).limit(200)
      const list = (data as LogRow[]) ?? []
      setRows(list)
      const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[]
      if (ids.length) {
        const p = await supabase.from('profiles').select('id,full_name').in('id', ids)
        setNames(Object.fromEntries(((p.data as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name])))
      }
    })()
    verify()
  }, [])

  const shown = useMemo(() => rows.filter((r) => GROUPS[group](r.action)), [rows, group])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every sign-in, change and decision. Each entry carries the fingerprint of the one before it, so editing an old entry breaks every fingerprint after it.</p>
        </div>
      </div>
      <div className="grid two" style={{ marginBottom: 0 }}>
        <section className={`card ${chain?.first_broken_id ? 'warn' : 'ok'}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>{chain == null ? 'Checking…' : chain.first_broken_id ? `Chain broken at entry ${chain.first_broken_id}` : 'Chain intact'}</h2>
            <p style={{ margin: 0 }}>{chain ? `${chain.rows_checked.toLocaleString()} entries checked just now` : ''}</p>
          </div>
          <button aria-busy={checking} className="btn btn-lg" disabled={checking} onClick={verify}>{checking ? 'Checking…' : 'Verify now'}</button>
        </section>
        <section className="card">
          <h2>Latest fingerprint</h2>
          <code style={{ wordBreak: 'break-all' }}>{rows[0]?.hash ?? '—'}</code>
          <p className="small muted" style={{ marginBottom: 0 }}>Export it weekly with the backup and hand it to the office head, so a rewrite of the whole log would show.</p>
        </section>
      </div>
      <label className="field" style={{ maxWidth: 320 }}>Action
        <select value={group} onChange={(e) => setGroup(e.target.value)}>{Object.keys(GROUPS).map((g) => <option key={g}>{g}</option>)}</select>
      </label>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 900, fontSize: 14 }}>
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Details</th><th>IP</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                <td>{new Date(r.occurred_at).toLocaleString('en-PH')}</td>
                <td>{r.actor_id ? names[r.actor_id] ?? 'user' : 'system'}</td>
                <td><strong>{r.action}</strong></td>
                <td className="small" style={{ maxWidth: 360 }}>{summarize(r)}</td>
                <td className="small">{r.ip_address ? r.ip_address.replace(/\.\d+\.\d+$/, '.x.x') : '—'}</td>
                <td className="mono small">{r.hash.slice(0, 4)}…{r.hash.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Nobody can edit or delete entries, not even an admin. Showing the latest 200.</p>
    </>
  )
}

function summarize(r: LogRow): string {
  const p = r.payload as { changed?: string[]; row?: Record<string, unknown>; new?: Record<string, unknown> }
  if (p.changed) return `${r.entity} changed: ${p.changed.filter((c) => c !== 'updated_at').join(', ')}`
  if (r.action === 'application.submit') return `household ${(r.payload as { household_size?: number }).household_size}`
  if (p.row) {
    const row = p.row
    return [row.decision, row.gate_code, row.override_reason, row.reviewer_note, row.label, row.code, row.status].filter(Boolean).join(' · ') || r.entity || ''
  }
  return r.entity ?? ''
}
