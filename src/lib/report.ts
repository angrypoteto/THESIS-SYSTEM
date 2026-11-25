/** One row of public.cycle_report(cycle): an application with its ranking, decision and interview. */
export interface ReportRow {
  rank: number | null
  closeness: number | null
  recommended: boolean | null
  application_id: string
  student_number: string | null
  full_name: string
  sex: string | null
  barangay: string | null
  course: string | null
  year_level: number | null
  status: string
  exam_result: string | null
  category: string | null
  per_capita_income: number | null
  ses_index: number | null
  household_size: number | null
  gwa: number | null
  distance_km: number | null
  pay_tier_amount: number | null
  flags: { code: string; detail?: unknown }[] | null
  interview_at: string | null
  interview_status: string | null
  decided_at: string | null
  decision_override: boolean | null
  decision_reason: string | null
  submitted_at: string | null
}

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted', under_review: 'Under review', exam_eligible: 'Cleared for exam', exam_failed: 'Did not pass exam',
  eligible: 'Eligible', ineligible: 'Not eligible', ranked: 'Ranked', approved: 'Approved', waitlisted: 'Waitlisted',
  not_selected: 'Not selected', withdrawn: 'Withdrawn',
}

const cell = (v: unknown): string => {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const dt = (v: string | null) => (v ? new Date(v).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '')

/** CSV that Excel opens directly (UTF-8 BOM, CRLF). Sex is included for the fairness report, never used to rank. */
export function reportCsv(rows: ReportRow[]): string {
  const head = ['Rank', 'Closeness', 'Recommended', 'Student no.', 'Name', 'Sex', 'Barangay', 'Course', 'Year level',
    'Status', 'Exam', 'Category', 'Income per person (PHP)', 'SES index', 'Household size', 'GWA (%)',
    'Allowance (PHP)', 'Flags', 'Interview', 'Interview status', 'Decided', 'Override', 'Decision reason', 'Submitted']
  const lines = rows.map((r) => [
    r.rank, r.closeness != null ? Number(r.closeness).toFixed(4) : null, r.recommended == null ? '' : r.recommended ? 'yes' : 'no',
    r.student_number, r.full_name, r.sex, r.barangay, r.course, r.year_level, STATUS_LABEL[r.status] ?? r.status, r.exam_result,
    r.category, r.per_capita_income, r.ses_index, r.household_size, r.gwa, r.pay_tier_amount,
    (r.flags ?? []).map((f) => f.code).join(' '), dt(r.interview_at), r.interview_status, dt(r.decided_at),
    r.decision_override == null ? '' : r.decision_override ? 'yes' : 'no', r.decision_reason, dt(r.submitted_at),
  ].map(cell).join(','))
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}

/** The report as a real Excel workbook (.xlsx), downloaded directly (owner, Nov 25: "excel directly, not CSV").
 *  Numbers stay numbers and dates stay dates; the header row is bold and frozen. Sex is for the fairness report only. */
export async function downloadReportXlsx(rows: ReportRow[], fileName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  type Cell = { value: string | number | boolean | Date | null; type?: typeof String | typeof Number | typeof Date; format?: string; fontWeight?: 'bold'; wrap?: boolean } | null
  const cols: [string, number, (r: ReportRow) => Cell][] = [
    ['Rank', 7, (r) => num(r.rank)],
    ['Closeness', 10, (r) => num(r.closeness, '0.0000')],
    ['Recommended', 13, (r) => txt(r.recommended == null ? null : r.recommended ? 'yes' : 'no')],
    ['Student no.', 14, (r) => txt(r.student_number)],
    ['Name', 28, (r) => txt(r.full_name)],
    ['Sex', 8, (r) => txt(r.sex)],
    ['Barangay', 18, (r) => txt(r.barangay)],
    ['Course', 34, (r) => txt(r.course)],
    ['Year level', 10, (r) => num(r.year_level)],
    ['Status', 16, (r) => txt(STATUS_LABEL[r.status] ?? r.status)],
    ['Exam', 10, (r) => txt(r.exam_result)],
    ['Category', 14, (r) => txt(r.category)],
    ['Income per person (PHP)', 22, (r) => num(r.per_capita_income, '#,##0.00')],
    ['SES index', 10, (r) => num(r.ses_index, '0.00')],
    ['Household size', 14, (r) => num(r.household_size)],
    ['GWA (%)', 9, (r) => num(r.gwa, '0.00')],
    ['Allowance (PHP)', 16, (r) => num(r.pay_tier_amount, '#,##0')],
    ['Flags', 22, (r) => txt((r.flags ?? []).map((f) => f.code).join(' '))],
    ['Interview', 18, (r) => date(r.interview_at)],
    ['Interview status', 16, (r) => txt(r.interview_status)],
    ['Decided', 18, (r) => date(r.decided_at)],
    ['Override', 9, (r) => txt(r.decision_override == null ? null : r.decision_override ? 'yes' : 'no')],
    ['Decision reason', 40, (r) => ({ value: r.decision_reason ?? null, type: String, wrap: true })],
    ['Submitted', 18, (r) => date(r.submitted_at)],
  ]
  function txt(v: unknown): Cell { return v == null || v === '' ? null : { value: String(v), type: String } }
  function num(v: unknown, format?: string): Cell { return v == null || v === '' || Number.isNaN(Number(v)) ? null : { value: Number(v), type: Number, ...(format ? { format } : {}) } }
  function date(v: string | null): Cell { return v ? { value: new Date(v), type: Date, format: 'mmm d, yyyy h:mm AM/PM' } : null }
  const sheet = [cols.map(([h]) => ({ value: h, fontWeight: 'bold' as const })), ...rows.map((r) => cols.map(([, , f]) => f(r)))]
  await writeExcelFile(sheet as never, { columns: cols.map(([, width]) => ({ width })), sheet: 'Report', stickyRowsCount: 1 } as never).toFile(fileName)
}

export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
