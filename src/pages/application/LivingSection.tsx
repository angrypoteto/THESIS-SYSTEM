import { useState } from 'react'
import {
  ASSETS,
  HOUSING_TENURE,
  PARENT_EDUCATION,
  PARENT_OCCUPATION,
  WALL_MATERIAL,
  WATER_SOURCE,
  type SesInputs,
} from '../../lib/ses'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

type Options = readonly (readonly [string, string])[]

export function LivingSection({ data, readOnly, reload }: SectionProps) {
  const [s, setS] = useState<SesInputs>({ assets: [], ...data.app.ses_inputs })
  const save = useSave()

  const radio = (key: keyof SesInputs, title: string, options: Options) => (
    <fieldset className="radio-group" disabled={readOnly}>
      <legend>{title}</legend>
      {options.map(([v, l]) => (
        <label key={v}>
          <input type="radio" name={key} checked={s[key] === v} onChange={() => setS({ ...s, [key]: v })} /> {l}
        </label>
      ))}
    </fieldset>
  )

  const missing = [
    !s.housing_tenure && 'housing',
    !s.wall_material && 'walls',
    s.has_electricity === undefined && 'electricity',
    !s.water_source && 'water',
    !s.parent_education && "parents' education",
    !s.parent_occupation && "parents' work",
  ].filter(Boolean)

  async function onSave() {
    await save.run(async () => {
      const { error } = await supabase.from('applications').update({ ses_inputs: s }).eq('id', data.app.id)
      if (error) throw error
      await reload()
    })
  }

  return (
    <section className="card">
      <h2>Living conditions</h2>
      <p className="muted">
        These answers describe your home and family. They are scored separately from income, and the office may verify them
        during a home visit.
      </p>
      <div className="grid two">
        {radio('housing_tenure', 'Your house is…', HOUSING_TENURE)}
        {radio('wall_material', 'Outer walls are mostly made of…', WALL_MATERIAL)}
        {radio('water_source', 'Main source of water for household use (cooking, washing, bathing)', WATER_SOURCE)}
        <fieldset className="radio-group" disabled={readOnly}>
          <legend>Does the house have electricity?</legend>
          <label>
            <input type="radio" name="elec" checked={s.has_electricity === true} onChange={() => setS({ ...s, has_electricity: true })} />{' '}
            Yes
          </label>
          <label>
            <input type="radio" name="elec" checked={s.has_electricity === false} onChange={() => setS({ ...s, has_electricity: false })} />{' '}
            No
          </label>
        </fieldset>
        {radio('parent_education', "Highest education of either parent or guardian", PARENT_EDUCATION)}
        {radio('parent_occupation', "Main work of the household's main earner", PARENT_OCCUPATION)}
      </div>
      <fieldset className="radio-group" disabled={readOnly}>
        <legend>The household owns (tick all that apply)</legend>
        <div className="check-grid">
          {ASSETS.map(([v, l]) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={s.assets?.includes(v) ?? false}
                onChange={(e) =>
                  setS({ ...s, assets: e.target.checked ? [...(s.assets ?? []), v] : (s.assets ?? []).filter((a) => a !== v) })
                }
              />{' '}
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      {missing.length > 0 && <p className="muted">Still to answer: {missing.join(', ')}.</p>}
      {!readOnly && <SaveBar state={save} onSave={onSave} />}
    </section>
  )
}
