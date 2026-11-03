/**
 * Parse a single measurement line, the shape health_measure accepts.
 *
 * The model is asked for lines like "低密度脂蛋白胆固醇 2.85 mmol/L 0-3.37" or
 * "血压 138/88 mmHg" - one measurement per line, in the order the report prints
 * them. This is the same reader the report parser uses, minus the row anchors.
 * @module dsh-healthy/parsers/line
 */

import { lookup } from '../analytes.js'
import { normalizeLine } from '../normalize.js'
import { buildObservation, classifyCell, readCells } from './report.js'

const NUMBER = /^-?\d+(?:\.\d+)?$/
const QUALITATIVE = /^(阴性|阳性|弱阳性|可疑|\+|\+\+|\+\+\+|±|未见|正常|异常|-)$/
const BP = /^(血压|BP)?\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mmHg)?$/

/**
 * Cut a line into a name and the cells that follow it.
 * @param {string} line - normalized line.
 * @returns {{name: string, cells: string[]}|null} split, or null when unusable.
 */
export function splitLine(line) {
  const tokens = normalizeLine(line).split(' ').filter((token) => token.length > 0)
  if (tokens.length === 0) return null
  let cut = tokens.findIndex((token) => NUMBER.test(token) || QUALITATIVE.test(token) || BP.test(token))
  if (cut <= 0) {
    // Names can contain spaces ("平均红细胞血红蛋白浓度 (MCHC)"): find the first
    // token that is obviously a value instead.
    cut = tokens.findIndex((token) => /\d/.test(token) || QUALITATIVE.test(token))
    if (cut <= 0) return null
  }
  return { name: tokens.slice(0, cut).join(''), cells: tokens.slice(cut) }
}

/**
 * @param {string} line - one measurement.
 * @param {{sex?: 'male'|'female'|null}} [options] - context.
 * @returns {object[]} zero or more observations (blood pressure yields two).
 */
export function parseMeasurementLine(line, options = {}) {
  const text = normalizeLine(line)
  const bp = BP.exec(text.replace(/^(血压|BP)\s*/, ''))
  if (bp) {
    const context = { sex: options.sex ?? null }
    const sys = buildObservation(lookup('收缩压'), '收缩压', { value: Number(bp[2]), unit: 'mmHg', ref: null, qualitative: false }, context)
    const dia = buildObservation(lookup('舒张压'), '舒张压', { value: Number(bp[3]), unit: 'mmHg', ref: null, qualitative: false }, context)
    return [sys, dia]
  }

  const split = splitLine(text)
  if (!split) return []
  const entry = lookup(split.name) || lookup(split.name.replace(/\(.*\)$/, ''))
  const read = readCells(split.cells, entry)
  if (!entry) {
    // Unknown analyte: keep it rather than drop it, and say so.
    return [{
      kind: 'observation',
      analyte: null,
      analyte_text: split.name,
      analyte_abbr: null,
      category: null,
      value: read.value,
      qualitative: read.qualitative,
      unit: read.unit,
      ref: read.ref,
      ref_source: read.ref ? 'report' : null,
      flag: null,
      warnings: ['词典里没有「' + split.name + '」，先原样保存'],
      needs_review: true,
    }]
  }
  return [buildObservation(entry, split.name, read, { sex: options.sex ?? null })]
}

export { classifyCell }
