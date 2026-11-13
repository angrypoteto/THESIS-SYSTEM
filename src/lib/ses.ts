// Living-conditions questions. The option VALUES must match public.compute_ses_index in
// supabase/migrations/20261104000400_rules_mcdm.sql (placeholder rubric until the office reviews it).
// No income question here: income is criterion C1 on its own (Build Plan L1 / X3).

export interface SesInputs {
  housing_tenure?: string
  wall_material?: string
  has_electricity?: boolean
  water_source?: string
  assets?: string[]
  parent_education?: string
  parent_occupation?: string
}

export const HOUSING_TENURE = [
  ['owned', 'Owned (fully paid)'],
  ['amortized', 'Owned, still paying (amortized)'],
  ['rented', 'Rented'],
  ['rent_free_with_consent', 'Rent-free, with the owner’s permission'],
  ['informal', 'Informal settlement / without the owner’s permission'],
] as const

export const WALL_MATERIAL = [
  ['concrete', 'Concrete, brick or stone'],
  ['mixed', 'Half concrete, half wood'],
  ['light', 'Wood, bamboo, nipa or other light materials'],
  ['salvaged', 'Salvaged or makeshift materials'],
] as const

// Household-use water, not drinking water: in NCR most families drink refilled water even with
// a piped connection (APIS 2022), so drinking water says little about need. See ml/CALIBRATION.md.
export const WATER_SOURCE = [
  ['piped_own', 'Own piped connection'],
  ['piped_shared', 'Shared faucet / community tap'],
  ['well', 'Well or deep well'],
  ['none', 'No regular supply: bought by the container, spring, river or other'],
] as const

export const ASSETS = [
  ['tv', 'Television'],
  ['refrigerator', 'Refrigerator'],
  ['washing_machine', 'Washing machine'],
  ['aircon', 'Air conditioner'],
  ['computer', 'Computer / laptop'],
  ['motorcycle', 'Motorcycle'],
  ['car', 'Car, van or jeep'],
  ['smartphone', 'Smartphone'],
] as const

export const PARENT_EDUCATION = [
  ['none', 'No schooling'],
  ['elementary', 'Elementary'],
  ['high_school', 'High school'],
  ['college', 'College / vocational'],
  ['postgraduate', 'Post-graduate'],
] as const

export const PARENT_OCCUPATION = [
  ['unemployed', 'Unemployed / no regular work'],
  ['informal', 'Informal or daily wage (vendor, driver, laborer, helper)'],
  ['skilled', 'Skilled or clerical (technician, office staff, OFW)'],
  ['professional', 'Professional, manager or business owner'],
] as const

export const RELATIONSHIPS = [
  ['self', 'Self (applicant)'],
  ['father', 'Father'],
  ['mother', 'Mother'],
  ['guardian', 'Guardian'],
  ['sibling', 'Brother / sister'],
  ['grandparent', 'Grandparent'],
  ['spouse', 'Spouse'],
  ['child', 'Child'],
  ['relative', 'Other relative'],
  ['other', 'Other'],
] as const
