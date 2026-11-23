import { Link } from 'react-router-dom'
import type { ProgramCycle } from '../lib/types'

const STAGES = ['Step 1', 'Exam', 'Step 2', 'Interviews', 'Selection'] as const
type Stage = (typeof STAGES)[number]

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Where the cycle is, and the next thing that happens (most steps are automatic). */
export function cycleStage(c: ProgramCycle, now = Date.now()): { stage: Stage; done: boolean; next: React.ReactNode } {
  if (c.selection_finalized_at) {
    return { stage: 'Selection', done: true, next: <>Selection final since <b>{when(c.selection_finalized_at)}</b></> }
  }
  if (c.exam_finalized_at) {
    if (c.step2_closes_at && Date.parse(c.step2_closes_at) <= now) {
      return { stage: 'Interviews', done: false, next: <>Next: <b>final selection</b>, automatic once every interview is settled</> }
    }
    return {
      stage: 'Step 2', done: false,
      next: c.step2_closes_at ? <>Step 2 closes <b>{when(c.step2_closes_at)}</b></>
        : <>No step 2 deadline yet · <Link to="/admin/cycles">set it</Link></>,
    }
  }
  if (Date.parse(c.closes_at) <= now) {
    if (c.exam_at && Date.parse(c.exam_at) > now) return { stage: 'Exam', done: false, next: <>Exam on <b>{when(c.exam_at)}</b></> }
    return {
      stage: 'Exam', done: false,
      next: c.exam_results_final_at ? <>Next: <b>cut-off {when(c.exam_results_final_at)}</b> (automatic)</>
        : <>No exam results date yet · <Link to="/admin/cycles">set it</Link></>,
    }
  }
  if (Date.parse(c.opens_at) > now) return { stage: 'Step 1', done: false, next: <>Opens <b>{when(c.opens_at)}</b></> }
  return { stage: 'Step 1', done: false, next: <>Step 1 closes <b>{when(c.closes_at)}</b></> }
}

/** Glass bar at the top of every staff page; stays in view while scrolling (owner, Nov 21). */
export function CycleProgress({ cycle }: { cycle: ProgramCycle }) {
  const { stage, done, next } = cycleStage(cycle)
  const at = STAGES.indexOf(stage)
  return (
    <nav className="cycle-progress" aria-label="Cycle progress">
      <ol>
        {STAGES.map((s, i) => {
          const state = i < at || (done && i === at) ? 'done' : i === at ? 'now' : 'later'
          return (
            <li key={s} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              {state === 'done' && <span aria-hidden="true">✓ </span>}{s}
            </li>
          )
        })}
      </ol>
      <span className="cp-next">{next}</span>
    </nav>
  )
}
