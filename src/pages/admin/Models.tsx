import { useCallback, useEffect, useState } from 'react'
import { SkeletonRows } from '../../components/Skeleton'
import { useStaff } from '../../components/StaffLayout'
import { download } from '../../lib/report'
import { supabase } from '../../lib/supabase'

interface ModelVersion {
  id: number; name: string; stage: 'income' | 'qualification' | 'document'; version: string; algorithm: string
  training_data: string; metrics: Record<string, unknown>; is_active: boolean; created_at: string
}
interface Summary {
  model_id: number; predictions: number; last_used: string | null; labels: number | null; agreement: number | null
  income_labels: number | null; income_mae: number | null
}

const STAGE_TEXT: Record<string, string> = { income: 'Income per person', qualification: 'Need (qualification)', document: 'Document check' }
const num = (v: unknown, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—')
const php = (v: unknown) => (typeof v === 'number' ? `PHP ${Math.round(v).toLocaleString()}` : '—')
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'not used yet')

/** The test results the training script stored, in a sentence a non-specialist can read. */
function testResult(m: ModelVersion): string {
  const x = m.metrics ?? {}
  if (m.stage === 'income') return `Average error ${php(x.MAE_php)} per person a month; rank agreement (Spearman) ${num(x.Spearman, 2)}`
  if (m.stage === 'qualification') return `ROC-AUC ${num(x.ROC_AUC, 2)}, accuracy ${typeof x.accuracy === 'number' ? Math.round(x.accuracy * 100) + '%' : '—'}, recall ${typeof x.recall === 'number' ? Math.round(x.recall * 100) + '%' : '—'}`
  return '—'
}

function csv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

/**
 * Model registry and feedback loop (Build Plan 6, ledger X11). Lists every model version with its test result, marks
 * the one the ML service is using now, compares each version with the evaluators' own judgements, and exports the
 * labels for manual retraining. Nothing retrains by itself.
 */
export function Models() {
  const { cycle } = useStaff()
  const [models, setModels] = useState<ModelVersion[] | null>(null)
  const [summary, setSummary] = useState<Record<number, Summary>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      supabase.from('model_versions').select('*').in('stage', ['income', 'qualification']).order('created_at', { ascending: false }),
      supabase.rpc('model_feedback_summary'),
    ])
    if (m.error || s.error) setMsg({ kind: 'error', text: (m.error ?? s.error)!.message })
    setModels((m.data as ModelVersion[]) ?? [])
    setSummary(Object.fromEntries(((s.data as Summary[]) ?? []).map((r) => [r.model_id, r])))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function exportLabels(all: boolean) {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('training_labels', { p_cycle: all ? null : cycle?.id ?? null })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    const rows = (data as Record<string, unknown>[]) ?? []
    if (rows.length === 0) return setMsg({ kind: 'error', text: 'No labels yet. Evaluators answer “Do you agree?” under the need estimate on each applicant file; documents that prove income also count.' })
    download(`training-labels-${all ? 'all' : `cycle-${cycle?.id}`}-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows))
    setMsg({ kind: 'ok', text: `${rows.length} labelled applications exported (no names or contact details). The export is in the audit log.` })
  }

  const labelled = Object.values(summary).reduce((t, s) => t + Number(s.labels ?? 0), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Models</h1>
          <p>The machine-learning models behind the need estimate, how they were tested, and how they agree with the evaluators.</p>
        </div>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'success' : 'error'} role="status">{msg.text}</p>}

      <section className="card">
        <h2>Versions</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          <strong>In use</strong> is the version the ML service used for its latest estimate; it changes by itself when a
          retrained model is deployed to the service. Test results come from the held-out test year of the training data.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 860 }}>
            <thead>
              <tr><th>Model</th><th>Version</th><th>Method</th><th>Test result</th><th className="num">Estimates</th><th>Agreement with evaluators</th><th>Last used</th></tr>
            </thead>
            <tbody>
              {(models ?? []).map((m) => {
                const s = summary[m.id]
                const agree = m.stage === 'qualification'
                  ? (s?.labels ? `${Math.round(Number(s.agreement) * 100)}% of ${s.labels} answers` : 'no answers yet')
                  : (s?.income_labels ? `off by ${php(Number(s.income_mae))} on average (${s.income_labels} proven incomes)` : 'no proven incomes yet')
                return (
                  <tr key={m.id}>
                    <td>{STAGE_TEXT[m.stage]}{m.is_active && <span className="pill ok small" style={{ marginLeft: 6 }}>in use</span>}</td>
                    <td><code>{m.version}</code><div className="small muted">{m.training_data}</div></td>
                    <td>{m.algorithm}</td>
                    <td className="small">{testResult(m)}</td>
                    <td className="num">{s?.predictions ?? 0}</td>
                    <td className="small">{agree}</td>
                    <td className="small">{day(s?.last_used ?? null)}</td>
                  </tr>
                )
              })}
              {models && models.length === 0 && <tr><td colSpan={7} className="muted">No models registered.</td></tr>}
              {!models && <SkeletonRows rows={3} cols={7} />}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Retraining (feedback loop)</h2>
        <p style={{ marginTop: 0 }}>
          The models were trained on synthetic applicants built from PSA survey data. Real labels come from the office:
          an evaluator&apos;s answer to <em>Do you agree?</em> under each need estimate, and incomes proven by documents.
          {labelled > 0 ? ` ${labelled} answers so far.` : ' No answers yet.'}
        </p>
        <ol className="small" style={{ paddingLeft: 20 }}>
          <li>Export the labels below (no names or contact details).</li>
          <li>Run <code>python ml/scripts/retrain_from_feedback.py labels.csv</code>. It retrains on the synthetic data plus the labels,
            compares the new and the current model on labels it did not train on, and writes a report.</li>
          <li>Only if the new model is better: deploy it to the ML service (<code>ml/service/DEPLOY.md</code>). It then shows here as <strong>in use</strong>.</li>
        </ol>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" aria-busy={busy} disabled={busy} onClick={() => exportLabels(true)}>Export labels, all cycles</button>
          {cycle && <button className="btn btn-plain" disabled={busy} onClick={() => exportLabels(false)}>Export labels, {cycle.name}</button>}
        </div>
      </section>
    </>
  )
}
