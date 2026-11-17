export type AppRole = 'applicant' | 'evaluator' | 'admin'

export interface Profile {
  id: string
  role: AppRole
  full_name: string
  student_number: string | null
  birth_date: string | null
  mobile: string | null
  status: 'active' | 'disabled'
  duplicate_flag: boolean
  consent_version: string | null
  consent_at: string | null
}

export interface ProgramCycle {
  id: number
  name: string
  school_year: string
  term: string
  opens_at: string
  closes_at: string
  slots: number
  gwa_cutoff: number
  pay_tiers: { min_gwa: number; max_gwa: number; amount: number }[]
  exam_at: string | null
  exam_venue: string | null
  step2_closes_at: string | null
  step2_slots: number | null
  exam_finalized_at: string | null
  selection_finalized_at: string | null
  status: 'draft' | 'open' | 'closed' | 'ranked' | 'finalized'
}

export interface Criterion {
  id: number
  code: string
  name: string
  description: string | null
  direction: 'benefit' | 'cost'
  source_field: string
  unit: string | null
  is_active: boolean
  display_order: number
}

export interface DocumentType {
  code: string
  name: string
  required: boolean
  /** 1 = initial screening, 2 = requirements for qualified examinees */
  stage: 1 | 2
  required_when: 'member_ill' | null
}

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'eligible'
  | 'ineligible'
  | 'exam_eligible'
  | 'exam_failed'
  | 'ranked'
  | 'approved'
  | 'waitlisted'
  | 'not_selected'
  | 'withdrawn'

export interface Application {
  id: string
  applicant_id: string
  cycle_id: number
  status: ApplicationStatus
  stage: 1 | 2
  exam_result: 'passed' | 'failed' | 'absent' | null
  exam_score: number | null
  combined_score: number | null
  academic_rank: number | null
  applicant_no: string | null
  step1_submitted_at: string | null
  declared_monthly_income: number | null
  ses_inputs: import('./ses').SesInputs
  ses_index: number | null
  household_size: number | null
  gwa_declared: number | null
  gwa_scale: 'percent' | 'one_to_five' | null
  gwa_converted: number | null
  is_registered_voter: boolean | null
  other_scholarship: boolean | null
  other_scholarship_name: string | null
  truthfulness_signed: boolean
  // office online application (step 1)
  shs_gwa: number | null
  grade_sem1: number | null
  grade_sem2: number | null
  // Scholar / Grantee Information Sheet (step 2)
  height_in: number | null
  weight_kg: number | null
  siblings: number | null
  birth_order: number | null
  years_in_city: number | null
  parents: { father?: import('./office').ParentInfo; mother?: import('./office').ParentInfo }
  education: import('./office').Education
  character_refs: import('./office').CharacterRef[]
  category: 'scholar' | 'grantee' | null
  flags: { code: string; detail?: unknown }[]
  submitted_at: string | null
  created_at: string
}

export interface HouseholdMember {
  id?: number
  application_id?: string
  full_name: string
  relationship: string
  age: number
  is_studying: boolean
  is_working: boolean
  monthly_income: number
  has_illness: boolean
}

export interface DocumentRow {
  id: string
  application_id: string
  type_code: string
  storage_path: string
  sha256: string | null
  mime_type: string | null
  size_bytes: number | null
  verification_status: 'pending' | 'pass' | 'review' | 'accepted' | 'rejected'
  is_current: boolean
  uploaded_at: string
}

export interface ApplicantRow {
  id: string
  school_id: number | null
  course: string | null
  year_level: number | null
  barangay_id: number | null
  street: string | null
  sex: 'male' | 'female' | null
  shs_school: string | null
  department: string | null
  address_line: string | null
  home_lat: number | null
  home_lng: number | null
  pin_source: 'map_pin' | 'geocoded' | null
}
