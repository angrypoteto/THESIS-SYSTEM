import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { ProgramCycle } from '../lib/types'
import { BrandMark, Icon, type IconName } from './Icons'

export interface StaffContext {
  cycle: ProgramCycle | null
  cycles: ProgramCycle[]
  refreshCounts: () => void
  reloadCycles: () => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStaff(): StaffContext {
  return useOutletContext<StaffContext>()
}

const WORK: [string, string, IconName][] = [
  ['/staff', 'Review queue', 'queue'],
  ['/staff/applicants', 'Applicants', 'users'],
  ['/staff/exam', 'Qualifying exam', 'exam'],
  ['/staff/interviews', 'Interviews', 'calendar'],
  ['/staff/ranking', 'Ranking', 'ranking'],
  ['/staff/reports', 'Reports', 'reports'],
]
const ADMIN: [string, string, IconName][] = [
  ['/admin/criteria', 'Criteria & weights', 'sliders'],
  ['/admin/cycles', 'Cycles & slots', 'cycle'],
  ['/admin/users', 'Users & roles', 'key'],
  ['/admin/duplicates', 'Duplicates', 'copy'],
  ['/admin/models', 'Models', 'chip'],
  ['/admin/audit', 'Audit log', 'shield'],
]

/**
 * Staff/admin shell: full-height left sidebar (Fitts: the screen edge is easy to hit; Hick: evaluators
 * see only the Work group, admins also see Administration). Stacks above the content on a phone.
 */
export function StaffLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [cycles, setCycles] = useState<ProgramCycle[]>([])
  const [cycleId, setCycleId] = useState<number | null>(null)
  const [queueCount, setQueueCount] = useState<number | null>(null)
  const [dupCount, setDupCount] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [cyclesTick, setCyclesTick] = useState(0)

  useEffect(() => {
    supabase
      .from('program_cycles')
      .select('*')
      .order('opens_at', { ascending: false })
      .then(({ data }) => {
        const list = (data as ProgramCycle[]) ?? []
        setCycles(list)
        setCycleId((cur) => cur ?? list[0]?.id ?? null)
      })
  }, [cyclesTick])

  useEffect(() => {
    if (cycleId == null) return
    let live = true
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('cycle_id', cycleId)
      .eq('status', 'submitted')
      .then(({ count }) => live && setQueueCount(count ?? 0))
    return () => {
      live = false
    }
  }, [cycleId, tick])

  // open duplicate-account cases, shown as a badge next to Duplicates
  useEffect(() => {
    let live = true
    supabase.from('duplicate_cases').select('id', { count: 'exact', head: true }).eq('status', 'open')
      .then(({ count }) => live && setDupCount(count ?? 0))
    return () => {
      live = false
    }
  }, [tick])

  const cycle = cycles.find((c) => c.id === cycleId) ?? null
  const isAdmin = profile?.role === 'admin'
  const ctx: StaffContext = { cycle, cycles, refreshCounts: () => setTick((t) => t + 1), reloadCycles: () => setCyclesTick((t) => t + 1) }

  const link = ([to, label, icon]: [string, string, IconName]) => (
    <NavLink key={to} to={to} end={to === '/staff'} className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}>
      <Icon name={icon} />
      <span>{label}</span>
      {to === '/staff' && queueCount ? <span className="side-badge">{queueCount}</span> : null}
      {to === '/admin/duplicates' && dupCount ? <span className="side-badge">{dupCount}</span> : null}
    </NavLink>
  )

  return (
    <div className="staff-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <BrandMark />
          <span className="brand-text">
            <strong>{isAdmin ? 'Office Admin' : 'Office Staff'}</strong>
            <span>Scholarship Portal</span>
          </span>
        </NavLink>
        <label className="side-label">
          Program cycle
          <select value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value))}>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status}
              </option>
            ))}
          </select>
        </label>
        <nav className="side-nav" aria-label={isAdmin ? 'Admin' : 'Staff'}>
          <span className="side-group">Work</span>
          {WORK.map(link)}
          {isAdmin && (
            <>
              <span className="side-group">Administration</span>
              {ADMIN.map(link)}
            </>
          )}
        </nav>
        <div className="side-user">
          <span>
            {profile?.full_name}
            <small>{isAdmin ? 'Administrator' : 'Evaluator'}</small>
          </span>
          <button
            type="button"
            className="side-signout"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="staff-main">
        <Outlet context={ctx} />
      </main>
    </div>
  )
}
