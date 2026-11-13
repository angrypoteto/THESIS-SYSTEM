import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

/**
 * Step 1 grades, exactly as the office's online application asks them:
 *  - incoming 1st year:  Grade 12 1st semester grade, 2nd semester grade, general weighted average (percent)
 *  - incoming 2nd year:  SHS general weighted average + 1st-year college 1st / 2nd semester grade and general
 *                        weighted average on RTU's 1.00-5.00 scale (1.00 is highest)
 * The grade used for the GWA cut-off and the ranking (C4) is the last general weighted average.
 */
export function GradesSection({ data, readOnly, reload }: SectionProps) {
  const a = data.app
  const year = data.applicant.year_level
  const college = year === 2
  const [shs, setShs] = useState(a.shs_gwa?.toString() ?? (!college && a.gwa_declared != null ? a.gwa_declared.toString() : ''))
  const [s1, setS1] = useState(a.grade_sem1?.toString() ?? '')
  const [s2, setS2] = useState(a.grade_sem2?.toString() ?? '')
  const [gwa, setGwa] = useState(college && a.gwa_declared != null ? a.gwa_declared.toString() : '')
  const save = useSave()

  if (year !== 1 && year !== 2) {
    return (
      <section className="card">
        <h2>Grades</h2>
        <p className="banner warn" style={{ margin: 0 }}>
          Set your year level (1st or 2nd Year College) in your <Link to="/profile">profile</Link> first: the grades asked depend on it.
        </p>
      </section>
    )
  }

  const pct = (v: string) => v !== '' && Number(v) >= 60 && Number(v) <= 100
  const one5 = (v: string) => v !== '' && Number(v) >= 1 && Number(v) <= 5

  async function onSave() {
    if (!pct(shs)) return save.fail('Senior high school general weighted average is a percentage between 60 and 100.')
    if (college) {
      if (!one5(s1) || !one5(s2) || !one5(gwa)) return save.fail('1st-year college grades use RTU’s 1.00 to 5.00 scale (1.00 is highest).')
    } else if (!pct(s1) || !pct(s2)) {
      return save.fail('Grade 12 semester grades are percentages between 60 and 100.')
    }
    await save.run(async () => {
      const { error } = await supabase
        .from('applications')
        .update({
          shs_gwa: Number(shs),
          grade_sem1: Number(s1),
          grade_sem2: Number(s2),
          gwa_declared: college ? Number(gwa) : Number(shs),
          gwa_scale: college ? 'one_to_five' : 'percent',
        })
        .eq('id', a.id)
      if (error) throw error
      await reload()
    })
  }

  const num = (label: string, value: string, set: (v: string) => void, hint: string, step = '0.01') => (
    <label className="field">
      {label}
      <input type="number" step={step} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} disabled={readOnly} />
      <span className="muted small">{hint}</span>
    </label>
  )

  return (
    <section className="card">
      <h2>{college ? 'Grades: incoming 2nd year college' : 'Grades: incoming 1st year college'}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {college
          ? 'Your senior high school average and your 1st-year college grades at RTU. Upload the 1st and 2nd semester grades (or your IER) in Documents.'
          : 'Your Grade 12 grades. Upload your Grade 12 report card in Documents.'}
      </p>
      {college ? (
        <>
          {num('General weighted average (Senior High School)', shs, setShs, 'Percentage, e.g. 89.50')}
          <div className="row">
            {num('1st semester grade (1st year college)', s1, setS1, '1.00 to 5.00 (1.00 is highest)')}
            {num('2nd semester grade (1st year college)', s2, setS2, '1.00 to 5.00')}
          </div>
          {num('General weighted average (1st year college)', gwa, setGwa, `Used for the cut-off (${data.cycle.gwa_cutoff}% after conversion) and the ranking`)}
        </>
      ) : (
        <>
          <div className="row">
            {num('1st semester grade (Grade 12)', s1, setS1, 'Percentage, e.g. 88.75')}
            {num('2nd semester grade (Grade 12)', s2, setS2, 'Percentage')}
          </div>
          {num('General weighted average (Senior High School)', shs, setShs, `At least ${data.cycle.gwa_cutoff}%. Used for the cut-off and the ranking`)}
        </>
      )}
      {!readOnly && <SaveBar state={save} onSave={onSave} />}
    </section>
  )
}
