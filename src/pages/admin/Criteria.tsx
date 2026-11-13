import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import type { Criterion } from '../../lib/types'

const RI: Record<number, number> = { 1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49 }
const SCALE: [number, string][] = [
  [9, 'Left extremely more (9)'], [7, 'Left very strongly more (7)'], [5, 'Left strongly more (5)'], [4, 'Left more (4)'],
  [3, 'Left moderately more (3)'], [2, 'Left slightly more (2)'], [1, 'Equal (1)'], [-2, 'Right slightly more (2)'],
  [-3, 'Right moderately more (3)'], [-4, 'Right more (4)'], [-5, 'Right strongly more (5)'], [-7, 'Right very strongly more (7)'],
  [-9, 'Right extremely more (9)'],
]

interface WeightSet { id: number; label: string; cr: number | null; is_active: boolean; is_placeholder: boolean; created_at: string; criteria_weights: { criterion_code: string; weight: number }[] }

/** Same geometric-mean AHP as public.compute_ahp_weights (and ml/src/beneficiary_ml/mcdm.py). */
function ahp(codes: string[], v: Record<string, number>) {
  const n = codes.length
  const A = codes.map(() => codes.map(() => 1))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const s = v[`${codes[i]}|${codes[j]}`] ?? 1
    const a = s >= 1 ? s : 1 / -s
    A[i][j] = a
    A[j][i] = 1 / a
  }
  const gm = A.map((r) => Math.pow(r.reduce((p, x) => p * x, 1), 1 / n))
  const sum = gm.reduce((p, x) => p + x, 0)
  const w = gm.map((g) => g / sum)
  const lambda = A.map((r, i) => r.reduce((p, x, j) => p + x * w[j], 0) / w[i]).reduce((p, x) => p + x, 0) / n
  const ci = n > 1 ? (lambda - n) / (n - 1) : 0
  return { w, lambda, cr: RI[n] ? ci / RI[n] : 0 }
}

