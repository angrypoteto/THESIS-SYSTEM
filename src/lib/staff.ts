import { supabase } from './supabase'
import type { ApplicationStatus } from './types'

export interface StaffAppRow {
  id: string
  status: ApplicationStatus
  stage: 1 | 2
  exam_result: 'passed' | 'failed' | 'absent' | null
  submitted_at: string | null
  flags: { code: string; detail?: unknown }[]
  household_size: number | null
  declared_monthly_income: number | null
  gwa_converted: number | null
  applicants: {
    course: string | null
    year_level: number | null
    barangays: { name: string } | null
    schools: { name: string } | null
    profiles: { full_name: string; student_number: string | null } | null
  } | null
  documents: { id: string; type_code: string; verification_status: string; is_current: boolean }[]
  gate_results: { gate_code: string; passed: boolean }[]
}

export const STAFF_APP_SELECT =
  'id,status,stage,exam_result,submitted_at,flags,household_size,declared_monthly_income,gwa_converted,' +
  'applicants(course,year_level,barangays(name),schools(name),profiles(full_name,student_number)),' +
  'documents(id,type_code,verification_status,is_current),gate_results(gate_code,passed)'

export async function loadCycleApplications(cycleId: number): Promise<StaffAppRow[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(STAFF_APP_SELECT)
    .eq('cycle_id', cycleId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: true })
  if (error) throw error
  return (data as unknown as StaffAppRow[]) ?? []
}

export type QueueKind = 'document' | 'gates' | 'household' | 'waiting'

export interface QueueItem {
  app: StaffAppRow
  kind: QueueKind
  why: string
  link: string
}

/** step 1 runs 3 gates (enrollment, year level, grades); step 2 runs all 7 */
const gateCount = (stage: number) => (stage === 2 ? 7 : 3)

export function flagText(f: { code: string; detail?: unknown }): string {
  if (f.code === 'household_size_unusual') return `Household of ${f.detail}: confirm the roster`
  if (f.code === 'income_above_cap') return `Annual income PHP ${Number(f.detail).toLocaleString()} is above PHP 250,000: decide case by case`
  if (f.code === 'income_mismatch') return `Declared income is far below the model's estimate (PHP ${Number(f.detail).toLocaleString()} per person): consider a home visit`
  return f.code
}

/** Why an application needs a person right now (empty = nothing to do). Oldest first. */
export function queueItems(rows: StaffAppRow[]): QueueItem[] {
  const out: QueueItem[] = []
  for (const app of rows) {
    const docs = app.documents.filter((d) => d.is_current)
    const pending = docs.filter((d) => d.verification_status === 'pending' || d.verification_status === 'review')
    if (app.status === 'submitted' && pending.length) {
      out.push({ app, kind: 'document', link: `/staff/applicants/${app.id}`,
        why: `${pending.length} document${pending.length > 1 ? 's' : ''} to check (${pending.map((d) => labelDoc(d.type_code)).join(', ')})` })
      continue
    }
    if (app.status === 'submitted' && app.gate_results.length < gateCount(app.stage)) {
      out.push({ app, kind: 'gates', link: `/staff/applicants/${app.id}`,
        why: app.stage === 2 ? 'Step 2 documents checked: run the eligibility gates' : 'Step 1 documents checked: run the screening gates (exam eligibility)' })
      continue
    }
    if (app.flags?.length && ['submitted', 'eligible'].includes(app.status)) {
      out.push({ app, kind: 'household', link: `/staff/applicants/${app.id}`,
        why: app.flags.map(flagText).join('; ') })
      continue
    }
    if (app.status === 'under_review') {
      out.push({ app, kind: 'waiting', link: `/staff/applicants/${app.id}`, why: 'Waiting for the applicant to upload a clearer copy' })
    }
  }
  return out
}

export function labelDoc(code: string): string {
  return ({ cor: 'COR', gwa_certificate: 'IER / Form 138', barangay_indigency: 'barangay certificate',
    voter_certificate: 'voter certificate', voter_father: "father's voter certificate", voter_mother: "mother's voter certificate",
    income_proof: 'ITR / affidavit', medical_certificate: 'medical certificate', photo_2x2: '2x2 pictures' } as Record<string, string>)[code] ?? code
}

export function waited(iso: string | null): string {
  if (!iso) return '—'
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600000))
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`
}

export const GATE_LABEL: Record<string, string> = {
  residency: 'Mandaluyong resident',
  year_level: 'Incoming 1st or 2nd year',
  voter_registration: 'Registered voter',
  enrollment: 'Enrolled (COR)',
  grades: 'GWA at or above the cut-off',
  documents: 'Documents verified',
  no_duplicate_benefit: 'No other scholarship',
}
