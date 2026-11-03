/**
 * Turn the text of a checkup report into rows.
 *
 * The text is not a table. Every cell came out on its own line, page furniture
 * sits between rows, and a row can be three cells long (ALT) or two (IBIL, no
 * reference range). So rows are rebuilt by anchor: a line that the dictionary
 * recognizes starts a row, and everything up to the next anchor belongs to it.
 * @module dsh-healthy/parsers/report
 */

import { isAnalyteName, lookup, refFor } from '../analytes.js'
import { examItem, readFinding, sectionKind } from '../findings.js'
import { normalizeReport } from '../normalize.js'
import { flagFor, parseRange, qualitativeFlag } from '../reference.js'
import { canonicalUnit, convertValue, isUnit, looksMisplaced } from '../units.js'

const PAGE = /^===== PAGE \d+ =====$/
const HEADER_CELLS = new Set([
  '检查项目', '缩写', '测量结果', '提示', '参考区间', '单位', '异常描述', '检查所见', '初步意见',
  '操作者:', '审核者:', '检查者:', '小结', '注:', '说明:',
])
const ABBR = /^[A-Za-z][A-Za-z0-9%+/.\-]{0,14}$/
const NUMBER = /^-?\d+(?:\.\d+)?$/
const QUALITATIVE = /^(阴性|阳性|弱阳性|可疑|\+|\+\+|\+\+\+|±|未见|正常|异常|-)$/
const QUALITATIVE_IDS = new Set(['u_leu', 'u_nit', 'u_pro', 'u_glu', 'u_ket', 'u_bld', 'u_bil', 'u_uro'])

function isHeaderCell(line) {
  return HEADER_CELLS.has(line) || line.startsWith('温馨提')
}

/** Lines that can never be part of a row. */
function isRowBoundary(line) {
  return PAGE.test(line) || isHeaderCell(line) || sectionKind(line) !== null
}

/**
 * Classify one cell.
 * @param {string} token - normalized cell text.
 * @returns {'range'|'unit'|'abbr'|'number'|'qualitative'|null} kind.
 */
function classify(token) {
  const text = token.trim()
  if (text.length === 0) return null
  const range = parseRange(text)
  if (range && text.includes('-')) return 'range'
  if (isUnit(text)) return 'unit'
  if (text === 'HR') return null
  if (ABBR.test(text)) return 'abbr'
  if (NUMBER.test(text)) return 'number'
  if (QUALITATIVE.test(text)) return 'qualitative'
  return null
}

/**
 * @param {string[]} lines - normalized report lines.
 * @param {number} start - index of the first cell after the name.
 * @returns {{cells: string[], next: number}} cells and where to continue.
 */
function collectCells(lines, start) {
  const cells = []
  let i = start
  while (i < lines.length && cells.length < 6) {
    const line = lines[i]
    if (isRowBoundary(line)) break
    // A known name starts the next row - except the single abbreviation cell
    // right after the row's own name, which is the row's second column.
    const knownName = isAnalyteName(line) || examItem(line)
    if (knownName && (cells.length > 0 || !ABBR.test(line))) break
    const kind = classify(line)
    if (kind === null && /[\u4e00-\u9fff]/.test(line) && !NUMBER.test(line)) break
    cells.push(line)
    i += 1
  }
  return { cells, next: i }
}

/**
 * @param {string[]} cells - the cells that followed a name.
 * @param {object|null} entry - dictionary entry.
 * @returns {object} value, unit and range.
 */
function readCells(cells, entry) {
  const out = { abbr: null, value: null, unit: null, ref: null, qualitative: false }
  for (const cell of cells) {
    const kind = classify(cell)
    if (kind === 'abbr' && !out.abbr) { out.abbr = cell; continue }
    if (kind === 'range' && !out.ref) { out.ref = parseRange(cell); continue }
    if (kind === 'unit' && !out.unit) { out.unit = cell; continue }
    if (kind === 'number' && out.value === null) { out.value = Number(cell); continue }
    if (kind === 'qualitative' && out.value === null) { out.value = cell; out.qualitative = true; continue }
  }
  if (out.qualitative && out.ref === null && entry && QUALITATIVE_IDS.has(entry.id)) {
    // A urine dipstick prints "阴性/阴性": the second 阴性 is the expected value.
    const second = cells.filter((cell) => QUALITATIVE.test(cell))
    if (second.length > 1) out.ref = { text: second[1] }
  }
  return out
}

