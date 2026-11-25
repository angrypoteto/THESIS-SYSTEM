/** Plain-language audit entries (owner, Nov 24: "make the details more detailed on what it did"). */

export interface LogRow {
  id: number; occurred_at: string; actor_id: string | null; action: string; entity: string | null; entity_id: string | null
  payload: Record<string, unknown>; ip_address: string | null; hash: string
}
export interface Names { apps: Record<string, string>; people: Record<string, string>; cycles: Record<string, string> }

type Obj = Record<string, unknown>
const FIELD: Record<string, string> = {
  status: 'status', stage: 'step', exam_score: 'exam score', exam_result: 'exam result', combined_score: 'combined result',
  academic_rank: 'exam rank', applicant_no: 'Applicant ID', declared_monthly_income: 'declared monthly income', household_size: 'household size',
  gwa_declared: 'GWA', gwa_converted: 'GWA (%)', submitted_at: 'submitted', step1_submitted_at: 'step 1 submitted', truthfulness_signed: 'declaration',
  verification_status: 'check status', is_current: 'current copy', role: 'role', is_active: 'active', notes: 'notes', slot_start: 'time',
  location: 'place', category: 'category', income_verified: 'income verified', ses_index: 'living-conditions index', flags: 'flags',
  full_name: 'name', mobile: 'mobile', birth_date: 'birthday', is_published: 'published', question: 'question', answer: 'answer',
  slots: 'slots', step2_slots: 'step 2 slots', closes_at: 'step 1 deadline', opens_at: 'opening', exam_at: 'exam date', step2_closes_at: 'step 2 deadline',
  exam_results_final_at: 'exam results date', gwa_cutoff: 'GWA cut-off', name: 'name', value: 'value', reminder_sent_at: 'reminder sent',
  is_registered_voter: 'registered voter', other_scholarship: 'other scholarship', height_in: 'height', weight_kg: 'weight', siblings: 'siblings',
}
const SKIP = new Set(['updated_at', 'created_at', 'id', 'hash'])
const DOC: Record<string, string> = {
  cor: 'Certificate of Registration', gwa_certificate: 'grade report', barangay_indigency: 'barangay certificate', voter_certificate: 'voter certificate',
  voter_father: "father's voter certificate", voter_mother: "mother's voter certificate", income_proof: 'proof of income',
  medical_certificate: 'medical certificate', photo_2x2: '2x2 photo',
}
const GATE: Record<string, string> = {
  residency: 'Mandaluyong resident', year_level: 'year level', voter_registration: 'registered voter', enrollment: 'enrolled at RTU',
  grades: 'GWA cut-off', documents: 'documents verified', no_duplicate_benefit: 'no other scholarship',
}
const IV: Record<string, string> = { scheduled: 'scheduled', done: 'passed', no_show: 'no show', cancelled: 'cancelled', forfeited: 'did not pass' }

