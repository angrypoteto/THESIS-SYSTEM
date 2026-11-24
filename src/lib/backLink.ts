import { useLocation } from 'react-router-dom'

/** Where a staff page links back to: the list the applicant file was opened from (owner, Nov 21). */
const PAGES: Record<string, string> = {
  '/staff': 'Back to queue',
  '/staff/applicants': 'Back to applicants',
  '/staff/ranking': 'Back to ranking',
  '/staff/exam': 'Back to exam scores',
  '/staff/exam-rooms': 'Back to exam rooms',
  '/staff/interviews': 'Back to interviews',
  '/staff/reports': 'Back to reports',
  '/admin/duplicates': 'Back to duplicates',
}

/** The page to go back to (from the link state), with its label; the review queue when unknown. */
export function useBack(): { to: string; label: string; state: { from: string } | undefined } {
  const from = (useLocation().state as { from?: string } | null)?.from
  const to = from && PAGES[from] ? from : '/staff'
  return { to, label: PAGES[to], state: from ? { from } : undefined }
}
