import { useState } from 'react'
import type { ParentInfo } from '../../lib/office'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

type Tri = '' | 'yes' | 'no'
const toTri = (b: boolean | null): Tri => (b === null ? '' : b ? 'yes' : 'no')
const str = (v: number | null | undefined) => (v == null ? '' : String(v))

/**
 * Step 2, part I of the office's "Scholar / Grantee Information Sheet": personal (height, weight, siblings,
 * order of birth, years in Mandaluyong) and parents / legal guardian (name, occupation, birthdate, company and
 * address, annual income). The voter and other-scholarship questions are asked here too (step 2 checks them).
 */
export function InfoSheetSection({ data, readOnly, reload }: SectionProps) {
  const a = data.app
  const [height, setHeight] = useState(str(a.height_in))
  const [weight, setWeight] = useState(str(a.weight_kg))
  const [siblings, setSiblings] = useState(str(a.siblings))
  const [order, setOrder] = useState(str(a.birth_order))
  const [years, setYears] = useState(str(a.years_in_city))
  const [father, setFather] = useState<ParentInfo>({ status: 'living', ...(a.parents?.father ?? {}) })
  const [mother, setMother] = useState<ParentInfo>({ status: 'living', ...(a.parents?.mother ?? {}) })
  const [voter, setVoter] = useState<Tri>(toTri(a.is_registered_voter))
  const [other, setOther] = useState<Tri>(toTri(a.other_scholarship))
  const [otherName, setOtherName] = useState(a.other_scholarship_name ?? '')
  const save = useSave()

  function parentProblem(label: string, p: ParentInfo): string | null {
    if (p.status !== 'living') return null
    if (!p.name?.trim() || !p.occupation?.trim()) return `Give the ${label}'s name and occupation (write "None" if not working), or mark them as deceased / not with the family.`
    if (p.annual_income != null && p.annual_income < 0) return `The ${label}'s annual income cannot be negative.`
    return null
  }

  async function onSave() {
    const nums = [height, weight, siblings, order, years]
    if (nums.some((v) => v !== '' && Number.isNaN(Number(v)))) return save.fail('Use numbers for height, weight, siblings, order of birth and years.')
    if (height && (Number(height) < 36 || Number(height) > 96)) return save.fail('Height is in inches (for example 63 for 5’3”).')
    if (siblings && order && Number(order) > Number(siblings) + 1) return save.fail('Order of birth cannot be more than the number of siblings + 1.')
    const pf = parentProblem('father', father) ?? parentProblem('mother', mother)
    if (pf) return save.fail(pf)
    if (other === 'yes' && !otherName.trim()) return save.fail('Name the other scholarship or grant.')
    const clean = (p: ParentInfo): ParentInfo =>
      p.status !== 'living' ? { status: p.status } : {
        status: 'living', name: p.name?.trim(), occupation: p.occupation?.trim(), birthdate: p.birthdate || undefined,
        company: p.company?.trim() || undefined, annual_income: p.annual_income ?? null,
      }
    await save.run(async () => {
      const { error } = await supabase.from('applications').update({
        height_in: height === '' ? null : Number(height),
        weight_kg: weight === '' ? null : Number(weight),
        siblings: siblings === '' ? null : Number(siblings),
        birth_order: order === '' ? null : Number(order),
        years_in_city: years === '' ? null : Number(years),
        parents: { father: clean(father), mother: clean(mother) },
        is_registered_voter: voter === '' ? null : voter === 'yes',
        other_scholarship: other === '' ? null : other === 'yes',
        other_scholarship_name: other === 'yes' ? otherName.trim() : null,
      }).eq('id', a.id)
      if (error) throw error
      await reload()
    })
  }

  const yesNo = (name: string, value: Tri, set: (v: Tri) => void) => (
    <div className="inline-radios">
      <label><input type="radio" name={name} checked={value === 'yes'} onChange={() => set('yes')} disabled={readOnly} /> Yes</label>
      <label><input type="radio" name={name} checked={value === 'no'} onChange={() => set('no')} disabled={readOnly} /> No</label>
    </div>
  )

  const parent = (label: string, p: ParentInfo, set: (p: ParentInfo) => void) => (
    <fieldset className="sheet-block">
      <legend>{label}</legend>
      <div className="inline-radios">
        {([['living', 'Living with / supporting the family'], ['deceased', 'Deceased'], ['absent', 'Not with the family']] as const).map(([v, t]) => (
          <label key={v}><input type="radio" name={`${label}-status`} checked={p.status === v} onChange={() => set({ ...p, status: v })} disabled={readOnly} /> {t}</label>
        ))}
      </div>
      {p.status === 'living' && (
        <>
          <div className="row">
            <label className="field">{label}&rsquo;s name<input value={p.name ?? ''} onChange={(e) => set({ ...p, name: e.target.value })} disabled={readOnly} /></label>
            <label className="field">Birthdate<input type="date" value={p.birthdate ?? ''} onChange={(e) => set({ ...p, birthdate: e.target.value })} disabled={readOnly} /></label>
          </div>
          <div className="row">
            <label className="field">Occupation<input value={p.occupation ?? ''} onChange={(e) => set({ ...p, occupation: e.target.value })} placeholder="e.g. Tricycle driver, None" disabled={readOnly} /></label>
            <label className="field">Annual income (PHP)
              <input type="number" min={0} step={1000} value={p.annual_income ?? ''} onChange={(e) => set({ ...p, annual_income: e.target.value === '' ? null : Number(e.target.value) })} disabled={readOnly} />
            </label>
          </div>
          <label className="field">Company &amp; address <span className="small muted">(write &ldquo;Self-employed&rdquo; if none)</span>
            <input value={p.company ?? ''} onChange={(e) => set({ ...p, company: e.target.value })} disabled={readOnly} />
          </label>
        </>
      )}
    </fieldset>
  )

  return (
    <section className="card">
      <h2>Information sheet: personal and family</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Part I of the office&rsquo;s Scholar / Grantee Information Sheet. Your name, address, birthday and contact come from your profile.
      </p>
      <div className="row">
        <label className="field">Height (inches)<input type="number" step="0.5" value={height} onChange={(e) => setHeight(e.target.value)} disabled={readOnly} /></label>
        <label className="field">Weight (kg)<input type="number" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={readOnly} /></label>
      </div>
      <div className="row">
        <label className="field">No. of siblings<input type="number" min={0} value={siblings} onChange={(e) => setSiblings(e.target.value)} disabled={readOnly} /></label>
        <label className="field">Order of birth<input type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} placeholder="1 = eldest" disabled={readOnly} /></label>
        <label className="field">No. of years in Mandaluyong<input type="number" min={0} value={years} onChange={(e) => setYears(e.target.value)} disabled={readOnly} /></label>
      </div>

      <h2 className="mt">Parents / legal guardian</h2>
      {parent('Father', father, setFather)}
      {parent('Mother', mother, setMother)}
      <p className="muted small">
        If a guardian supports you instead of a parent, write the guardian&rsquo;s details in the father&rsquo;s or mother&rsquo;s block and add them
        to the household list as &ldquo;Guardian&rdquo;.
      </p>

      <h2 className="mt">Eligibility questions</h2>
      <div className="question">
        <span>Are you a registered voter in Mandaluyong City?</span>
        {yesNo('voter', voter, setVoter)}
      </div>
      <div className="question">
        <span>Do you currently receive another scholarship or educational grant?</span>
        {yesNo('other', other, setOther)}
      </div>
      {other === 'yes' && (
        <label className="field">
          Name of the scholarship or grant
          <input value={otherName} onChange={(e) => setOtherName(e.target.value)} disabled={readOnly} />
        </label>
      )}
      {!readOnly && <SaveBar state={save} onSave={onSave} />}
    </section>
  )
}
