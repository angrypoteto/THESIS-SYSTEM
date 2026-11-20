import type React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo, PartnerLockup } from './Logos'

const COPY: Record<string, { title: string; text: string }> = {
  '/signin': {
    title: 'Welcome back',
    text: 'Sign in to continue your application, upload documents and see messages from the office.',
  },
  '/signup': {
    title: 'Start your scholarship application',
    text: 'Create your account with your RTU student number. Your application saves as you go, so you can come back anytime.',
  },
}
COPY['/check-email'] = {
  title: 'Almost there',
  text: 'Confirm your email to finish creating your account. Then complete your profile and step 1 before the deadline.',
}
const DEFAULT = { title: 'Your account', text: 'Reset your password to get back into the Scholarship Portal.' }

const STEPS = ['Step 1: RTU COR and grades', 'Qualifying exam at RTU', 'Step 2: household and requirements', 'Ranking and decision by the office']

/**
 * Stand-alone pages for sign in, sign up and password reset (no site top bar): a photo panel with the
 * Mandaluyong × RTU branding on the left, the form on the right. On a phone the panel shrinks to a header.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const copy = COPY[pathname] ?? DEFAULT
  const photo = { '--auth-bg': `url(${new URL('images/mandaluyong-city.jpg', document.baseURI).href})` } as React.CSSProperties

  return (
    <div className="auth-shell">
      <aside className="auth-panel" style={photo}>
        <Link to="/" className="auth-home-link auth-lockup-wide" aria-label="Go to the home page">
          <PartnerLockup size={52} onDark />
        </Link>
        {/* phones: one row, seal on the left, the portal's name in the middle, RTU logo on the right */}
        <Link to="/" className="auth-home-link auth-strip" aria-label="Go to the home page">
          <Logo which="mandaluyong" size={40} />
          <span className="auth-strip-name">
            <strong>Scholarship Portal</strong>
            <span>City of Mandaluyong · RTU</span>
          </span>
          <Logo which="meso" size={40} />
        </Link>
        <div className="auth-panel-copy">
          <h2>{copy.title}</h2>
          <p>{copy.text}</p>
        </div>
        <ol className="auth-steps">
          {STEPS.map((s, i) => (
            <li key={s}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>
        <p className="auth-panel-foot">Scholarship for incoming 1st and 2nd year RTU students · City of Mandaluyong</p>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
