import { Logo } from './Logos'

/** The five stops of the program: the redesign's signature (public page, student home, staff progress bar). */
export const STOPS = ['Apply online', 'Qualifying exam', 'Requirements', 'Interview', 'Result'] as const

/** Which stop an application is at (0-4) and whether the journey is over. */
export function journeyStop(status: string | undefined, stage: number | undefined): { at: number; finished: boolean } {
  if (!status) return { at: 0, finished: false }
  if (['approved', 'waitlisted', 'not_selected', 'withdrawn'].includes(status)) return { at: 4, finished: true }
  if (status === 'ranked') return { at: 4, finished: false }
  if (status === 'exam_eligible') return { at: 1, finished: false }
  if (status === 'exam_failed') return { at: 1, finished: true }
  if (stage === 2) return { at: status === 'eligible' ? 3 : 2, finished: false }
  return { at: 0, finished: false }
}

/** The path with "you are here". `notes` are the small lines under each stop (dates or hints). */
export function Journey({ at, finished = false, notes, compact = false }: { at: number; finished?: boolean; notes?: (string | null)[]; compact?: boolean }) {
  return (
    <ol className={`journey${compact ? ' compact' : ''}`} aria-label="Your scholarship path">
      {STOPS.map((s, i) => {
        const state = i < at || (finished && i === at) ? 'done' : i === at ? 'now' : 'later'
        return (
          <li key={s} className={`${state}${i === STOPS.length - 1 ? ' last' : ''}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
            <b>{compact ? s.split(' ').pop() : s}</b>
            {!compact && <small>{state === 'now' ? 'You are here' : notes?.[i] ?? ''}</small>}
          </li>
        )
      })}
    </ol>
  )
}

/** The city seal stamped with a green check: used only for milestones. */
export function SealStamp() {
  return (
    <div className="stamp" aria-hidden="true">
      <Logo which="mandaluyong" size={96} />
      <span className="tick">✓</span>
    </div>
  )
}
