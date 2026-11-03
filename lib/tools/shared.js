/**
 * Shared helpers for the health tools.
 * @module dsh-healthy/tools/shared
 */

export const identityDefineTool = (definition) => definition

/**
 * @param {string} message - what went wrong, in the user's language.
 * @returns {never} always throws.
 */
export function fail(message) {
  throw new Error(message)
}

/**
 * Format one value for a chat line.
 * @param {object} record - observation record.
 * @returns {string} e.g. "2.85 mmol/L".
 */
export function formatValue(record) {
  if (record.value === null || record.value === undefined) return '未记录'
  if (typeof record.value === 'string') return record.value
  return String(record.value) + (record.unit ? ' ' + record.unit : '')
}

/**
 * One observation as a chat line.
 * @param {object} record - observation record.
 * @returns {string} e.g. "低密度脂蛋白胆固醇 2.85 mmol/L（参考 0-3.37）↑".
 */
export function describeObservation(record) {
  const parts = [record.analyte_text || record.analyte || '未知项目', formatValue(record)]
  if (record.ref?.text) parts.push('（参考 ' + record.ref.text + '）')
  const flag = record.flag === 'H' ? '偏高' : record.flag === 'L' ? '偏低'
    : record.flag === 'HH' ? '明显偏高' : record.flag === 'LL' ? '明显偏低' : ''
  if (flag) parts.push(' ' + flag)
  return parts.join('')
}

/**
 * @param {object} record - any record.
 * @returns {string} short human label.
 */
export function describeRecord(record) {
  if (record.kind === 'observation') return describeObservation(record)
  if (record.kind === 'finding') {
    return record.department + ' ' + record.item_text + '：' + (record.finding || '未记录')
  }
  if (record.kind === 'document') return '报告《' + record.title + '》'
  const name = record.name || record.complaint || record.substance || record.vaccine || record.topic || record.reason
  return record.kind + (name ? '：' + name : '')
}
