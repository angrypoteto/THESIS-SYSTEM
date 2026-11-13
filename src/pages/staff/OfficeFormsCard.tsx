import { Fragment, useEffect, useState } from 'react'
import type { CharacterRef, Education, ParentInfo } from '../../lib/office'
import { supabase } from '../../lib/supabase'

interface Row {
  stage: number
  status: string
  shs_gwa: number | null
  grade_sem1: number | null
  grade_sem2: number | null
  gwa_declared: number | null
  gwa_scale: string | null
  height_in: number | null
  weight_kg: number | null
  siblings: number | null
  birth_order: number | null
  years_in_city: number | null
  parents: { father?: ParentInfo; mother?: ParentInfo }
  education: Education
  character_refs: CharacterRef[]
  category: 'scholar' | 'grantee' | null
  applicants: {
    sex: string | null
    shs_school: string | null
    department: string | null
    course: string | null
    year_level: number | null
    address_line: string | null
    barangays: { name: string } | null
    profiles: { full_name: string | null; surname: string | null; first_name: string | null; middle_name: string | null; suffix: string | null; birth_date: string | null; mobile: string | null } | null
  } | null
}

const peso = (n: number | null | undefined) => (n == null ? '—' : `PHP ${Number(n).toLocaleString()}`)
const age = (d: string | null | undefined) => (d ? Math.floor((Date.now() - Date.parse(d)) / 31_557_600_000) : null)

/**
 * The applicant's answers laid out like the office's own two forms: the online application (step 1) and the
 * Scholar / Grantee Information Sheet (step 2), with the Category (Scholar / Grantee) the scholarship officer sets.
 */
export function OfficeFormsCard({ appId, canSetCategory }: { appId: string; canSetCategory: boolean }) {
  const [r, setR] = useState<Row | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('applications')
      .select('stage,status,shs_gwa,grade_sem1,grade_sem2,gwa_declared,gwa_scale,height_in,weight_kg,siblings,birth_order,years_in_city,parents,education,character_refs,category,' +
        'applicants(sex,shs_school,department,course,year_level,address_line,barangays(name),profiles(full_name,surname,first_name,middle_name,suffix,birth_date,mobile))')
      .eq('id', appId)
      .single()
    setR(data as unknown as Row)
  }
  useEffect(() => {
    load()
  }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setCategory(c: 'scholar' | 'grantee') {
    setMsg(null)
    const { error } = await supabase.from('applications').update({ category: c }).eq('id', appId)
    if (error) return setMsg(error.message)
    await load()
  }

  if (!r) return null
  const ap = r.applicants
  const p = ap?.profiles
  const college = ap?.year_level === 2
  const parent = (label: string, x?: ParentInfo) =>
    !x ? <p className="muted small">{label}: not given</p>
      : x.status && x.status !== 'living' ? <p className="small"><strong>{label}:</strong> {x.status === 'deceased' ? 'Deceased' : 'Not with the family'}</p>
      : (
        <dl className="facts">
          <dt>{label}&rsquo;s name</dt><dd>{x.name || '—'}</dd>
          <dt>Occupation</dt><dd>{x.occupation || '—'}</dd>
          <dt>Birthdate</dt><dd>{x.birthdate || '—'}</dd>
          <dt>Company &amp; address</dt><dd>{x.company || '—'}</dd>
          <dt>Annual income</dt><dd>{peso(x.annual_income)}</dd>
        </dl>
      )

  return (
    <section className="card" aria-labelledby="office-forms">
      <h2 id="office-forms">Office forms</h2>
      <h3>Online application (step 1)</h3>
      <dl className="facts">
        <dt>Name</dt><dd>{[p?.surname, [p?.first_name, p?.middle_name, p?.suffix].filter(Boolean).join(' ')].filter(Boolean).join(', ') || p?.full_name || '—'}</dd>
        <dt>Sex · Birthday</dt><dd>{ap?.sex ?? '—'} · {p?.birth_date ?? '—'}{age(p?.birth_date) != null ? ` (age ${age(p?.birth_date)})` : ''}</dd>
        <dt>Contact</dt><dd>{p?.mobile ?? '—'}</dd>
        <dt>Address</dt><dd>{ap?.address_line ?? '—'}, {ap?.barangays?.name ?? '—'}</dd>
        <dt>Senior high school</dt><dd>{ap?.shs_school ?? '—'}</dd>
        <dt>Year level</dt><dd>{ap?.year_level ? `${ap.year_level === 1 ? '1st' : '2nd'} Year College` : '—'}</dd>
        <dt>Department · Course</dt><dd>{ap?.department ?? '—'} · {ap?.course ?? '—'}</dd>
        {college ? (
          <>
            <dt>SHS general weighted average</dt><dd>{r.shs_gwa ?? '—'}</dd>
            <dt>1st-year college grades</dt><dd>1st sem {r.grade_sem1 ?? '—'} · 2nd sem {r.grade_sem2 ?? '—'} · GWA {r.gwa_declared ?? '—'} (1.00 best)</dd>
          </>
        ) : (
          <dt>Grade 12 grades</dt>
        )}
        {!college && <dd>1st sem {r.grade_sem1 ?? '—'} · 2nd sem {r.grade_sem2 ?? '—'} · GWA {r.shs_gwa ?? r.gwa_declared ?? '—'}</dd>}
      </dl>

      {r.stage === 2 && (
        <>
          <h3 className="mt">Scholar / Grantee Information Sheet (step 2)</h3>
          <dl className="facts">
            <dt>Height · Weight</dt><dd>{r.height_in ?? '—'} in · {r.weight_kg ?? '—'} kg</dd>
            <dt>Siblings · Order of birth</dt><dd>{r.siblings ?? '—'} · {r.birth_order ?? '—'}</dd>
            <dt>Years in Mandaluyong</dt><dd>{r.years_in_city ?? '—'}</dd>
          </dl>
          {parent('Father', r.parents?.father)}
          {parent('Mother', r.parents?.mother)}
          <table className="table">
            <thead><tr><th>Education</th><th>School</th><th>Year graduated</th><th>Honors</th></tr></thead>
            <tbody>
              {([['Elementary', r.education?.elementary], ['Junior High School', r.education?.jhs], ['Senior High School', r.education?.shs]] as const).map(([l, e]) => (
                <tr key={l}><td>{l}</td><td>{e?.school || '—'}</td><td>{e?.year ?? '—'}</td><td>{e?.honors || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small" style={{ margin: '6px 0 12px' }}><strong>Track:</strong> {r.education?.track || '—'}</p>
          <table className="table">
            <thead><tr><th>Reference</th><th>Address</th><th>Occupation</th><th>Contact</th></tr></thead>
            <tbody>
              {(r.character_refs ?? []).map((c, i) => (
                <Fragment key={i}><tr><td>{c.name || '—'}</td><td>{c.address || '—'}</td><td>{c.occupation || '—'}</td><td>{c.contact || '—'}</td></tr></Fragment>
              ))}
            </tbody>
          </table>
          <div className="question" style={{ marginTop: 14 }}>
            <span><strong>Category</strong> <span className="muted small">(set by the scholarship officer)</span></span>
            <div className="inline-radios">
              {(['scholar', 'grantee'] as const).map((c) => (
                <label key={c}>
                  <input type="radio" name="category" checked={r.category === c} disabled={!canSetCategory} onChange={() => setCategory(c)} />
                  {c === 'scholar' ? ' Scholar' : ' Grantee'}
                </label>
              ))}
            </div>
          </div>
          {msg && <p className="error" role="alert">{msg}</p>}
        </>
      )}
    </section>
  )
}
