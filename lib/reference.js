/**
 * Reference ranges and abnormality flags.
 *
 * The report's own range always wins: ranges differ by lab, by instrument and
 * by sex, and comparing two reports only means something when each value was
 * judged against the range it was produced with. The dictionary range is only
 * a fallback for reports that print none.
 * @module dsh-healthy/reference
 */

const RANGE_TEXT = /^(-?\d+(?:\.\d+)?)\s*(?:-|~|至|到)\s*(-?\d+(?:\.\d+)?)$/
const BOUNDED = /^([<>≤≥])\s*(-?\d+(?:\.\d+)?)$/

/**
 * Parse a printed reference range.
 * @param {string} text - e.g. "0-50", "1.1-3.2", "<5.0".
 * @returns {{low?: number, high?: number, text: string}|null} range or null.
 */
export function parseRange(text) {
  const raw = String(text ?? '').trim()
  if (raw.length === 0) return null
  const between = RANGE_TEXT.exec(raw)
  if (between) {
    const low = Number(between[1])
    const high = Number(between[2])
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null
    return { low: Math.min(low, high), high: Math.max(low, high), text: raw }
  }
  const bounded = BOUNDED.exec(raw)
  if (bounded) {
    const value = Number(bounded[2])
    if (!Number.isFinite(value)) return null
    if (bounded[1] === '<' || bounded[1] === '≤') return { low: null, high: value, text: raw }
    return { low: value, high: null, text: raw }
  }
  return null
}

/**
 * Compare a value against a range.
 * @param {number|null} value - numeric value.
 * @param {{low?: number|null, high?: number|null}|null} ref - range.
 * @param {number} [margin] - how far past the edge counts as plainly abnormal.
 * @returns {'H'|'L'|'HH'|'LL'|null} flag.
 */
export function flagFor(value, ref, margin = 0.5) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || !ref) return null
  const number = Number(value)
  const low = Number.isFinite(ref.low) ? ref.low : null
  const high = Number.isFinite(ref.high) ? ref.high : null
  if (high !== null && number > high) {
    const span = high !== null && low !== null && high > low ? high - low : Math.abs(high) || 1
    return number > high + span * margin ? 'HH' : 'H'
  }
  if (low !== null && number < low) {
    const span = high !== null && low !== null && high > low ? high - low : Math.abs(low) || 1
    return number < low - span * margin ? 'LL' : 'L'
  }
  return null
}

/**
 * Whether a qualitative result is a finding.
 * @param {string} text - e.g. "阳性", "阴性", "未见明显异常".
 * @param {{positiveMeaning?: 'abnormal'|'normal'|'unknown'}} [meta] - analyte hints.
 * @returns {boolean|null} true abnormal, false normal, null unknown.
 */
export function qualitativeFlag(text, meta = {}) {
  const value = String(text ?? '').trim()
  if (value.length === 0) return null
  const negative = /^(阴性|-|正常|未见异常|未见明显异常|未闻及|无)$/.test(value)
  const positive = /^(阳性|\+|\+\+|\+\+\+|弱阳性|±|可疑|异常)$/.test(value)
  if (negative) return false
  if (positive) return meta.positiveMeaning === 'normal' ? false : true
  return null
}
