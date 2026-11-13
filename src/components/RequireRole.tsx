import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { AppRole } from '../lib/types'

/**
 * Hides screens a role should not see. This is convenience only:
 * the real access control is row-level security in the database.
 */
export function RequireRole({ roles, children }: { roles?: AppRole[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted">Loading…</p>
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  if (!profile) return <p className="muted">Loading your profile…</p>
  if (profile.status === 'disabled') return <p className="error">This account is disabled. Contact the Educational Service Office.</p>
  if (roles && !roles.includes(profile.role)) return <Navigate to="/app" replace />
  return <>{children}</>
}
