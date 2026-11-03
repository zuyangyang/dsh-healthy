/**
 * health_export: something to hand to a doctor, or to keep.
 * @module dsh-healthy/tools/export
 */

import { identityDefineTool } from './shared.js'
import { shanghaiDate } from '../util.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createExportTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_export',
    description: '导出一份能拿给医生看的东西：card（一页就诊摘要）、csv（测量数据表格）。'
      + '用户说"整理一下给医生看""打印出来"时用。',
    parameters: {
      format: { type: 'string', description: 'card（默认）| csv' },
      subject: { type: 'string', description: '导出谁的；不说就是当前说话的人。' },
      from: { type: 'string', description: '只导出这段之后的记录 YYYY-MM-DD。' },
      to: { type: 'string', description: '只导出这段之前的记录 YYYY-MM-DD。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      let records = view.all().filter((record) => record.status === 'active')
      if (args.subject && runtime.auth) {
        const member = runtime.auth.findMember(args.subject)
        if (member) records = records.filter((record) => record.subject === member.id)
      }
      if (args.from) records = records.filter((record) => record.effective_on >= args.from)
      if (args.to) records = records.filter((record) => record.effective_on <= args.to)
      const observations = records.filter((record) => record.kind === 'observation')
        .sort((a, b) => String(b.effective_on).localeCompare(String(a.effective_on)))

      if (String(args.format || 'card') === 'csv') {
        const header = '日期,项目,数值,单位,参考区间,异常'
        const rows = observations.map((record) => [
          record.effective_on, record.analyte_text, record.value ?? '', record.unit ?? '',
          record.ref?.text ?? '', record.flag ?? '',
        ].map((cell) => String(cell).replace(/,/g, '，')).join(','))
        return { ok: true, rows: rows.length, text: [header, ...rows].join(String.fromCharCode(10)) }
      }

      const profile = records.filter((record) => record.kind === 'profile').pop() ?? null
      const conditions = records.filter((record) => record.kind === 'condition')
      const meds = records.filter((record) => record.kind === 'medication')
      const allergies = records.filter((record) => record.kind === 'allergy')
      const family = records.filter((record) => record.kind === 'family_history')
      const abnormal = observations.filter((record) => record.flag).slice(0, 12)

      const lines = [
        '# 就诊摘要（' + shanghaiDate(runtime.now()) + ' 生成）',
        '',
        '## 基本情况',
        profile ? '- 性别：' + (profile.sex === 'male' ? '男' : profile.sex === 'female' ? '女' : '未记录')
          + (profile.birth_year ? '，出生 ' + profile.birth_year + ' 年' : '')
          + (profile.blood_type ? '，血型 ' + profile.blood_type : '') : '- 基本资料未记录',
        '',
        '## 已知疾病',
        ...(conditions.length > 0 ? conditions.map((record) => '- ' + record.name + (record.since ? '（' + record.since + ' 起）' : '')) : ['- 无记录']),
        '',
        '## 在吃的药',
        ...(meds.length > 0 ? meds.map((record) => '- ' + record.name + (record.dose ? ' ' + record.dose : '') + (record.frequency ? '，' + record.frequency : '')) : ['- 无记录']),
        '',
        '## 过敏',
        ...(allergies.length > 0 ? allergies.map((record) => '- ' + record.substance + (record.reaction ? '：' + record.reaction : '')) : ['- 无记录']),
        '',
        '## 家族史',
        ...(family.length > 0 ? family.map((record) => '- ' + record.relative + '：' + record.condition) : ['- 无记录']),
        '',
        '## 最近异常指标',
        ...(abnormal.length > 0 ? abnormal.map((record) =>
          '- ' + record.effective_on + ' ' + record.analyte_text + ' ' + record.value
          + (record.unit ? ' ' + record.unit : '') + (record.ref?.text ? '（参考 ' + record.ref.text + '）' : ''))
          : ['- 无']),
        '',
        '## 数据来源',
        '- 来自家庭健康档案，共 ' + records.length + ' 条记录；异常项目的参考区间取自体检报告原文。',
      ]
      return { ok: true, records: records.length, text: lines.join(String.fromCharCode(10)) }
    },
  })
}
