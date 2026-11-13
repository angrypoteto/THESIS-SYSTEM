import { useState } from 'react'
import { type CharacterRef, type Education, SHS_TRACKS, type SchoolRow } from '../../lib/office'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

const LEVELS: [keyof Education & ('elementary' | 'jhs' | 'shs'), string][] = [
  ['elementary', 'Elementary'], ['jhs', 'Junior High School'], ['shs', 'Senior High School'],
]

/**
 * Step 2, parts C and D of the office's "Scholar / Grantee Information Sheet": education (school, year
 * graduated, honors per level, SHS track, academic rating) and three references. The academic rating comes
 * from the grades given in step 1, so it is shown, not asked again.
 */
export function EducationSection({ data, readOnly, reload }: SectionProps) {
  const a = data.app
  const [edu, setEdu] = useState<Education>({
    ...a.education,
    shs: { school: data.applicant.shs_school ?? '', ...(a.education?.shs ?? {}) },
  })
  const [refs, setRefs] = useState<CharacterRef[]>(() => {
    const r = [...(a.character_refs ?? [])]
    while (r.length < 3) r.push({})
    return r.slice(0, 3)
  })
  const save = useSave()
  const setRow = (lvl: 'elementary' | 'jhs' | 'shs', patch: Partial<SchoolRow>) =>
    setEdu({ ...edu, [lvl]: { ...(edu[lvl] ?? {}), ...patch } })
  const setRef = (i: number, patch: Partial<CharacterRef>) => setRefs(refs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function onSave() {
    for (const [lvl, label] of LEVELS) {
      const y = edu[lvl]?.year
      if (y != null && (y < 1990 || y > new Date().getFullYear())) return save.fail(`${label}: year graduated looks wrong.`)
    }
    const filled = refs.filter((r) => r.name?.trim() || r.contact?.trim())
    if (filled.some((r) => !r.name?.trim() || !r.contact?.trim())) return save.fail('Each reference needs a name and a contact number.')
    await save.run(async () => {
      const { error } = await supabase.from('applications').update({
        education: edu,
        character_refs: refs.map((r) => ({ name: r.name?.trim() ?? '', address: r.address?.trim() ?? '',
          occupation: r.occupation?.trim() ?? '', contact: r.contact?.trim() ?? '' })),
      }).eq('id', a.id)
      if (error) throw error
      await reload()
    })
  }

  const college = data.applicant.year_level === 2
  const rating = college
    ? `1st year college: ${a.grade_sem1 ?? '—'} / ${a.grade_sem2 ?? '—'}, average ${a.gwa_declared ?? '—'}`
    : `Grade 12: ${a.grade_sem1 ?? '—'} / ${a.grade_sem2 ?? '—'}, average ${a.shs_gwa ?? a.gwa_declared ?? '—'}`

  return (
    <section className="card">
      <h2>Information sheet: education</h2>
      <div className="edu-grid" role="table" aria-label="Education">
        <div className="edu-head" role="row"><span>Level</span><span>School</span><span>Year graduated</span><span>Honors (if any)</span></div>
        {LEVELS.map(([lvl, label]) => (
          <div className="edu-row" role="row" key={lvl}>
            <strong>{label}</strong>
            <input aria-label={`${label} school`} value={edu[lvl]?.school ?? ''} onChange={(e) => setRow(lvl, { school: e.target.value })} disabled={readOnly} />
            <input aria-label={`${label} year graduated`} type="number" value={edu[lvl]?.year ?? ''} onChange={(e) => setRow(lvl, { year: e.target.value === '' ? null : Number(e.target.value) })} disabled={readOnly} />
            <input aria-label={`${label} honors`} value={edu[lvl]?.honors ?? ''} onChange={(e) => setRow(lvl, { honors: e.target.value })} placeholder="e.g. With Honors" disabled={readOnly} />
          </div>
        ))}
      </div>
      <div className="row">
        <label className="field">Senior high school track
          <select value={edu.track ?? ''} onChange={(e) => setEdu({ ...edu, track: e.target.value })} disabled={readOnly}>
            <option value="">Select</option>
            {SHS_TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            {edu.track && !SHS_TRACKS.includes(edu.track) && <option value={edu.track}>{edu.track}</option>}
          </select>
        </label>
        <div className="field">
          <span>Academic rating</span>
          <p style={{ margin: '6px 0 0' }}>{rating}</p>
          <span className="muted small">From the grades you gave in step 1.</span>
        </div>
      </div>

      <h2 className="mt">References</h2>
      <p className="muted" style={{ marginTop: 0 }}>Three people who know you and are not family members (teacher, barangay official, neighbor).</p>
      <div className="ref-list">
        {refs.map((r, i) => (
          <fieldset className="sheet-block" key={i}>
            <legend>Reference {i + 1}</legend>
            <div className="row">
              <label className="field">Name<input value={r.name ?? ''} onChange={(e) => setRef(i, { name: e.target.value })} disabled={readOnly} /></label>
              <label className="field">Contact no.<input value={r.contact ?? ''} onChange={(e) => setRef(i, { contact: e.target.value })} placeholder="09XXXXXXXXX" disabled={readOnly} /></label>
            </div>
            <div className="row">
              <label className="field">Address<input value={r.address ?? ''} onChange={(e) => setRef(i, { address: e.target.value })} disabled={readOnly} /></label>
              <label className="field">Occupation<input value={r.occupation ?? ''} onChange={(e) => setRef(i, { occupation: e.target.value })} disabled={readOnly} /></label>
            </div>
          </fieldset>
        ))}
      </div>
      <p className="muted small">
        The office also asks for a handwritten statement on why you should be considered as a scholar / grantee:
        write it on paper and upload a photo of it in Documents.
      </p>
      {!readOnly && <SaveBar state={save} onSave={onSave} />}
    </section>
  )
}
