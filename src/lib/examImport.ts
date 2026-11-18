/**
 * Reading RTU's exam score list (Excel or CSV) and matching it to the exam takers by student number.
 * Works with any column order and extra columns (name, course, …): the student-number and score columns are found
 * by their header ("Student number", "Score", …) or, without a header, by matching the cells to the takers.
 */
export type Cell = string | number | boolean | Date | null | undefined
export interface Taker { id: string; student_number: string | null }
export interface Entry { score?: number; absent?: boolean }
export interface MatchResult {
  entries: Record<string, Entry>      // application id -> what the file says
  matched: number
  notFound: string[]                  // student numbers in the file that are not exam takers of this cycle
  invalid: string[]                   // matched, but the score could not be read (e.g. 105, "pending")
  duplicates: string[]                // the same student more than once (the last line wins)
  unreadable: number                  // lines with no student number at all
}

/** Student numbers compared without spaces, dashes or a leading apostrophe (Excel text marker): 2026-00123 = 2026 00123 = 202600123. */
export const normSn = (v: Cell) => String(v ?? '').toUpperCase().replace(/^'/, '').replace(/[\s-]+/g, '')

const ABSENT = /^(absent|abs|ab|a|did not take|dnt|no show|noshow|x)$/i
// header names for the student-number column, most specific first (a bare "No." is usually a row counter)
const SN_HEADS = [/student|stud\.?\s*no/i, /id\s*no|^sn$|id\s*number/i, /number/i]
const SCORE_HEAD = /score|grade|result|rating|percent|%|mark/i
const LOOKS_LIKE_SN = /^[A-Z]{0,3}\d{5,}[A-Z0-9]*$/   // after normSn

/** A score from a cell: a number 0-100 (a "%" is allowed), "absent", or null if it is not a score. */
export function readScore(c: Cell): Entry | 'invalid' | null {
  if (c == null || c === '') return null
  if (typeof c === 'number') return c >= 0 && c <= 100 ? { score: Math.round(c * 100) / 100 } : 'invalid'
  const s = String(c).trim().replace(/%$/, '').trim()
  if (s === '') return null
  if (ABSENT.test(s)) return { absent: true }
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n >= 0 && n <= 100 ? { score: Math.round(n * 100) / 100 } : 'invalid'
}

/** Pasted or CSV text -> rows of cells (tab-, comma- or semicolon-separated; simple quotes handled). */
export function textToRows(text: string): Cell[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  return lines.map((l) => {
    // per line: tab (copied from a spreadsheet), else comma, else semicolon (CSV saved with a European locale)
    const sep = l.includes('\t') ? '\t' : l.includes(',') ? ',' : ';'
    const out: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++ } else q = !q }
      else if (ch === sep && !q) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  })
}

export function matchScores(rows: Cell[][], takers: Taker[]): MatchResult {
  const known = new Map(takers.filter((t) => t.student_number).map((t) => [normSn(t.student_number), t.id]))
  const res: MatchResult = { entries: {}, matched: 0, notFound: [], invalid: [], duplicates: [], unreadable: 0 }
  const seen = new Set<string>()

  // header: a row (among the first 5) with a student-number column and a score column
  let snCol = -1
  let scoreCol = -1
  let start = 0
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const cells = rows[r].map((c) => String(c ?? '').trim())
    let a = -1
    for (const re of SN_HEADS) { a = cells.findIndex((c) => re.test(c) && !known.has(normSn(c))); if (a >= 0) break }
    const b = cells.findIndex((c, i) => i !== a && SCORE_HEAD.test(c))
    if (a >= 0 && b >= 0) { snCol = a; scoreCol = b; start = r + 1; break }
  }

  for (let r = start; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue
    // the student number: the header's column, else the first cell that is a known exam taker
    let si = snCol >= 0 ? snCol : row.findIndex((c) => known.has(normSn(c)))
    if (si < 0) si = row.findIndex((c) => LOOKS_LIKE_SN.test(normSn(c)))
    if (si < 0) { res.unreadable++; continue }
    const sn = normSn(row[si])
    if (!sn) { res.unreadable++; continue }
    const id = known.get(sn)
    if (!id) { res.notFound.push(String(row[si]).trim()); continue }
    // the score: the header's column, else the first other cell that reads as a score
    let entry: Entry | 'invalid' | null = null
    if (scoreCol >= 0) entry = readScore(row[scoreCol])
    else {
      for (let i = 0; i < row.length && !entry; i++) if (i !== si) {
        const e = readScore(row[i])
        if (e) entry = e
      }
    }
    if (!entry || entry === 'invalid') { res.invalid.push(String(row[si]).trim()); continue }
    if (seen.has(id)) res.duplicates.push(String(row[si]).trim())
    else res.matched++
    seen.add(id)
    res.entries[id] = entry
  }
  return res
}
