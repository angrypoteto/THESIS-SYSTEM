import { useState } from 'react'

/**
 * Official logos. Put the files the office provides in web/public/logos/ :
 *   mandaluyong-seal.png  (City of Mandaluyong seal)
 *   meso-logo.png         (City of Mandaluyong Collegiate Scholarship seal, given by the office for MESO)
 * Until a file is there, a lettered badge in the same place keeps the layout intact.
 * Use only official artwork supplied or approved by the office / RTU.
 */
export const LOGOS = {
  mandaluyong: { file: 'logos/mandaluyong-seal.png', alt: 'Seal of the City of Mandaluyong', initials: 'MC', tone: 'city' },
  // the client removed every RTU logo (2026-11-21); the office's own program seal stands for MESO
  meso: { file: 'logos/meso-logo.png', alt: 'Seal of the City of Mandaluyong Collegiate Scholarship (MESO)', initials: 'MESO', tone: 'rtu' },
} as const

export function Logo({ which, size = 64 }: { which: keyof typeof LOGOS; size?: number }) {
  const l = LOGOS[which]
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={`logo-fallback ${l.tone}`} style={{ width: size, height: size, fontSize: size * (l.initials.length > 2 ? 0.26 : 0.34) }}
        role="img" aria-label={l.alt}>
        {l.initials}
      </span>
    )
  }
  return (
    <img className="logo-img" src={`${import.meta.env.BASE_URL}${l.file}`} alt={l.alt} width={size} height={size}
      onError={() => setFailed(true)} />
  )
}

/** "City of Mandaluyong × MESO" lock-up: the city and the office that runs the program, side by side. */
export function PartnerLockup({ size = 64, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <div className={`partner-lockup ${onDark ? 'on-dark' : ''}`}>
      <div className="partner">
        <Logo which="mandaluyong" size={size} />
        <span><b>City of Mandaluyong</b></span>
      </div>
      <div className="partner">
        <Logo which="meso" size={size} />
        <span><b>Mandaluyong Educational Service Office</b><small>MESO</small></span>
      </div>
    </div>
  )
}
