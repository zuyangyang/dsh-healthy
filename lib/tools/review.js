/**
 * health_review: the periodic look-back, and the red flags that never wait.
 * @module dsh-healthy/tools/review
 */

import { advicesFor, describeSeries, rechecksDue, redFlags } from '../insight.js'
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
    description: '给一份健康回顾：红旗（要不要马上就医）、异常指标、该复查的项目、能做的小建议、'
      + '最近的症状与用药。用户问"最近身体怎么样""有没有要注意的"时用。',
    parameters: {
      subject: { type: 'string', description: '看谁的；不说就是当前说话的人。' },
      focus: { type: 'string', description: '只看某一块：flags|advice|recheck|symptoms|all，默认 all。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      let records = view.all()
      if (args.subject && runtime.auth) {
        const member = runtime.auth.findMember(args.subject)
        if (member) records = records.filter((record) => record.subject === member.id)
      }
      const today = shanghaiDate(runtime.now())
      const focus = String(args.focus || 'all')
      const flags = redFlags(records)
      const advices = advicesFor(records)
      const due = rechecksDue(records, today)
      const abnormal = records.filter((record) => record.flag && record.status === 'active')
      const symptoms = records.filter((record) => record.kind === 'symptom' && record.status === 'active')
        .sort((a, b) => String(b.effective_on).localeCompare(String(a.effective_on))).slice(0, 5)
      const meds = records.filter((record) => record.kind === 'medication' && record.status === 'active')

      const sections = []
      if (flags.length > 0) {
        sections.push(['## 先看这个', ...flags.map((flag) => '- ' + (flag.level === 'urgent' ? '**马上就医**：' : '要去看医生：') + flag.reason)].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'flags') && abnormal.length > 0) {
        sections.push(['## 超出参考区间的指标', ...abnormal.slice(0, 10).map((record) =>
          '- ' + describeSeries(record.analyte, records))].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'recheck') && due.length > 0) {
        sections.push(['## 该复查了', ...due.map((item) => '- ' + item.name + '：上次 ' + item.last_on + '，建议 ' + item.due_on + ' 前复查')].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'advice') && advices.length > 0) {
        sections.push(['## 能做的小事', ...advices.map((item) => '- ' + item.advice)].join(String.fromCharCode(10)))
      }
      if ((focus === 'all' || focus === 'symptoms') && symptoms.length > 0) {
        sections.push(['## 最近说过的不舒服', ...symptoms.map((record) => '- ' + record.effective_on + ' ' + record.complaint)].join(String.fromCharCode(10)))
      }
      if (meds.length > 0) {
        sections.push(['## 在吃的药', ...meds.map((record) => '- ' + record.name + (record.dose ? ' ' + record.dose : '') + (record.frequency ? '，' + record.frequency : ''))].join(String.fromCharCode(10)))
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
        text: sections.join(String.fromCharCode(10) + String.fromCharCode(10)),
      }
    },
  })
}
