import { useCallback, useEffect, useState } from 'react'
import { useRequired } from '../../components/useRequired'
import { supabase } from '../../lib/supabase'

interface Faq { id: number; question: string; answer: string; sort_order: number; is_published: boolean; updated_at: string }
type Draft = { id: number | null; question: string; answer: string; is_published: boolean }
const EMPTY: Draft = { id: null, question: '', answer: '', is_published: true }

/**
 * Admin: the home page's frequently asked questions (owner, 2026-11-21). Published entries appear on the home page in
 * this order; drafts stay here until published. Every change is in the audit log.
 */
export function Faqs() {
  const [faqs, setFaqs] = useState<Faq[] | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const needQ = useRequired(draft.question, 'Write the question.')
  const needA = useRequired(draft.answer, 'Write the answer.')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('faqs').select('id,question,answer,sort_order,is_published,updated_at').order('sort_order').order('id')
    if (error) setMsg({ ok: false, text: error.message })
    else setFaqs((data as Faq[]) ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true)
    setMsg(null)
    const { error } = await fn()
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: ok })
    load()
  }

  async function save() {
    const qOk = needQ.check()
    const aOk = needA.check()
    if (!qOk || !aOk) return
    const row = { question: draft.question.trim(), answer: draft.answer.trim(), is_published: draft.is_published }
    if (draft.id == null) {
      const next = Math.max(0, ...(faqs ?? []).map((f) => f.sort_order)) + 1
      await run(() => supabase.from('faqs').insert({ ...row, sort_order: next }), draft.is_published ? 'Added and published on the home page.' : 'Added as a draft.')
    } else {
      await run(() => supabase.from('faqs').update(row).eq('id', draft.id!), 'Saved.')
    }
    setDraft(EMPTY)
  }

  /** swap with the neighbour above (-1) or below (+1) */
  async function move(i: number, dir: -1 | 1) {
    const list = faqs ?? []
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b) return
    // give every row a distinct position first, so a swap always changes the order
    const pos = list.map((_, k) => k + 1)
    await run(async () => {
      for (const [k, f] of list.entries()) {
        const want = k === i ? pos[i + dir] : k === i + dir ? pos[i] : pos[k]
        if (f.sort_order !== want) {
          const { error } = await supabase.from('faqs').update({ sort_order: want }).eq('id', f.id)
          if (error) return { error }
        }
      }
      return { error: null }
    }, 'Order saved.')
  }

  const list = faqs ?? []
  const published = list.filter((f) => f.is_published).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>FAQs</h1>
          <p>Frequently asked questions on the home page. Published questions appear there in this order; drafts stay hidden. Every change is in the audit log.</p>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}

      <div className="grid two grid-top">
        <section className="card">
          <h2>Questions ({published} published{list.length > published ? `, ${list.length - published} draft${list.length - published === 1 ? '' : 's'}` : ''})</h2>
          {!faqs && <p className="muted">Loading…</p>}
          {faqs && list.length === 0 && <p className="muted">No questions yet. Add the first one on the right.</p>}
          <ol className="faq-admin">
            {list.map((f, i) => (
              <li key={f.id} className={draft.id === f.id ? 'editing' : ''}>
                <div className="faq-admin-head">
                  <strong>{f.question}</strong>
                  <span className={`pill small ${f.is_published ? 'ok' : ''}`}>{f.is_published ? 'published' : 'draft'}</span>
                </div>
                <p className="small muted" style={{ margin: '4px 0 8px', whiteSpace: 'pre-line' }}>{f.answer.length > 220 ? f.answer.slice(0, 220) + '…' : f.answer}</p>
                <div className="faq-admin-actions">
                  <button className="btn btn-plain small" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move “${f.question}” up`}>↑ Up</button>
                  <button className="btn btn-plain small" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move “${f.question}” down`}>↓ Down</button>
                  <button className="btn btn-plain small" disabled={busy} onClick={() => { setDraft({ id: f.id, question: f.question, answer: f.answer, is_published: f.is_published }); setConfirmDelete(null) }}>Edit</button>
                  <button className="btn btn-plain small" disabled={busy}
                    onClick={() => run(() => supabase.from('faqs').update({ is_published: !f.is_published }).eq('id', f.id), f.is_published ? 'Hidden from the home page.' : 'Published on the home page.')}>
                    {f.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  {confirmDelete === f.id ? (
                    <>
                      <button className="btn btn-danger-outline small" disabled={busy}
                        onClick={() => { setConfirmDelete(null); if (draft.id === f.id) setDraft(EMPTY); run(() => supabase.from('faqs').delete().eq('id', f.id), 'Deleted.') }}>Yes, delete</button>
                      <button className="btn-danger-link" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn-danger-link" disabled={busy} onClick={() => setConfirmDelete(f.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <h2>{draft.id == null ? 'Add a question' : 'Edit the question'}</h2>
          <label className="field">Question
            <input {...needQ.props} value={draft.question} maxLength={300} placeholder="e.g. Can incoming 1st year students apply?"
              onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            {needQ.error}
          </label>
          <label className="field">Answer
            <textarea {...needA.props} rows={7} value={draft.answer} maxLength={4000} placeholder="Write the answer as the office would explain it."
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            {needA.error}
            <span className="muted small">A new line in the answer starts a new line on the home page.</span>
          </label>
          <label className="choice" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={draft.is_published} onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })} />
            Show on the home page (published)
          </label>
          <div className="actions">
            <button className="btn btn-lg" aria-busy={busy} disabled={busy} onClick={save}>{draft.id == null ? 'Add question' : 'Save changes'}</button>
            {draft.id != null && <button className="btn btn-plain" onClick={() => setDraft(EMPTY)}>Cancel editing</button>}
          </div>
        </section>
      </div>
    </>
  )
}
