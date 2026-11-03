/**
 * health_review: the periodic look-back, and the red flags that never wait.
 *
 * The review is also where advice closes its loop: what it recommends becomes a
 * record, and every later review judges that record against the newest numbers
 * until the value is back in range.
 * @module dsh-healthy/tools/review
 */

import { adviceRecord, describeJudgement, judgeAdvice, STATE_LABELS } from '../advice.js'
import { advicesFor, describeSeries, rechecksDue, redFlags } from '../insight.js'
import { resolveSubject } from '../subjects.js'
import { identityDefineTool } from './shared.js'
import { shanghaiDate } from '../util.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createReviewTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_review',
    description: '给一份健康回顾：红旗（要不要马上就医）、异常指标、该复查的项目、建议和它们的进展、'
      + '最近的症状与用药。用户问"最近身体怎么样""有没有要注意的""上次说的那个怎么样了"时用。'
      + '新的建议会被记下来，下次复查时自动对账。',
    parameters: {
      subject: { type: 'string', description: '看谁的；不说就是当前说话的人。' },
      focus: { type: 'string', description: '只看某一块：flags|advice|recheck|symptoms|all，默认 all。' },
      save: { type: 'boolean', description: '是否把这次给出的新建议记进档案（默认 true）；只想看看就传 false。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      const who = resolveSubject(runtime, exec, view, args.subject)
      const records = view.all().filter((record) => record.subject === who.ownerId)
      const today = shanghaiDate(runtime.now())
      const focus = String(args.focus || 'all')

      const flags = redFlags(records)
      const advices = advicesFor(records)
      const due = rechecksDue(records, today)
      const abnormal = records.filter((record) => record.flag && record.status === 'active')
      const symptoms = records.filter((record) => record.kind === 'symptom' && record.status === 'active')
        .sort((a, b) => String(b.effective_on).localeCompare(String(a.effective_on))).slice(0, 5)
      const meds = records.filter((record) => record.kind === 'medication' && record.status === 'active')

      // 1. Remember the new advice, so a later review can judge it.
      const tracked = records.filter((record) => record.kind === 'advice' && record.status === 'active')
      const knownRules = new Set(tracked.map((record) => record.rule_id))
      const fresh = advices.filter((advice) => !knownRules.has(advice.rule_id))
      const saved = []
      if (args.save !== false && fresh.length > 0) {
        const context = {
          ownerId: who.ownerId,
          ownerName: who.ownerName,
          enteredBy: view.actorName(),
          effectiveOn: today,
          source: 'review',
          sensitivity: 'normal',
          pending: who.anonymous,
          now: runtime.now,
          records,
        }
        const created = fresh.map((advice) => adviceRecord(advice, context))
        runtime.persist(created)
        saved.push(...created)
      }

      // 2. Judge the standing advice, and retire the ones that came true.
      const judgement = []
      for (const record of tracked) {
        const verdict = judgeAdvice(record, records, today)
        judgement.push({ record, verdict })
        if (verdict.resolved) {
          runtime.revise(record.id, {
            status: 'resolved',
            resolved_on: today,
            resolved_by: verdict.changes.map((change) => change.analyte),
          }, { expectedVersion: record.version })
        }
      }

      const sections = []
      if (flags.length > 0) {
        sections.push(['## 先看这个', ...flags.map((flag) => '- '
          + (flag.level === 'urgent' ? '**马上就医**：' : '要去看医生：') + flag.reason)].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'flags') && abnormal.length > 0) {
        sections.push(['## 超出参考区间的指标', ...abnormal.slice(0, 10).map((record) =>
          '- ' + describeSeries(record.analyte, records))].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'recheck') && due.length > 0) {
        sections.push(['## 该复查了', ...due.map((item) => '- ' + item.name + '：上次 ' + item.last_on
          + '，建议 ' + item.due_on + ' 前复查')].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'advice') && judgement.length > 0) {
        const lines = judgement.map(({ record, verdict }) => '- ' + (record.advice.split('。')[0] ?? record.advice)
          + '（' + record.effective_on + ' 提出）：' + STATE_LABELS[verdict.state]
          + (verdict.changes.length > 0 ? ' —— ' + describeJudgement(verdict) : ''))
        sections.push(['## 建议追踪', ...lines].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'advice') && fresh.length > 0 && args.save !== false) {
        sections.push(['## 新记下的建议', ...saved.map((record) => '- ' + record.advice
          + (record.due_on ? '（' + record.due_on + ' 前复查）' : ''))].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'symptoms') && symptoms.length > 0) {
        sections.push(['## 最近说过的不舒服', ...symptoms.map((record) => '- ' + record.effective_on
          + ' ' + record.complaint)].join(String.fromCharCode(10)))
      }
      if (meds.length > 0) {
        sections.push(['## 在吃的药', ...meds.map((record) => '- ' + record.name
          + (record.dose ? ' ' + record.dose : '') + (record.frequency ? '，' + record.frequency : ''))].join(String.fromCharCode(10)))
      }
      if (sections.length === 0) {
        return { ok: true, text: '档案里没有需要提醒的异常。' + (records.length === 0 ? '（还没有任何记录）' : '') }
      }
      sections.push('我不是医生。以上是档案里记录的客观情况和建议，具体听医生的。')
      return {
        ok: true,
        flags: flags.length,
        abnormal: abnormal.length,
        due: due.length,
        advice: advices.length,
        saved: saved.length,
        tracked: judgement.filter(({ verdict }) => verdict.state === 'resolved').length,
        text: sections.join(String.fromCharCode(10) + String.fromCharCode(10)),
      }
    },
  })
}
