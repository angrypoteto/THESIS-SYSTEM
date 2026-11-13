import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { isConfigured, supabase } from '../lib/supabase'
import { BrandMark, Icon } from './Icons'
import { Logo } from './Logos'

/** Public + applicant shell: top bar (applicants have only 3 destinations and mostly use phones). */
export function Layout() {
  const { session, profile, signOut } = useAuth()
  const isLanding = useLocation().pathname === '/'
  const navigate = useNavigate()
  const role = profile?.role
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!profile || role !== 'applicant') return
    let live = true
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => live && setUnread(count ?? 0))
    return () => {
      live = false
    }
  }, [profile, role])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-text">
              <strong>Scholarship Portal</strong>
              <span>City Government of Mandaluyong</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Main">
            {session ? (
              <>
                <NavLink to="/app" end>Dashboard</NavLink>
                {role === 'applicant' && <NavLink to="/app/application">My application</NavLink>}
                {(role === 'evaluator' || role === 'admin') && <NavLink to="/staff">Staff workspace</NavLink>}
                <NavLink to="/profile">Profile</NavLink>
                {role === 'applicant' && (
                  <Link to="/app" aria-label={`Messages, ${unread} unread`} style={{ position: 'relative' }}>
                    <Icon name="bell" size={22} />
                    {unread > 0 && <span className="side-badge" style={{ position: 'absolute', top: 2, right: 0, minWidth: 18, padding: '0 5px' }}>{unread}</span>}
                  </Link>
                )}
                <button
                  className="link-button"
                  onClick={async () => {
                    await signOut()
                    navigate('/')
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/signin">Sign in</NavLink>
                <NavLink to="/signup" className="button small">
                  Create account
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      {!isConfigured && (
        <div className="banner warn top">
          Supabase is not configured. Copy <code>web/.env.example</code> to <code>web/.env.local</code>.
        </div>
      )}
      <main className="content">
        <Outlet />
      </main>
      {/* full footer on the landing page; other pages show only the copyright line (owner, 2026-11-09) */}
      <footer className={isLanding ? 'footer' : 'footer footer-compact'}>
        {isLanding && (
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logos">
              <Logo which="mandaluyong" size={52} />
              <Logo which="rtu" size={52} />
            </div>
            <strong>Scholarship Portal</strong>
            <p>
              The City of Mandaluyong scholarship for incoming 1st and 2nd year students of Rizal Technological University,
              run by the Mandaluyong Educational Service Office.
            </p>
          </div>
          <nav className="footer-col" aria-label="For applicants">
            <h2>For applicants</h2>
            {session ? (
              <>
                <Link to="/app">My dashboard</Link>
                {role === 'applicant' && <Link to="/app/application">My application</Link>}
                <Link to="/profile">Profile</Link>
              </>
            ) : (
              <>
                <Link to="/signup">Create an account</Link>
                <Link to="/signin">Sign in</Link>
                <Link to="/forgot-password">Forgot password</Link>
              </>
            )}
          </nav>
          <div className="footer-col">
            <h2>How it works</h2>
            <span>1. Step 1 screening: RTU COR and grades</span>
            <span>2. Qualifying exam at RTU</span>
            <span>3. Step 2 requirements</span>
            <span>4. Ranking and decision by the office</span>
          </div>
          <div className="footer-col">
            <h2>Your data</h2>
            <span>Protected under the Data Privacy Act of 2012 (RA 10173)</span>
            <span>Documents are stored privately</span>
            <span>Every staff action is logged</span>
            <Link to="/signup">Read the privacy notice</Link>
          </div>
        </div>
        )}
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span>© {new Date().getFullYear()} City of Mandaluyong · Educational Service Office</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
