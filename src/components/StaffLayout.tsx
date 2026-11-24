import { useEffect, useState } from 'react'
import { useReveal } from './useReveal'
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { ProgramCycle } from '../lib/types'
import { BrandMark, Icon, type IconName } from './Icons'
import { CycleProgress } from './CycleProgress'

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

// grouped by the program's steps (client, Nov 24: "a separate navigation menu for step 1")
const OVERVIEW: [string, string, IconName][] = [
  ['/staff', 'Review queue', 'queue'],
  ['/staff/applicants', 'All applicants', 'users'],
  ['/staff/reports', 'Reports', 'reports'],
]
const STEP1: [string, string, IconName][] = [
  ['/staff/applicants?step=1', 'Step 1 applications', 'file'],
  ['/staff/exam-rooms', 'Exam rooms', 'home'],
  ['/staff/exam', 'Exam scores', 'exam'],
]
const STEP2: [string, string, IconName][] = [
  ['/staff/applicants?step=2', 'Step 2 applications', 'file'],
  ['/staff/interviews', 'Interviews', 'calendar'],
  ['/staff/ranking', 'Ranking', 'ranking'],
]
const ADMIN: [string, string, IconName][] = [
  ['/admin/criteria', 'Criteria & weights', 'sliders'],
  ['/admin/cycles', 'Cycles & slots', 'cycle'],
  ['/admin/users', 'Users & roles', 'key'],
  ['/admin/duplicates', 'Duplicates', 'copy'],
  ['/admin/faqs', 'FAQs', 'help'],
  ['/admin/emails', 'Emails', 'mail'],
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
  const location = useLocation()
  const [cycles, setCycles] = useState<ProgramCycle[]>([])
  const [cycleId, setCycleId] = useState<number | null>(null)
  const [queueCount, setQueueCount] = useState<number | null>(null)
  const [dupCount, setDupCount] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [cyclesTick, setCyclesTick] = useState(0)
  useReveal()

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
    <NavLink key={to} to={to} end={to === '/staff'}
      className={({ isActive }) => {
        // links that differ only by ?step= are told apart by the query as well
        const q = to.includes('?') ? to.slice(to.indexOf('?')) : ''
        const on = isActive && (q ? location.search === q : !/step=/.test(location.search))
        return 'side-link' + (on ? ' active' : '')
      }}>
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
          <span className="side-group">Overview</span>
          {OVERVIEW.map(link)}
          <span className="side-group">Step 1 · Screening and exam</span>
          {STEP1.map(link)}
          <span className="side-group">Step 2 · Requirements</span>
          {STEP2.map(link)}
          {isAdmin && (
            <>
              <span className="side-group">Administration</span>
              {ADMIN.map(link)}
            </>
          )}
        </nav>
        <div className="side-user">
          <NavLink to="/staff/profile" className={({ isActive }) => `side-me${isActive ? ' active' : ''}`} title={`${profile?.full_name ?? ''} · My profile`}>
            <span className="side-avatar" aria-hidden="true">{(profile?.full_name ?? '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'}</span>
            <span>
              <span className="side-name">{profile?.full_name}</span>
              <small>{isAdmin ? 'Administrator' : 'Evaluator'} · My profile</small>
            </span>
          </NavLink>
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
        {cycle && <CycleProgress cycle={cycle} />}
        <Outlet context={ctx} />
      </main>
    </div>
  )
}
