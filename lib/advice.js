/**
 * Closing the loop on advice.
 *
 * An advice nobody follows up is a fortune cookie. So every piece of advice the
 * review hands out becomes a record: what was said, on what numbers it was based
 * (the baseline), and when it should be looked at again. The next measurement
 * then gets judged against that baseline, and the advice retires itself once the
 * number is back in range.
 *
 * Judging is deterministic here too. The model may phrase the result; it may not
 * decide whether the value improved.
 * @module dsh-healthy/advice
 */

import { newRecordId } from './ids.js'
import { baseRecord } from './records.js'
import { RECHECK_DAYS, analyteSeries } from './insight.js'

/** How bad a flag is, for comparing two measurements. */
const SEVERITY = { HH: 2, LL: 2, H: 1, L: 1 }

/**
 * @param {string|null} flag - H/L/HH/LL/null.
 * @returns {number} comparable severity.
 */
export function severityOf(flag) {
  return SEVERITY[flag] ?? 0
}

/**
 * The numbers an advice was based on, captured at the moment it was given.
 * @param {string[]} cite - analyte ids.
 * @param {object[]} records - visible records.
 * @returns {object} analyte id -> { value, date, flag }.
 */
export function captureBaseline(cite, records) {
  const baseline = {}
  for (const analyte of cite) {
    const series = analyteSeries(records, analyte)
    if (!series.latest) continue
    baseline[analyte] = {
      value: series.latest.value,
      date: series.latest.effective_on,
      flag: series.latest.flag ?? null,
      ref: series.latest.ref ?? null,
    }
  }
  return baseline
}

/**
 * When this advice should be revisited: the shortest recheck interval among the
 * values it cites, measured from the baseline date.
 * @param {object} baseline - analyte id -> { date }.
 * @param {string[]} cite - analyte ids.
 * @returns {string|null} YYYY-MM-DD, or null when nothing has a known interval.
 */
export function dueOn(baseline, cite) {
  let earliest = null
  for (const analyte of cite) {
    const point = baseline[analyte]
    const days = RECHECK_DAYS[analyte]
    if (!point || !days) continue
    const due = new Date(point.date)
    due.setDate(due.getDate() + days)
    const iso = due.toISOString().slice(0, 10)
    if (earliest === null || iso < earliest) earliest = iso
  }
  return earliest
}

/**
 * @param {object} advice - one advice from the rule engine.
 * @param {object} context - who/where/when, plus the records to baseline against.
 * @returns {object} an advice record.
 */
export function adviceRecord(advice, context) {
  const baseline = captureBaseline(advice.cite, context.records ?? [])
  return {
    id: newRecordId(),
    ...baseRecord(context),
    kind: 'advice',
    rule_id: advice.rule_id,
    level: advice.level,
    advice: advice.advice,
    cite: advice.cite,
    baseline,
    due_on: dueOn(baseline, advice.cite),
    resolved_on: null,
  }
}

/**
 * Judge one advice against what has been measured since.
 * @param {object} advice - advice record.
 * @param {object[]} records - visible records.
 * @param {string} today - YYYY-MM-DD.
 * @returns {{state: string, changes: object[], past_due: boolean, resolved: boolean}} judgement.
 */
export function judgeAdvice(advice, records, today) {
  const cite = Array.isArray(advice.cite) ? advice.cite : []
  const baseline = advice.baseline ?? {}
  const changes = []
  let measured = false

  for (const analyte of cite) {
    const series = analyteSeries(records, analyte)
    const latest = series.latest
    const base = baseline[analyte]
    if (!latest) continue
    if (base && latest.effective_on <= base.date) continue
    measured = true
    changes.push({
      analyte,
      name: series.analyte.zh || analyte,
      from: base ? base.value : null,
      from_date: base ? base.date : null,
      to: latest.value,
      to_date: latest.effective_on,
      flag: latest.flag ?? null,
      severity_before: base ? severityOf(base.flag) : 0,
      severity_now: severityOf(latest.flag),
      overshoot_before: base ? overshoot(base.value, base.ref) : 0,
      overshoot_now: overshoot(latest.value, latest.ref),
    })
  }

  const pastDue = Boolean(advice.due_on) && advice.due_on <= today
  if (!measured) {
    return { state: pastDue ? 'overdue' : 'waiting', changes, past_due: pastDue, resolved: false }
  }

  const allInRange = changes.every((change) => change.severity_now === 0 && change.flag === null)
  if (allInRange) return { state: 'resolved', changes, past_due: pastDue, resolved: true }

  const worse = changes.some((change) => change.severity_now > change.severity_before
    || (change.severity_now === change.severity_before && change.overshoot_now > change.overshoot_before))
  const better = changes.some((change) => change.severity_now < change.severity_before
    || (change.severity_now === change.severity_before && change.overshoot_now < change.overshoot_before))
  if (worse) return { state: 'worse', changes, past_due: pastDue, resolved: false }
  if (better) return { state: 'improved', changes, past_due: pastDue, resolved: false }
  return { state: 'unchanged', changes, past_due: pastDue, resolved: false }
}

/**
 * How far outside the reference range a value sits: 0 when inside.
 *
 * Two values can both be flagged H and still be moving in opposite directions;
 * the overshoot is what tells "still high but closer" from "still high and worse".
 * @param {number} value - measured value.
 * @param {object|null} ref - reference range.
 * @returns {number} overshoot in the analyte's own unit.
 */
export function overshoot(value, ref) {
  if (typeof value !== 'number') return 0
  const high = typeof ref?.high === 'number' ? ref.high : null
  const low = typeof ref?.low === 'number' ? ref.low : null
  if (high !== null && value > high) return value - high
  if (low !== null && value < low) return low - value
  return 0
}

/** One line describing what changed, for the review. */
export const STATE_LABELS = {
  waiting: '还没有新数据',
  overdue: '该复查了但还没有数据',
  resolved: '已回到参考区间',
  improved: '在好转',
  unchanged: '没有变化',
  worse: '比上次更差',
}

/**
 * Describe the change behind a judgement in one line.
 * @param {object} judgement - from {@link judgeAdvice}.
 * @returns {string} e.g. "低密度脂蛋白胆固醇 3.82（2026-08-12）→ 2.85（2027-02-01）".
 */
export function describeJudgement(judgement) {
  if (judgement.changes.length === 0) return STATE_LABELS[judgement.state] ?? judgement.state
  return judgement.changes.map((change) => {
    const from = change.from === null ? '—' : change.from + '（' + change.from_date + '）'
    return change.name + ' ' + from + ' → ' + change.to + '（' + change.to_date + '）'
  }).join('；')
}
