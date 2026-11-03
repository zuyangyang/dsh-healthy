/**
 * Units: what a lab prints, how to recognize it in a line of text, and which
 * conversions are safe to do without asking.
 * @module dsh-healthy/units
 */

/** Units seen in Chinese checkup reports. */
const KNOWN = new Set([
  '10^9/L', '10^12/L', '10^6/uL', 'cells/uL', 'g/L', 'mg/L', 'mg/dL', 'g/dL',
  'mmol/L', 'umol/L', 'nmol/L', 'pmol/L', 'mIU/L', 'uIU/mL', 'IU/mL', 'mIU/mL',
  'U/L', 'IU/L', '%', 'mmHg', 'cm', 'Kg', 'kg', 'm', 'm2', '次/分', 'bpm',
  'fL', 'pg', 's', 'fl', 'ng/mL', 'pg/mL', 'ug/L', 'ng/L', 'μmol/L', 'μIU/mL',
  'μL', 'mm/h', 'g', 'mg', 'mg/mmol', 'μmol/mmol',
])

const ALIASES = new Map([
  ['μmol/L', 'umol/L'],
  ['μIU/mL', 'uIU/mL'],
  ['μL', 'uL'],
  ['μmol/mmol', 'umol/mmol'],
  ['μmol/L', 'umol/L'],
  ['mcg/L', 'ug/L'],
  ['fl', 'fL'],
  ['kg', 'Kg'],
  ['bpm', '次/分'],
])

/** Equivalent units where a straight factor applies. */
const CONVERSIONS = new Map([
  // analyte id -> { from: [to, factor] }
  ['glucose', { 'mg/dL': ['mmol/L', 1 / 18] }],
  ['fpg', { 'mg/dL': ['mmol/L', 1 / 18] }],
  ['tc', { 'mg/dL': ['mmol/L', 1 / 38.67] }],
  ['hdl_c', { 'mg/dL': ['mmol/L', 1 / 38.67] }],
  ['ldl_c', { 'mg/dL': ['mmol/L', 1 / 38.67] }],
  ['tg', { 'mg/dL': ['mmol/L', 1 / 88.57] }],
  ['crea', { 'mg/dL': ['umol/L', 88.4] }],
  ['ua', { 'mg/dL': ['umol/L', 59.48] }],
  ['hgb', { 'g/dL': ['g/L', 10] }],
  ['alb', { 'g/dL': ['g/L', 10] }],
  ['tp', { 'g/dL': ['g/L', 10] }],
])

/**
 * @param {string} token - candidate unit.
 * @returns {boolean} true when the token is a known unit.
 */
export function isUnit(token) {
  const text = String(token ?? '').trim()
  if (text.length === 0) return false
  return KNOWN.has(text) || KNOWN.has(canonicalUnit(text))
}

/**
 * @param {string} unit - raw unit text.
 * @returns {string} the spelling used internally.
 */
export function canonicalUnit(unit) {
  const text = String(unit ?? '').trim().replace(/\s+/g, '')
  return ALIASES.get(text) ?? text
}

/**
 * Convert a value when both sides are a known pair, otherwise keep it.
 * @param {string} analyte - analyte id.
 * @param {number} value - numeric value.
 * @param {string} from - unit the report printed.
 * @param {string} to - unit we store.
 * @returns {number} converted value.
 */
export function convertValue(analyte, value, from, to) {
  if (from === to) return value
  const table = CONVERSIONS.get(analyte)
  if (!table) return value
  for (const [source, [target, factor]] of Object.entries(table)) {
    if (canonicalUnit(source) === canonicalUnit(from) && canonicalUnit(target) === canonicalUnit(to)) {
      return value * factor
    }
    if (canonicalUnit(source) === canonicalUnit(to) && canonicalUnit(target) === canonicalUnit(from)) {
      return value / factor
    }
  }
  return value
}

/**
 * A 100x jump against the analyte's usual range means somebody misread a
 * decimal point; flag it instead of silently storing it.
 * @param {number} value - value in canonical units.
 * @param {{low?: number, high?: number}} [ref] - usual range.
 * @returns {boolean} true when the value looks like a unit error.
 */
export function looksMisplaced(value, ref) {
  if (!Number.isFinite(value) || !ref) return false
  const low = Number.isFinite(ref.low) ? ref.low : null
  const high = Number.isFinite(ref.high) ? ref.high : null
  if (low === null && high === null) return false
  if (low !== null && high !== null) {
    const span = high - low
    if (span <= 0) return false
    return value > high + span * 100 || value < low - span * 100
  }
  const anchor = low ?? high
  return Math.abs(value) > Math.abs(anchor) * 100 + 1
}
