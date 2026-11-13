import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until web/.env.local (or the GitHub Actions secrets) provide the project address and public key. */
export const isConfigured = Boolean(url && anonKey)

// Only the public project address and the public (anon) key live in the browser.
// Row-level security in the database protects the data (Build Plan 10.5).
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'public-anon-key-missing', {
  auth: {
    flowType: 'pkce', // email links come back as ?code=..., which works with hash routing on GitHub Pages
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Where email links (confirm, reset) send the user: the site root, without the hash route. */
export function siteUrl(): string {
  return window.location.origin + window.location.pathname
}

export const CONSENT_VERSION = '2026-11-v1'
