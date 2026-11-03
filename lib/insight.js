/**
 * Turning a pile of records into something a person can act on.
 *
 * Two rules govern this file:
 *   1. the judgement is deterministic - a rule looks at records and returns a
 *      level; the model is only allowed to choose the wording
 *   2. nothing here diagnoses. The strongest output is "go to a hospital now",
 *      never "you have X".
 * @module dsh-healthy/insight
 */

import { byId, lookup } from './analytes.js'

/**
 * @param {object[]} records - visible records.
 * @param {string} analyteId - analyte to follow.
 * @returns {{analyte: object, points: object[], delta: number|null, previous: object|null}} series.
 */
export function analyteSeries(records, analyteId) {
  const points = records
    .filter((record) => record.kind === 'observation' && record.analyte === analyteId && record.status === 'active')
    .filter((record) => typeof record.value === 'number')
    .sort((a, b) => String(a.effective_on).localeCompare(String(b.effective_on)))
  const latest = points[points.length - 1] ?? null
  const previous = points[points.length - 2] ?? null
  return {
    analyte: byId(analyteId) ?? { id: analyteId, zh: analyteId },
    points,
    latest,
    previous,
    delta: latest && previous ? latest.value - previous.value : null,
  }
}

/** Complaint keywords that mean "stop and go to a hospital". */
const URGENT_COMPLAINTS = [
  ['胸痛', '胸口疼', '胸前疼', '胸闷', '喘不上气', '呼吸困难', '晕倒', '晕厥', '意识不清', '出冷汗'],
  ['说话不清', '口角歪斜', '嘴歪', '一侧无力', '半边麻', '看不清东西'],
]

/**
 * Red-flag triage. Deterministic on purpose: a missed stroke is not a place
 * for a language model's judgement.
 * @param {object[]} records - visible records.
 * @returns {{level: string, reason: string}[]} findings.
 */
export function redFlags(records) {
  const out = []
  const active = records.filter((record) => record.status === 'active')
  const today = new Date()

  for (const record of active.filter((item) => item.kind === 'symptom')) {
    const text = String(record.complaint ?? '')
    for (const phrase of URGENT_COMPLAINTS.flat()) {
      if (text.includes(phrase)) {
        out.push({ level: 'urgent', reason: record.effective_on + ' 记录的「' + text + '」需要马上就医' })
        break
      }
    }
  }

  const latestOf = (analyte) => analyteSeries(active, analyte).latest
  const sbp = latestOf('sbp')
  const dbp = latestOf('dbp')
  if (sbp && dbp && (sbp.value >= 180 || dbp.value >= 110)) {
    out.push({ level: 'urgent', reason: '血压 ' + sbp.value + '/' + dbp.value + ' mmHg 已经是重度升高（' + sbp.effective_on + '）' })
  } else if (sbp && sbp.value >= 140) {
    out.push({ level: 'see_doctor', reason: '收缩压 ' + sbp.value + ' mmHg 偏高（' + sbp.effective_on + '）' })
  }

  const glucose = latestOf('fpg')
  if (glucose) {
    if (glucose.value >= 7) out.push({ level: 'see_doctor', reason: '空腹血糖 ' + glucose.value + ' mmol/L 达到糖尿病诊断线，需要去医院确认' })
    else if (glucose.value >= 6.1) out.push({ level: 'attention', reason: '空腹血糖 ' + glucose.value + ' mmol/L 偏高（空腹血糖受损）' })
    else if (glucose.value < 3.9) out.push({ level: 'see_doctor', reason: '空腹血糖 ' + glucose.value + ' mmol/L 偏低' })
  }

  const hba1c = latestOf('hba1c')
  if (hba1c && hba1c.value >= 6.5) {
    out.push({ level: 'see_doctor', reason: '糖化血红蛋白 ' + hba1c.value + '%，超过 6.5% 这条线' })
  }

  for (const analyte of ['alt', 'ast']) {
    const item = latestOf(analyte)
    const high = item?.ref?.high
    if (item && high && item.value > high * 2) {
      out.push({ level: 'see_doctor', reason: (byId(analyte)?.zh ?? analyte) + ' ' + item.value + ' 超过参考上限两倍以上' })
    }
  }

  const protein = active.find((record) => record.analyte === 'u_pro' && record.qualitative && record.flag)
  if (protein) out.push({ level: 'see_doctor', reason: '尿蛋白阳性（' + protein.effective_on + '），需要复查' })

  const blood = active.find((record) => record.analyte === 'u_bld' && record.qualitative && record.flag)
  if (blood) out.push({ level: 'see_doctor', reason: '尿隐血阳性（' + blood.effective_on + '）' })

  // Weight loss without trying: the one number that needs two measurements.
  const weights = active.filter((record) => record.analyte === 'weight' && typeof record.value === 'number')
    .sort((a, b) => String(a.effective_on).localeCompare(String(b.effective_on)))
  if (weights.length >= 2) {
    const first = weights[0]
    const last = weights[weights.length - 1]
    const days = (new Date(last.effective_on) - new Date(first.effective_on)) / 86400000
    if (days >= 60 && days <= 200 && last.value < first.value * 0.95) {
      out.push({ level: 'see_doctor', reason: '约 ' + Math.round(days / 30) + ' 个月内体重下降超过 5%，建议查一下原因' })
    }
  }

  // A stale urgent symptom is still worth mentioning, but only once.
  void today
  return out
}

/** Levels, strongest first. */
export const LEVEL_ORDER = { urgent: 0, see_doctor: 1, attention: 2, info: 3 }

/**
 * Recheck intervals in days, by analyte. Sources: general practice guidance for
 * the common Chinese checkup panels; deliberately conservative.
 */
