import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { RELATIONSHIPS } from '../../lib/ses'
import { supabase } from '../../lib/supabase'
import type { HouseholdMember } from '../../lib/types'
import { rosterProblems } from '../../lib/validation'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

const blank = (): HouseholdMember => ({
  full_name: '',
  relationship: 'sibling',
  age: 0,
  is_studying: false,
  is_working: false,
  monthly_income: 0,
  has_illness: false,
})

export function HouseholdSection({ data, readOnly, reload }: SectionProps) {
  const { profile } = useAuth()
  const initial =
    data.members.length > 0
      ? data.members
      : [{ ...blank(), full_name: profile?.full_name ?? '', relationship: 'self', is_studying: true }]
  const [members, setMembers] = useState<HouseholdMember[]>(initial)
  const [income, setIncome] = useState<string>(data.app.declared_monthly_income?.toString() ?? '')
  const save = useSave()

  const total = members.reduce((s, m) => s + (Number(m.monthly_income) || 0), 0)
  const problems = rosterProblems(members)
  const perCapita = members.length ? (Number(income || total) / members.length) : 0

  const update = (i: number, patch: Partial<HouseholdMember>) =>
    setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m)))

  async function onSave() {
    if (problems.length) return save.fail(problems.join(' '))
    const declared = income === '' ? total : Number(income)
    if (!Number.isFinite(declared) || declared < 0) return save.fail('Enter a valid monthly household income.')
    await save.run(async () => {
      // replace the roster: simplest correct approach for a small list
      const del = await supabase.from('household_members').delete().eq('application_id', data.app.id)
      if (del.error) throw del.error
      const ins = await supabase.from('household_members').insert(
        members.map((m) => ({
          application_id: data.app.id,
          full_name: m.full_name.trim(),
          relationship: m.relationship,
          age: Number(m.age),
          is_studying: m.is_studying,
          is_working: m.is_working,
          monthly_income: Number(m.monthly_income) || 0,
          has_illness: m.has_illness,
        })),
      )
      if (ins.error) throw ins.error
      const up = await supabase.from('applications').update({ declared_monthly_income: declared }).eq('id', data.app.id)
      if (up.error) throw up.error
      await reload()
    })
  }

  return (
    <section className="card">
      <h2>Household roster</h2>
      <p className="muted">
        List everyone who lives and eats with you in the same house, including yourself. Your household size is counted from
        this list. Tick <b>Ill / PWD</b> for anyone with an illness or disability: you will then be asked for a medical
        certificate, and the office takes it into account.
      </p>
      <div className="roster">
        <div className="roster-head">
          <span>Name</span>
          <span>Relationship</span>
          <span>Age</span>
          <span>Studying</span>
          <span>Working</span>
          <span>Ill / PWD</span>
          <span>Monthly income (PHP)</span>
          <span />
        </div>
        {members.map((m, i) => (
          <div className="roster-row" key={i}>
            <input
              aria-label="Name"
              value={m.full_name}
              disabled={readOnly}
              onChange={(e) => update(i, { full_name: e.target.value })}
            />
            <select
              aria-label="Relationship"
              value={m.relationship}
              disabled={readOnly}
              onChange={(e) => update(i, { relationship: e.target.value })}
            >
              {RELATIONSHIPS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              aria-label="Age"
              type="number"
              min={0}
              max={120}
              value={m.age}
              disabled={readOnly}
              onChange={(e) => update(i, { age: Number(e.target.value) })}
            />
            <label className="cell-check">
              <input
                type="checkbox"
                checked={m.is_studying}
                disabled={readOnly}
                onChange={(e) => update(i, { is_studying: e.target.checked })}
              />
              <span className="sr">Studying</span>
            </label>
            <label className="cell-check">
              <input
                type="checkbox"
                checked={m.is_working}
                disabled={readOnly}
                onChange={(e) => update(i, { is_working: e.target.checked })}
              />
              <span className="sr">Working</span>
            </label>
            <label className="cell-check">
              <input
                type="checkbox"
                checked={m.has_illness}
                disabled={readOnly}
                onChange={(e) => update(i, { has_illness: e.target.checked })}
              />
              <span className="sr">Has an illness or disability</span>
            </label>
            <input
              aria-label="Monthly income"
              type="number"
              min={0}
              step={100}
              value={m.monthly_income}
              disabled={readOnly}
              onChange={(e) => update(i, { monthly_income: Number(e.target.value) })}
            />
            <button
              className="link-button"
              disabled={readOnly || members.length === 1}
              onClick={() => setMembers(members.filter((_, j) => j !== i))}
              aria-label="Remove member"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {!readOnly && (
        <button className="button ghost small" onClick={() => setMembers([...members, blank()])}>
          + Add member
        </button>
      )}

      <h2 className="mt">Household income</h2>
      <div className="row">
        <label className="field">
          Total monthly household income (PHP)
          <input
            type="number"
            min={0}
            step={100}
            placeholder={String(total)}
            value={income}
            disabled={readOnly}
            onChange={(e) => setIncome(e.target.value)}
          />
          <span className="muted small">
            Sum of the roster: PHP {total.toLocaleString()}. Leave blank to use it. Include pensions, remittances and
            regular support.
          </span>
        </label>
        <div className="stat">
          <div className="stat-value">{members.length}</div>
          <div className="stat-label">household members · PHP {Math.round(perCapita).toLocaleString()} per person</div>
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="error-list mt">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!readOnly && <SaveBar state={save} onSave={onSave} />}
    </section>
  )
}