/** Design screen 9: pairwise judgments with live weights and CR (Doherty), saved as a versioned weight set. */
export function Criteria() {
  const { profile } = useAuth()
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [sets, setSets] = useState<WeightSet[]>([])
  const [v, setV] = useState<Record<string, number>>({})
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    const [c, s] = await Promise.all([
      supabase.from('criteria').select('*').eq('is_active', true).order('display_order'),
      supabase.from('criteria_weight_sets').select('id,label,cr,is_active,is_placeholder,created_at,criteria_weights(criterion_code,weight)').order('id', { ascending: false }),
    ])
    setCriteria((c.data as Criterion[]) ?? [])
    setSets((s.data as WeightSet[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const codes = useMemo(() => criteria.map((c) => c.code), [criteria])
  const name = (code: string) => `${code} ${criteria.find((c) => c.code === code)?.name ?? ''}`
  const pairs = useMemo(() => {
    const out: [string, string][] = []
    for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) out.push([codes[i], codes[j]])
    return out
  }, [codes])
  const live = useMemo(() => (codes.length > 1 ? ahp(codes, v) : null), [codes, v])
  const ok = live != null && live.cr <= 0.1
  const max = live ? Math.max(...live.w) : 1
  const active = sets.find((s) => s.is_active)

  async function save() {
    if (!profile || !live) return
    setBusy(true)
    setMsg(null)
    try {
      const ins = await supabase
        .from('criteria_weight_sets')
        .insert({ label: label.trim() || `Judgments of ${profile.full_name}, ${new Date().toLocaleDateString('en-PH')}`, criteria_codes: codes, created_by: profile.id })
        .select('id')
        .single()
      if (ins.error) throw ins.error
      const setId = (ins.data as { id: number }).id
      const rows = pairs.map(([i, j]) => {
        const s = v[`${i}|${j}`] ?? 1
        return { weight_set_id: setId, judge_id: profile.id, criterion_i: i < j ? i : j, criterion_j: i < j ? j : i, value: s >= 1 ? s : 1 / -s }
      })
      const j = await supabase.from('ahp_judgments').insert(rows)
      if (j.error) throw j.error
      const c = await supabase.rpc('compute_ahp_weights', { p_set: setId })
      if (c.error) throw c.error
      setMsg({ kind: 'ok', text: `Saved as weight set #${setId}. ${ok ? 'You can make it the active set below.' : 'CR is above 0.10, so it cannot be activated.'}` })
      await load()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as { message: string }).message })
    } finally {
      setBusy(false)
    }
  }

  async function activate(id: number) {
    setBusy(true)
    const { error } = await supabase.rpc('activate_weight_set', { p_set: id })
    setBusy(false)
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'ok', text: `Weight set #${id} is now active. New ranking runs use it.` })
    await load()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Criteria and AHP weights</h1>
          <p>Compare each pair on Saaty's 1–9 scale. Several staff members' sets can be combined later by geometric mean.</p>
        </div>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}

      <div className="split">
        <section className="main card" aria-labelledby="pairs">
          <h2 id="pairs">Which matters more for choosing scholars?</h2>
          {pairs.map(([i, j]) => {
            const s = v[`${i}|${j}`] ?? 1
            return (
              <div className="pair-row" key={i + j}>
                <span className={`l ${s > 1 ? 'strong' : 'weak'}`}>{name(i)}</span>
                <label>
                  <span className="sr">{name(i)} compared with {name(j)}</span>
                  <select value={s} onChange={(e) => setV({ ...v, [`${i}|${j}`]: Number(e.target.value) })}>
                    {SCALE.map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}
                  </select>
                </label>
                <span className={s < 0 ? 'strong' : 'weak'}>{name(j)}</span>
              </div>
            )
          })}
        </section>

        <aside className="side">
          <section className="card" aria-labelledby="w">
            <h2 id="w">Resulting weights</h2>
            {live && codes.map((c, k) => (
              <div key={c} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{name(c)}</span><strong>{live.w[k].toFixed(3)}</strong></div>
                <div style={{ height: 10, borderRadius: 5, background: 'var(--line-soft)' }}><div style={{ height: 10, borderRadius: 5, background: 'var(--blue)', width: `${Math.round((live.w[k] / max) * 100)}%` }} /></div>
              </div>
            ))}
          </section>
          <section className={`card ${ok ? 'ok' : 'warn'}`} aria-labelledby="cr">
            <h2 id="cr">Consistency</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 34, fontWeight: 800 }}>{live?.cr.toFixed(3)}</span><span>consistency ratio</span></div>
            <p style={{ margin: '6px 0' }}>{ok ? 'Consistent enough to use.' : 'Too inconsistent: some pairs contradict each other. Revise them.'}</p>
            <p className="small muted">λmax {live?.lambda.toFixed(3)} · accepted when CR ≤ 0.10</p>
            <label className="field">Name of this set<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Office head, Nov 2026" /></label>
            <button className="btn btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy || !live} onClick={save}>Save these judgments</button>
          </section>
        </aside>
      </div>

      <section className="card" aria-labelledby="sets">
        <h2 id="sets">Weight sets</h2>
        <table className="table">
          <thead><tr><th>#</th><th>Name</th>{codes.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">CR</th><th></th></tr></thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.label}{s.is_placeholder && <span className="pill small warn" style={{ marginLeft: 8 }}>placeholder</span>}</td>
                {codes.map((c) => <td key={c} className="num">{s.criteria_weights.find((w) => w.criterion_code === c)?.weight?.toFixed(3) ?? '—'}</td>)}
                <td className="num">{s.cr != null ? Number(s.cr).toFixed(3) : '—'}</td>
                <td className="num">{s.is_active ? <span className="pill small ok">active</span> : <button className="btn btn-outline" disabled={busy || s.cr == null || Number(s.cr) > 0.1} onClick={() => activate(s.id)}>Make active</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {active && <p className="small muted" style={{ marginBottom: 0 }}>Active: #{active.id} {active.label}. Each ranking run stores the set it used, so earlier runs stay reproducible.</p>}
      </section>
    </>
  )
}
