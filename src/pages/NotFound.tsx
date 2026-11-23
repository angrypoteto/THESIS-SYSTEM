import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logos'

/** Friendly "page not found" with a way back (redesign, Nov 24). */
export function NotFound() {
  const { session, profile } = useAuth()
  const staff = profile?.role === 'evaluator' || profile?.role === 'admin'
  return (
    <section className="card narrow moment">
      <Logo which="mandaluyong" size={84} />
      <h1>We can't find that page</h1>
      <p>The link may be old or mistyped. Your application is safe; pick where to go next.</p>
      <div className="actions" style={{ justifyContent: 'center', marginTop: 0 }}>
        {session ? <Link className="btn btn-lg" to={staff ? '/staff' : '/app'}>{staff ? 'Go to the staff workspace' : 'Go to my home screen'}</Link>
          : <Link className="btn btn-lg" to="/">Go to the home page</Link>}
        {session && <Link className="btn btn-lg btn-plain" to="/">Home page</Link>}
      </div>
    </section>
  )
}
