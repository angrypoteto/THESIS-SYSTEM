import type { HouseholdMember } from './types'

/** Password rule shown on sign-up and reset (Supabase also enforces its own minimum). */
export function passwordProblems(pw: string): string[] {
  const p: string[] = []
  if (pw.length < 10) p.push('at least 10 characters')
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push('upper- and lower-case letters')
  if (!/\d/.test(pw)) p.push('a number')
  return p
}

/** Same rules as public.submit_application (Build Plan 9.1), checked early for a friendlier message. */
export function rosterProblems(members: HouseholdMember[]): string[] {
  const p: string[] = []
  const selves = members.filter((m) => m.relationship === 'self')
  if (selves.length === 0) p.push('Add yourself to the roster (relationship: Self).')
  if (selves.length > 1) p.push('Only one member can be "Self".')
  if (members.some((m) => !m.full_name.trim())) p.push('Every member needs a name.')
  if (members.some((m) => m.age < 0 || m.age > 120 || !Number.isFinite(m.age))) p.push('Ages must be between 0 and 120.')
  const self = selves[0]
  if (self && members.some((m) => (m.relationship === 'father' || m.relationship === 'mother') && m.age - self.age < 15))
    p.push('A parent must be at least 15 years older than you. Check the ages.')
  return p
}
