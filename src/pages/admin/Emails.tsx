import { useEffect, useState } from 'react'
import { SkeletonLines } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'

/** Email topics, in the order an applicant meets them (public.email_topic in the database). */
const TOPICS: [string, string, string][] = [
  ['reupload', 'Clearer copy needed', 'When staff ask for a clearer photo or scan of a document.'],
  ['exam_schedule', 'Qualifying exam schedule', 'When an applicant is cleared for the exam (date, time and venue).'],
  ['exam_schedule_changed', 'Exam schedule set or changed', 'When the exam date or venue is set later or changes.'],
  ['exam_passed', 'Passed the exam', 'Proceeds to step 2, with the Applicant ID.'],
  ['exam_not_passed', 'Did not pass / absent', 'Did not qualify to proceed, or did not take the exam.'],
  ['interview', 'Interview schedule', 'Scheduled, moved or cancelled.'],
  ['interview_reminder', 'Interview reminder', 'The day before the interview.'],
  ['decision_approved', 'Selected (approved)', 'Final result: selected as a scholar (also a waitlisted applicant moved up).'],
  ['decision_waitlisted', 'Waitlisted', 'Final result: on the waitlist, with the position.'],
  ['decision_not_selected', 'Not selected', 'Final result: not selected.'],
  ['withdrawn', 'Application withdrawn', 'When staff withdraw an application, or a duplicate account is removed.'],
]

/**
 * Admin: which notices are also emailed (client, 2026-11-21). Switching a topic off stops only the email; the notice
 * still appears in the applicant's portal (messages, dashboard, result page).
 */
export function Emails() {
  const [off, setOff] = useState<string[] | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'emails_off').maybeSingle().then(({ data, error }) => {
      if (error) return setMsg({ ok: false, text: error.message })
      const v = Array.isArray(data?.value) ? (data!.value as string[]) : []
      setOff(v)
      setSaved(v)
    })
  }, [])

  async function save() {
    if (!off) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'emails_off', value: off, description: 'Email topics that are not emailed (the portal notice still appears). Set on Administration > Emails.' })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setSaved(off)
    setMsg({ ok: true, text: 'Saved. New notices follow these settings.' })
  }

  const changed = off != null && [...off].sort().join() !== [...saved].sort().join()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emails</h1>
          <p>Which notices are also sent by email. A notice that is not emailed still appears in the applicant&apos;s portal.</p>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}

      <section className="card">
        <h2>Send an email for</h2>
        {!off ? <SkeletonLines lines={6} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 90 }}>Email</th><th>Notice</th><th>When</th></tr></thead>
              <tbody>
                {TOPICS.map(([k, name, when]) => {
                  const on = !off.includes(k)
                  return (
                    <tr key={k} style={on ? undefined : { color: 'var(--muted)' }}>
                      <td>
                        <label className="choice" style={{ margin: 0 }}>
                          <input type="checkbox" checked={on} aria-label={`Email: ${name}`}
                            onChange={(e) => setOff(e.target.checked ? off.filter((x) => x !== k) : [...off, k])} />
                          {on ? 'On' : 'Off'}
                        </label>
                      </td>
                      <td><strong>{name}</strong></td>
                      <td className="small">{when}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="actions">
          <button className="btn btn-lg" aria-busy={busy} disabled={busy || !changed} onClick={save}>{changed ? 'Save' : 'Saved'}</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          The office&apos;s current choice (November 2026): email the clearer-copy requests, the exam schedule, passing the exam and the
          interview schedule; the other results are shown in the portal only.
        </p>
      </section>
    </>
  )
}
