import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** true right after the user opened a password-reset link */
  recovering: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    ;(async () => {
      // reset link from the password-reset function: <portal>?token_hash=...&type=recovery#/reset-password
      const q = new URLSearchParams(window.location.search)
      const tokenHash = q.get('token_hash')
      if (tokenHash && q.get('type') === 'recovery') {
        window.history.replaceState(null, '', window.location.pathname + '#/reset-password') // the token never stays in the address bar
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (!error) setRecovering(true)
      }
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
        window.location.hash = '#/reset-password'
      }
      // defer the query: supabase-js warns against awaiting inside this callback
      setTimeout(() => loadProfile(s), 0)
    })
    // remove ?code=... from the address bar after the PKCE exchange
    if (window.location.search.includes('welcome=1')) {
      window.history.replaceState(null, '', window.location.pathname + '#/welcome')
    } else if (window.location.search.includes('code=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    loading,
    recovering,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut()
      setRecovering(false)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
