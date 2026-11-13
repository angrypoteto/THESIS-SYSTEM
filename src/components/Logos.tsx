import { useState } from 'react'

/**
 * Official logos. Put the files the office provides in web/public/logos/ :
 *   mandaluyong-seal.png  (City of Mandaluyong seal)
 *   rtu-logo.png          (Rizal Technological University logo)
 * Until a file is there, a lettered badge in the same place keeps the layout intact.
 * Use only official artwork supplied or approved by the office / RTU.
 */
export const LOGOS = {
  mandaluyong: { file: 'logos/mandaluyong-seal.png', alt: 'Seal of the City of Mandaluyong', initials: 'MC', tone: 'city' },
  rtu: { file: 'logos/rtu-logo.png', alt: 'Rizal Technological University logo', initials: 'RTU', tone: 'rtu' },
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

/** "City of Mandaluyong × RTU" lock-up: shows the two institutions behind the program side by side. */
export function PartnerLockup({ size = 64, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <div className={`partner-lockup ${onDark ? 'on-dark' : ''}`}>
      <div className="partner">
        <Logo which="mandaluyong" size={size} />
        <span><b>City of Mandaluyong</b><small>Educational Service Office</small></span>
      </div>
      <div className="partner">
        <Logo which="rtu" size={size} />
        <span><b>Rizal Technological University</b><small>Boni Avenue, Mandaluyong</small></span>
      </div>
    </div>
  )
}