export const RECHECK_DAYS = {
  ldl_c: 180, tc: 180, tg: 180,
  fpg: 90, hba1c: 90,
  tsh: 180, ft3: 180, ft4: 180,
  alt: 90, ast: 90, ggt: 90,
  u_pro: 90, u_bld: 90,
  crea: 180, ua: 180,
  sbp: 30, dbp: 30,
}

/**
 * What is due for a recheck.
 * @param {object[]} records - visible records.
 * @param {string} today - YYYY-MM-DD.
 * @returns {{analyte: string, name: string, last_on: string, due_on: string, overdue: boolean}[]} due items.
 */
export function rechecksDue(records, today) {
  const out = []
  for (const [analyte, days] of Object.entries(RECHECK_DAYS)) {
    const series = analyteSeries(records, analyte)
    const latest = series.latest
    if (!latest) continue
    const due = new Date(latest.effective_on)
    due.setDate(due.getDate() + days)
    const dueOn = due.toISOString().slice(0, 10)
    if (dueOn <= today) {
      out.push({
        analyte,
        name: byId(analyte)?.zh ?? analyte,
        last_on: latest.effective_on,
        due_on: dueOn,
        overdue: true,
      })
    }
  }
  return out
}

/** Advice rules: each returns null or one advice record. */
const RULES = [
  {
    id: 'lipid_ldl_high',
    level: 'attention',
    when: (series) => series('ldl_c')?.latest?.flag?.startsWith('H'),
    text: () => '低密度脂蛋白胆固醇偏高。先减油、减精制碳水、每周至少 150 分钟中等强度运动，3-6 个月复查血脂。',
    cite: () => ['ldl_c'],
  },
  {
    id: 'lipid_tg_high',
    level: 'attention',
    when: (series) => series('tg')?.latest?.flag?.startsWith('H'),
    text: () => '甘油三酯偏高，和主食、酒精、体重关系最大。先控酒控糖，3 个月复查。',
    cite: () => ['tg'],
  },
  {
    id: 'glucose_impaired',
    level: 'attention',
    when: (series) => {
      const item = series('fpg')?.latest
      return item && item.value >= 6.1 && item.value < 7
    },
    text: () => '空腹血糖落在 6.1-7.0 之间，属于空腹血糖受损。建议做一次糖耐量，同时开始控制体重和主食。',
    cite: () => ['fpg'],
  },
  {
    id: 'bp_elevated',
    level: 'attention',
    when: (series) => series('sbp')?.latest?.flag?.startsWith('H'),
    text: () => '血压偏高。家里如果有血压计，连续测 7 天早晚各一次再判断；同时减盐、控制体重。',
    cite: () => ['sbp', 'dbp'],
  },
  {
    id: 'liver_mild',
    level: 'info',
    when: (series) => {
      const item = series('alt')?.latest
      return item && item.flag && item.ref?.high && item.value <= item.ref.high * 2
    },
    text: () => '转氨酶轻度升高，常见于脂肪肝、饮酒、熬夜或近期用药。1-3 个月复查，别喝酒。',
    cite: () => ['alt', 'ast'],
  },
  {
    id: 'urate_high',
    level: 'info',
    when: (series) => series('ua')?.latest?.flag?.startsWith('H'),
    text: () => '尿酸偏高。少喝含糖饮料和酒，少吃动物内脏和浓汤，多喝水；有痛风发作过就要看医生。',
    cite: () => ['ua'],
  },
  {
    id: 'bmi_high',
    level: 'attention',
    when: (series) => {
      const item = series('bmi')?.latest
      return item && item.value >= 24
    },
    text: () => '体重指数偏高。先把体重降 5%，血压、血糖、血脂往往一起改善。',
    cite: () => ['bmi', 'weight'],
  },
  {
    id: 'thyroid_abnormal',
    level: 'see_doctor',
    when: (series) => ['tsh', 'ft3', 'ft4'].some((id) => series(id)?.latest?.flag),
    text: () => '甲状腺功能有一项不在参考区间内。甲功异常需要医生结合症状判断，建议内分泌科看一下。',
    cite: () => ['tsh', 'ft3', 'ft4'],
  },
]

/**
 * Deterministic advice from the current records.
 * @param {object[]} records - visible records.
 * @returns {{rule_id: string, level: string, advice: string, cite: string[]}[]} advice.
 */
export function advicesFor(records) {
  const cache = new Map()
  const series = (analyte) => {
    if (!cache.has(analyte)) cache.set(analyte, analyteSeries(records, analyte))
    return cache.get(analyte)
  }
  const out = []
  for (const rule of RULES) {
    let hit = false
    try {
      hit = Boolean(rule.when(series))
    } catch {
      hit = false
    }
    if (hit) out.push({ rule_id: rule.id, level: rule.level, advice: rule.text(), cite: rule.cite() })
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

/**
 * Describe a series in one line: value, change, and whether it is still out.
 * @param {string} analyteId - analyte.
 * @param {object[]} records - visible records.
 * @returns {string} description.
 */
export function describeSeries(analyteId, records) {
  const series = analyteSeries(records, analyteId)
  const name = series.analyte.zh || analyteId
  if (!series.latest) return name + '：没有记录'
  const unit = series.latest.unit ? ' ' + series.latest.unit : ''
  const ref = series.latest.ref?.text ? '（参考 ' + series.latest.ref.text + '）' : ''
  const change = series.delta === null
    ? ''
    : '，比上次 ' + (series.delta > 0 ? '+' : '') + series.delta.toFixed(2) + '（' + series.previous.effective_on + '）'
  const flag = series.latest.flag ? ' ' + series.latest.flag : ''
  return name + '：' + series.latest.value + unit + ref + '（' + series.latest.effective_on + change + '）' + flag
}

export { lookup }