/**
 * Parse a report.
 * @param {string} text - report text (the model's OCR or paste).
 * @param {{sex?: 'male'|'female'|null, reportId?: string}} [options] - context.
 * @returns {{items: object[], findings: object[], sections: object[], warnings: string[]}} parse result.
 */
export function parseReport(text, options = {}) {
  const lines = normalizeReport(text)
  const items = []
  const findings = []
  const sections = []
  const warnings = []
  let section = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (PAGE.test(line)) { i += 1; continue }

    const kind = sectionKind(line)
    if (kind) {
      // A heading only opens a table when a table header follows it. The
      // contents page lists the same names and must not be mistaken for data.
      const lookahead = lines.slice(i + 1, i + 6)
      const opensTable = lookahead.includes('检查项目')
      if (opensTable) {
        section = { name: line, type: kind.type, department: kind.department, from: i }
        sections.push(section)
        i += 1
        continue
      }
    }

    // "HR" 是京津冀鲁互认标记，不是一行数据；它会和 心率 的缩写撞名。
    if (!section || isHeaderCell(line) || line === 'HR') { i += 1; continue }
    if (options.name && line === options.name) { i += 1; continue }

    const exam = section.type === 'exam' ? examItem(line) : null
    const analyte = section.type !== 'exam' ? lookup(line) : null

    if (exam) {
      const { cells, next } = collectExamCells(lines, i + 1, options.name)
      const value = cells.join(' ').trim()
      findings.push({
        item: exam.id,
        item_text: line,
        department: exam.department,
        finding: value,
        ...readFinding(value),
      })
      i = next
      continue
    }

    if (analyte) {
      const { cells, next } = collectCells(lines, i + 1)
      const read = readCells(cells, analyte)
      const entry = buildObservation(analyte, line, read, options)
      items.push(entry)
      i = next
      continue
    }

    i += 1
  }

  return { items, findings, sections, warnings }
}

function collectExamCells(lines, start, name) {
  const cells = []
  let i = start
  while (i < lines.length && cells.length < 4) {
    const line = lines[i]
    if (name && line === name) { i += 1; continue }
    if (isRowBoundary(line) || examItem(line) || lookup(line)) break
    if (line === 'HR' || isUnit(line) || /^\d+\s*次\/分$/.test(line)) { i += 1; continue }
    if (line.includes('ID') || line.includes('体检号') || line === '先生' || line === '女士') break
    cells.push(line)
    i += 1
  }
  return { cells, next: i }
}

function buildObservation(entry, nameText, read, options) {
  const sex = options.sex ?? null
  const unit = read.unit ? canonicalUnit(read.unit) : entry.unit
  let value = null
  let ref = read.ref
  let qualitative = read.qualitative
  let flag = null

  if (read.qualitative) {
    const abnormal = qualitativeFlag(String(read.value), {})
    flag = abnormal === null ? null : abnormal ? 'H' : null
    value = read.value
  } else if (read.value !== null) {
    value = convertValue(entry.id, read.value, unit, entry.unit ?? unit)
    if (!ref) {
      const fallback = refFor(entry, sex)
      if (fallback) ref = { ...fallback, text: '词典标准区间' }
    }
    // Lab ranges differ by instrument, so only a report's own range may judge a
    // lab value. Vitals (blood pressure, pulse, BMI) are the same everywhere.
    if (read.ref || entry.category === 'vital') flag = flagFor(value, ref)
  }

  const warnings = []
  if (value !== null && !qualitative && looksMisplaced(value, refFor(entry, sex))) {
    warnings.push(entry.id + ': 数值 ' + value + ' 与常见范围相差过大，可能是小数点或单位问题')
  }
  if (read.unit && !isUnit(read.unit)) warnings.push(entry.id + ': 未识别的单位 ' + read.unit)

  return {
    kind: 'observation',
    analyte: entry.id,
    analyte_text: nameText,
    analyte_abbr: read.abbr || entry.abbr || null,
    category: entry.category,
    value,
    qualitative,
    unit: read.unit ? canonicalUnit(read.unit) : entry.unit,
    ref,
    ref_source: read.ref ? 'report' : refFor(entry, sex) ? 'dictionary' : null,
    flag,
    warnings,
  }
}
