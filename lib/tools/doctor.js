/**
 * health_doctor: the self-check. What is broken, what is unreadable, what is
 * still waiting for a human.
 * @module dsh-healthy/tools/doctor
 */

import { identityDefineTool } from './shared.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createDoctorTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_doctor',
    description: '自检健康档案：一共多少条、有没有坏的、有没有认不出来的项目、有多少条还没归属、'
      + '哪些指标超出参考区间还没复查。用户问"档案里有什么问题"或你觉得数据不对劲时用。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(_args, exec) {
      const view = runtime.view(exec)
      const records = view.all()
      const byKind = {}
      for (const record of records) byKind[record.kind] = (byKind[record.kind] || 0) + 1
      const review = records.filter((record) => record.needs_review)
      const abnormal = records.filter((record) => record.flag)
      const pending = records.filter((record) => record.pending || record.ownerId === 'default')
      const skipped = records.filter((record) => record.kind === 'finding' && record.skipped)
      const drafts = runtime.drafts.all().length
      const stats = runtime.stats()

      const lines = [
        '健康档案：' + records.length + ' 条有效记录' + (stats.quarantined > 0 ? '，' + stats.quarantined + ' 行损坏已隔离' : ''),
        '分类：' + Object.entries(byKind).map(([kind, count]) => kind + ' ' + count).join('、'),
        '超出参考区间：' + abnormal.length + ' 条' + (abnormal.length > 0 ? '（' + [...new Set(abnormal.map((r) => r.analyte_text))].join('、') + '）' : ''),
        '认不出来的项目：' + review.length + ' 条' + (review.length > 0 ? '（' + [...new Set(review.map((r) => r.analyte_text))].slice(0, 8).join('、') + '）' : ''),
        '未归属记录：' + pending.length + ' 条',
        '放弃检查的项目：' + skipped.length + ' 项',
        '没填完的记录：' + drafts + ' 条' + (drafts > 0 ? '（问用户一句就能补全）' : ''),
      ]
      return {
        ok: true,
        records: records.length,
        quarantined: stats.quarantined,
        abnormal: abnormal.length,
        needs_review: review.length,
        pending: pending.length,
        text: lines.join(String.fromCharCode(10)),
      }
    },
  })
}
