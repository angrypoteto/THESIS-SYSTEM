/**
 * Choices exactly as the office's online application asks them (Google Form "Scholarship Application SY 2026-2027",
 * Mandaluyong Educational Service Office). Update here if the office changes its form.
 */
export const DEPARTMENTS: { name: string; courses: string[] }[] = [
  {
    name: 'College of Business, Entrepreneurship and Accountancy',
    courses: ['BS Accountancy', 'BS Entrepreneurship', 'BS Office Administration', 'BSBA Financial Management',
      'BSBA Human Resource Management', 'BSBA Marketing Management', 'BSBA Operations Management'],
  },
  {
    name: 'College of Engineering',
    courses: ['BS Civil Engineering', 'BS Electrical Engineering', 'BS Electronics Engineering', 'BS Computer Engineering',
      'BS Industrial Engineering', 'BS Instrumentation and Control Engineering', 'BS Mechanical Engineering',
      'BS Mechatronics Engineering'],
  },
  { name: 'College of Arts and Sciences', courses: ['BS Psychology', 'AB Political Science', 'BS Statistics', 'BS Biology', 'BS Astronomy'] },
  {
    name: 'College of Education',
    courses: ['BSE English', 'BSE Filipino', 'BSE Math', 'BSE Science', 'BSE Social Studies', 'BTVTE-Animation',
      'BTVTE-Computer System Servicing', 'BTVTE-Visual Graphics Design', 'BTVTE-Electronics Technology',
      'BTVTE-Welding and Fabrication Technology', 'BTVTE-Garment, Fashion, and Design'],
  },
  { name: 'Institute of Human Kinetics', courses: ['BS Physical Education'] },
  { name: 'Institute of Architecture', courses: ['BS Architecture'] },
  { name: 'Institute of Computer Studies', courses: ['BS Information Technology'] },
]

export const ALL_COURSES = DEPARTMENTS.flatMap((d) => d.courses)
export const departmentOf = (course: string | null | undefined) =>
  DEPARTMENTS.find((d) => d.courses.includes(course ?? ''))?.name ?? ''

export const SHS_SCHOOLS = [
  'Mandaluyong High School', 'MPNAG', 'San Felipe Neri Catholic School', 'Eulogio Rodriguez Integrated School',
  'City of Mandaluyong Science High School', 'Andres Bonifacio Integrated School Senior High School',
  'Isaac Lopez Integrated School', 'Arellano University - Plaridel Campus', 'Rizal Technological University',
]

export const SHS_TRACKS = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL - ICT', 'TVL - Home Economics', 'TVL - Industrial Arts',
  'TVL - Agri-Fishery', 'Sports', 'Arts and Design']

/** Step 2 (Scholar / Grantee Information Sheet): one parent block. */
export interface ParentInfo {
  status?: 'living' | 'deceased' | 'absent'
  name?: string
  occupation?: string
  birthdate?: string
  company?: string
  annual_income?: number | null
}
export interface SchoolRow { school?: string; year?: number | null; honors?: string }
export interface Education { elementary?: SchoolRow; jhs?: SchoolRow; shs?: SchoolRow; track?: string }
export interface CharacterRef { name?: string; address?: string; occupation?: string; contact?: string }
