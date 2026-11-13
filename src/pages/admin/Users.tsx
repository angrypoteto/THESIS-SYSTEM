import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'

type Role = 'applicant' | 'evaluator' | 'admin'
interface Account { id: string; email: string; full_name: string; role: Role; status: 'active' | 'disabled'; last_sign_in_at: string | null; created_at: string }

const ROLE_TEXT: Record<Role, string> = { applicant: 'Applicant', evaluator: 'Evaluator', admin: 'Administrator' }

/**
 * Staff accounts. New staff create their own account on the portal (Sign up) and confirm their email; the admin
 * then finds them here by email and gives them the evaluator or admin role. Disabling keeps the account and its
 * history but removes all staff access. Every change is written to the audit log.
 */
export function Users() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<Account[] | null>(null)
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<Account | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_accounts', { p_email: null })
    if (error) setMsg({ kind: 'error', text: error.message })
    else setStaff((data as Account[]) ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function find(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const { data, error } = await supabase.rpc('list_accounts', { p_email: email.trim() })
    if (error) return setMsg({ kind: 'error', text: error.message })
    setFound(((data as Account[]) ?? [])[0] ?? null)
  }

  async function setRole(a: Account, role: Role, status: 'active' | 'disabled') {
    setBusy(a.id)
    setMsg(null)
    const { error } = await supabase.rpc('set_account_role', { p_user: a.id, p_role: role, p_status: status })
    setBusy(null)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'ok', text: `${a.full_name || a.email}: ${ROLE_TEXT[role]}${status === 'disabled' ? ', disabled' : ''}.` })
    setFound(undefined)
    setEmail('')
    load()
  }

  const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'never')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users &amp; roles</h1>
          <p>Office staff accounts. Every change is recorded in the audit log.</p>
        </div>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}

      <section className="card">
        <h2>Add a staff member</h2>
        <ol className="small" style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>Ask them to create an account on the portal (Sign up) with their office email and confirm it.</li>
          <li>Find the account here by email and choose the role.</li>
        </ol>
        <form className="row" onSubmit={find} style={{ alignItems: 'end' }}>
          <label className="field">Email<input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setFound(undefined) }} placeholder="name@example.com" /></label>
          <div><button className="btn">Find account</button></div>
        </form>
        {found === null && <p className="error">No account with that email. Ask them to sign up first.</p>}
        {found && (
          <div className="banner info" style={{ marginTop: 12 }}>
            <strong>{found.full_name || found.email}</strong> · {found.email} · now: {ROLE_TEXT[found.role]}{found.status === 'disabled' ? ' (disabled)' : ''}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn" disabled={busy === found.id || (found.role === 'evaluator' && found.status === 'active')} onClick={() => setRole(found, 'evaluator', 'active')}>Make evaluator</button>
              <button className="btn btn-plain" disabled={busy === found.id || (found.role === 'admin' && found.status === 'active')} onClick={() => setRole(found, 'admin', 'active')}>Make administrator</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Staff</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Change</th></tr></thead>
            <tbody>
              {(staff ?? []).map((a) => {
                const self = a.id === profile?.id
                return (
                  <tr key={a.id} style={{ color: a.status === 'disabled' ? 'var(--muted)' : undefined }}>
                    <td>{a.full_name || '—'}{self && <span className="pill info small" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td>{a.email}</td>
                    <td>{ROLE_TEXT[a.role]}{a.status === 'disabled' && <span className="pill warn small" style={{ marginLeft: 6 }}>disabled</span>}</td>
                    <td>{date(a.last_sign_in_at)}</td>
                    <td>
                      {self ? <span className="muted small">another admin changes your account</span> : (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {a.status === 'active' && (
                            <button className="btn btn-plain" disabled={busy === a.id} onClick={() => setRole(a, a.role === 'admin' ? 'evaluator' : 'admin', 'active')}>
                              {a.role === 'admin' ? 'Make evaluator' : 'Make administrator'}
                            </button>
                          )}
                          {a.status === 'active'
                            ? <button className="btn btn-danger-outline" disabled={busy === a.id} onClick={() => setRole(a, a.role, 'disabled')}>Disable</button>
                            : <button className="btn btn-ok" disabled={busy === a.id} onClick={() => setRole(a, a.role, 'active')}>Enable</button>}
                          <button className="btn-danger-link" disabled={busy === a.id} onClick={() => setRole(a, 'applicant', 'active')}>Remove staff role</button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {staff && staff.length === 0 && <tr><td colSpan={5} className="muted">No staff accounts.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
