/**
 * health_measure: record measurements - lab values, blood pressure, weight.
 * @module dsh-healthy/tools/measure
 */

import { parseMeasurementLine } from '../parsers/line.js'
import { profileOf, sexOf } from '../profile.js'
import { observationRecord } from '../records.js'
import { resolveSubject } from '../subjects.js'
import { describeObservation, fail, identityDefineTool } from './shared.js'
import { shanghaiDate } from '../util.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createMeasureTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_measure',
    description: '记录一次测量：化验结果、血压、体重、体温、腰围。每行一项，格式「名称 数值 单位 参考区间」，'
      + '例如「低密度脂蛋白胆固醇 2.85 mmol/L 0-3.37」「血压 138/88 mmHg」。'
      + '整份体检报告用 health_report；口头描述的症状用 health_record。',
    parameters: {
      subject: { type: 'string', description: '这项测量属于谁：成员表里的名字，比如"妈"。不说就是当前说话的人。' },
      date: { type: 'string', description: '测量/报告日期 YYYY-MM-DD；不说就是今天。' },
      lines: { type: 'array', description: '每行一项测量，格式见工具说明。' },
      text: { type: 'string', description: '整段文本（报告片段或粘贴内容），插件按行解析。lines 和 text 给一个即可。' },
      report_id: { type: 'string', description: '这批数据来自哪份报告，同一份报告传同一个值。' },
      private: { type: 'boolean', description: '标记为敏感记录（只有本人在被显式授权时才可见）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      const who = resolveSubject(runtime, exec, view, args.subject)
      const date = args.date || shanghaiDate(runtime.now())
      const sourceLines = []
      if (Array.isArray(args.lines)) sourceLines.push(...args.lines)
      if (typeof args.text === 'string' && args.text.trim().length > 0) {
        sourceLines.push(...args.text.split(/\r?\n/))
      }
      if (sourceLines.length === 0) fail('没有可记录的测量：给 lines（每行一项）或 text（整段文本）')

      const profile = profileOf(view.all(), who.ownerId)
      const sex = sexOf(profile)
      const parsed = []
      const skipped = []
      for (const line of sourceLines) {
        if (String(line).trim().length === 0) continue
        const rows = parseMeasurementLine(line, { sex })
        if (rows.length === 0) { skipped.push(String(line).trim()); continue }
        for (const row of rows) parsed.push({ ...row, raw_text: String(line).trim() })
      }
      if (parsed.length === 0) fail('这几行都没认出来，改成「名称 数值 单位 参考区间」再试一次')

      const seen = new Set(view.all().map((record) => [
        record.kind, record.subject, record.analyte, record.effective_on, record.value, record.report_id,
      ].join('|')))
      const fresh = []
      const duplicates = []
      for (const row of parsed) {
        const key = ['observation', who.ownerId, row.analyte, date, row.value, args.report_id || null].join('|')
        if (seen.has(key)) { duplicates.push(row); continue }
        seen.add(key)
        fresh.push(observationRecord(row, {
          ownerId: who.ownerId,
          ownerName: who.ownerName,
          enteredBy: view.actorName(),
          effectiveOn: date,
          source: args.report_id ? 'report' : 'self_measured',
          reportId: args.report_id || null,
          sensitivity: args.private ? 'private' : 'normal',
          pending: who.anonymous,
          now: runtime.now,
        }))
      }

      if (fresh.length > 0) runtime.persist(fresh)

      const lines = fresh.map((record) => '- ' + describeObservation(record))
      const abnormal = fresh.filter((record) => record.flag)
      return {
        ok: true,
        recorded: fresh.length,
        duplicates: duplicates.map((row) => row.analyte_text),
        skipped,
        abnormal: abnormal.map((record) => record.analyte_text),
        text: [
          '记了 ' + fresh.length + ' 项' + (who.member ? '（' + who.ownerName + '）' : '')
            + '，日期 ' + date + '。',
          ...lines,
          abnormal.length > 0 ? '其中 ' + abnormal.length + ' 项超出参考区间：' + abnormal.map((r) => r.analyte_text).join('、') : '',
          duplicates.length > 0 ? '有 ' + duplicates.length + ' 项和已有记录完全一样，跳过了。' : '',
          skipped.length > 0 ? '这几行没认出来，没记：' + skipped.join(' / ') : '',
        ].filter(Boolean).join(String.fromCharCode(10)),
      }
    },
  })
}
