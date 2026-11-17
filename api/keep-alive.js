// Keeps the free Supabase project awake: it pauses after 7 days without activity.
// Vercel runs this once a day (see "crons" in vercel.json). It makes one small public read
// (the list of ranking criteria), which counts as database activity. No personal data is read.
// Uses the same two public values as the web app: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
export default async function handler(req, res) {
  // when CRON_SECRET is set in Vercel, only Vercel's scheduler may call this
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    return res.status(500).json({ ok: false, error: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set in Vercel' })
  }
  try {
    const r = await fetch(`${url}/rest/v1/criteria?select=code&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() })
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e) })
  }
}