const words = (v: unknown) => String(v).replaceAll('_', ' ')
function val(k: string, v: unknown): string {
  if (v == null || v === '') return 'empty'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (/(_at|_date)$/.test(k) && typeof v === 'string' && /^\d{4}-/.test(v)) {
    return new Date(v).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  if (k === 'declared_monthly_income') return `PHP ${Number(v).toLocaleString()}`
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'none'
  if (typeof v === 'object') return 'updated'
  const s = words(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

/** "status: submitted → eligible, exam score: 82" (the old value only when the log has it). */
function changes(p: Obj): string {
  const changed = ((p.changed as string[]) ?? []).filter((k) => !SKIP.has(k))
  const now = (p.new as Obj) ?? {}
  const old = (p.old as Obj) ?? {}
  if (!changed.length) return 'Saved again with no changes'
  return changed.slice(0, 5).map((k) => {
    const label = FIELD[k] ?? words(k)
    return k in old ? `${label}: ${val(k, old[k])} → ${val(k, now[k])}` : `${label} set to ${val(k, now[k])}`
  }).join('; ') + (changed.length > 5 ? `; and ${changed.length - 5} more` : '')
}

/** The application an entry is about, when it has one. */
export function appIdOf(r: LogRow): string | null {
  const p = r.payload as Obj
  if (r.entity === 'applications') return r.entity_id
  const row = ((p.row ?? p.new) as Obj | undefined) ?? {}
  return (row.application_id as string) ?? null
}
export function personIdOf(r: LogRow): string | null {
  return r.entity === 'profiles' || r.entity === 'auth.users' || r.entity === 'applicants' ? r.entity_id : null
}

/** A sentence for the entry, and an optional second line (reasons, notes). */
export function describe(r: LogRow, n: Names): { text: string; sub?: string } {
  const p = r.payload as Obj
  const row = ((p.row ?? p.new) as Obj | undefined) ?? {}
  const appId = appIdOf(r)
  const who = appId ? n.apps[appId] ?? 'an applicant' : null
  const of = who ? ` of ${who}` : ''
  const forWho = who ? ` for ${who}` : ''
  const cycle = r.entity === 'program_cycles' && r.entity_id ? n.cycles[r.entity_id] ?? `cycle ${r.entity_id}` : null
  const person = personIdOf(r) ? n.people[personIdOf(r)!] ?? 'a user' : null
  const reason = (p.reason ?? row.remarks ?? row.override_reason ?? row.reviewer_note ?? row.notes) as string | undefined

  switch (r.action) {
    case 'auth.sign_in': return { text: `${person ?? 'A user'} signed in` }
    case 'application.submit': return { text: `${who ?? 'An applicant'} submitted the application`, sub: p.household_size ? `Household of ${p.household_size}` : undefined }
    case 'application.withdraw': return { text: `Withdrew the application${of}`, sub: reason }
    case 'exam.score': return { text: `Recorded the exam score${forWho}: ${p.score ?? '—'}` }
    case 'exam.result': return { text: `Recorded the exam result${forWho}: ${words(p.result ?? p.exam_result ?? '—')}` }
    case 'exam.import': return { text: `Imported exam scores for ${cycle}`, sub: Object.entries(p).map(([k, v]) => `${words(k)}: ${Array.isArray(v) ? v.length : v}`).join(' · ') }
    case 'exam.finalize': case 'exam.auto':
      return { text: `${r.action === 'exam.auto' ? 'Made the exam cut-off automatically' : 'Finalized the exam ranking'} for ${cycle}`,
        sub: `${p.proceed ?? '?'} proceed to step 2, ${p.not_proceed ?? '?'} did not (limit ${p.limit ?? '?'})` }
    case 'selection.auto': case 'selection.finalize':
      return { text: `${r.action === 'selection.auto' ? 'Made the final selection automatically' : 'Finalized the selection'} for ${cycle}`,
        sub: Object.entries(p).filter(([k]) => k !== 'step2_closed').map(([k, v]) => `${words(k)}: ${v}`).join(' · ') }
    case 'interview.schedule': return { text: `Scheduled the interview${forWho}`, sub: p.slot_start ? val('slot_start', p.slot_start) : undefined }
    case 'interview.forfeit': return { text: `Marked${of} as did not pass the interview`, sub: reason }
    case 'waitlist.promote': return { text: `Approved ${who ?? 'the next applicant'} from the waitlist`, sub: reason }
    case 'ml.feedback': return { text: `Gave a need judgement${forWho}: ${words(p.need ?? p.staff_need ?? '—')}`, sub: (p.note as string) ?? undefined }
    case 'ml.score': return { text: `Got a need estimate${forWho}`, sub: p.prob != null || p.qualification_prob != null ? `Probability of need ${Number(p.prob ?? p.qualification_prob).toFixed(2)}` : undefined }
    case 'ml.export_labels': return { text: 'Exported the staff labels for retraining' }
    case 'account.role': return { text: `Changed the role of ${person}`, sub: Object.entries(p).map(([k, v]) => `${words(k)}: ${words(v)}`).join(' · ') }
    case 'account.cleanup_unconfirmed': return { text: 'Removed an account whose email was never confirmed' }
    case 'account.removed_mistake': return { text: 'Removed an account created by mistake', sub: reason }
    case 'duplicate.flag': return { text: `Flagged a possible duplicate account (${person})`, sub: reason }
    case 'duplicate.merge': return { text: `Kept ${person} and closed the duplicate account`, sub: reason }
    case 'duplicate.not_duplicate': return { text: 'Decided two similar accounts are different people', sub: reason }
  }
  if (r.action.startsWith('interview.')) return { text: `Interview${of}: ${IV[r.action.slice(10)] ?? words(r.action.slice(10))}`, sub: reason }

  const [table, op] = r.action.split('.')
  if (op === 'update') {
    const what = table === 'applications' ? `the application${of}`
      : table === 'documents' ? `the ${DOC[row.type_code as string] ?? 'document'}${of}`
      : table === 'interviews' ? `the interview${of}`
      : table === 'gate_results' ? `the rule "${GATE[row.gate_code as string] ?? words(row.gate_code)}"${of}`
      : table === 'program_cycles' ? `the cycle ${row.name ?? cycle}`
      : table === 'profiles' ? `the profile of ${person ?? row.full_name ?? 'a user'}`
      : table === 'app_settings' ? `the setting "${words(row.key)}"`
      : table === 'faqs' ? `the FAQ "${val('q', row.question)}"`
      : words(table)
    const ch = changes(p)
    return { text: `Changed ${what}`, sub: ch }
  }
  if (op === 'insert') {
    switch (table) {
      case 'evaluations': {
        const d = words(row.decision ?? '')
        return { text: `Decision${forWho}: ${d}${row.is_override ? ' (override of the ranking)' : ''}${row.evaluator_id ? '' : ' (automatic)'}`, sub: (row.remarks as string) ?? undefined }
      }
      case 'documents': return { text: `Uploaded the ${DOC[row.type_code as string] ?? 'document'}${of}` }
      case 'document_checks': return { text: `Reviewed a document: ${words(row.reviewer_decision ?? row.outcome ?? '')}`, sub: (row.reviewer_note as string) ?? undefined }
      case 'gate_results': return { text: `Rule "${GATE[row.gate_code as string] ?? words(row.gate_code)}"${of}: ${row.passed ? 'met' : 'not met'}`, sub: (row.override_reason ?? row.reason) as string | undefined }
      case 'interviews': return { text: `Scheduled the interview${forWho}`, sub: [val('slot_start', row.slot_start), row.location].filter(Boolean).join(' · ') }
      case 'applications': return { text: `${who ?? 'An applicant'} started an application` }
      case 'ranking_runs': return { text: `Ranked ${row.applicant_count ?? '?'} applicants (${String(row.method ?? '').toUpperCase()}${row.is_official ? ', official' : ''})` }
      case 'program_cycles': return { text: `Created the cycle ${row.name ?? ''}` }
      case 'faqs': return { text: `Added the FAQ "${val('q', row.question)}"` }
      case 'ahp_judgments': return { text: 'Saved an AHP comparison of the criteria' }
      case 'criteria_weight_sets': return { text: `Saved the weight set "${row.label ?? row.name ?? ''}"` }
      case 'profiles': return { text: `Created the account of ${row.full_name ?? 'a user'}` }
      case 'model_versions': return { text: `Registered model ${row.name ?? row.version ?? ''}` }
      case 'app_settings': return { text: `Added the setting "${words(row.key)}"` }
    }
    return { text: `Added a ${words(table)} record${of}` }
  }
  if (op === 'delete') return { text: `Deleted a ${words(table)} record${of}${table === 'faqs' ? `: "${val('q', row.question)}"` : ''}` }
  return { text: words(r.action) + (of ? of : ''), sub: Object.keys(p).length ? Object.entries(p).slice(0, 4).map(([k, v]) => `${words(k)}: ${typeof v === 'object' ? '…' : v}`).join(' · ') : undefined }
}
