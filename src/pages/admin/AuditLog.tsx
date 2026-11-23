import { useEffect, useMemo, useState } from 'react'
import { LoadMore, useLazyCount } from '../../components/Skeleton'
import { appIdOf, describe, personIdOf, type LogRow, type Names } from '../../lib/auditText'
import { supabase } from '../../lib/supabase'

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
  const [subj, setSubj] = useState<Names>({ apps: {}, people: {}, cycles: {} })
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
      // who did it, and who or what each entry is about (applicant names, people, cycles)
      const people = [...new Set([...list.map((r) => r.actor_id), ...list.map(personIdOf)].filter(Boolean))] as string[]
      const apps = [...new Set(list.map(appIdOf).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/.test(x)))]
      const cycles = [...new Set(list.filter((r) => r.entity === 'program_cycles' && r.entity_id).map((r) => r.entity_id!))]
      const [p, a, c] = await Promise.all([
        people.length ? supabase.from('profiles').select('id,full_name').in('id', people) : Promise.resolve({ data: [] }),
        apps.length ? supabase.from('applications').select('id,applicants(profiles(full_name))').in('id', apps) : Promise.resolve({ data: [] }),
        cycles.length ? supabase.from('program_cycles').select('id,name').in('id', cycles.filter((x) => /^\d+$/.test(x)).map(Number)) : Promise.resolve({ data: [] }),
      ])
      const pn = Object.fromEntries(((p.data as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name]))
      setNames(pn)
      setSubj({
        people: pn,
        apps: Object.fromEntries(((a.data as unknown as { id: string; applicants: { profiles: { full_name: string } | null } | null }[]) ?? [])
          .map((x) => [x.id, x.applicants?.profiles?.full_name ?? 'an applicant'])),
        cycles: Object.fromEntries(((c.data as { id: number; name: string }[]) ?? []).map((x) => [String(x.id), x.name])),
      })
    })()
    verify()
  }, [])

  const shown = useMemo(() => rows.filter((r) => GROUPS[group](r.action)), [rows, group])

  const lazy = useLazyCount(shown.length, 40)
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
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>What happened</th><th>IP</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {shown.slice(0, lazy.count).map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                <td>{new Date(r.occurred_at).toLocaleString('en-PH')}</td>
                <td>{r.actor_id ? names[r.actor_id] ?? 'user' : 'system'}</td>
                <td className="small"><code>{r.action}</code></td>
                <td style={{ maxWidth: 460 }}>{(() => {
                  const d = describe(r, subj)
                  return <><div style={{ fontWeight: 600 }}>{d.text}</div>{d.sub && <div className="small muted" style={{ whiteSpace: 'normal' }}>{d.sub}</div>}</>
                })()}</td>
                <td className="small">{r.ip_address ? r.ip_address.replace(/\.\d+\.\d+$/, '.x.x') : '—'}</td>
                <td className="mono small">{r.hash.slice(0, 4)}…{r.hash.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
          <LoadMore sentinel={lazy.sentinel} more={lazy.more} shown={lazy.count} total={shown.length} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>Nobody can edit or delete entries, not even an admin. Showing the latest 200.</p>
    </>
  )
}
