/**
 * health_report: take a whole checkup report, as text, in two steps.
 *
 * Preview first, because a misread decimal is silent: the model sees "65 rows"
 * and the person sees "3 项没认出来" - and only then does it write.
 * @module dsh-healthy/tools/report
 */

import { documentRecord, findingRecord, observationRecord } from '../records.js'
import { parseReport } from '../parsers/report.js'
import { profileOf, sexOf } from '../profile.js'
import { resolveSubject } from '../subjects.js'
import { fail, identityDefineTool } from './shared.js'
import { shanghaiDate } from '../util.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createReportTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_report',
    description: '导入一整份体检报告。先把报告内容（文本，照片请你自己先读成文字）传进来，mode=preview 看识别结果，'
      + '确认没问题再用 mode=commit 落盘。落盘时报告原文会一字不改地存下来。',
    parameters: {
      mode: { type: 'string', required: true, description: 'preview 预览 | commit 落盘' },
      subject: { type: 'string', description: '这份报告是谁的：成员表里的名字；不说就是当前说话的人。' },
      date: { type: 'string', description: '报告日期 YYYY-MM-DD。' },
      text: { type: 'string', required: true, description: '整份报告的文本（体检机构导出的文字或你自己 OCR 的结果）。' },
      institution: { type: 'string', description: '体检机构名称。' },
      report_id: { type: 'string', description: '这份报告的编号，不传就用「机构-日期」生成。' },
      private: { type: 'boolean', description: '标记为敏感记录。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const mode = String(args.mode || '').trim()
      if (mode !== 'preview' && mode !== 'commit') fail('mode 只能是 preview 或 commit')
      if (typeof args.text !== 'string' || args.text.trim().length === 0) fail('把报告文本放到 text 里再试')

      const view = runtime.view(exec)
      const who = resolveSubject(runtime, exec, view, args.subject)
      const date = args.date || shanghaiDate(runtime.now())
      const profile = profileOf(view.all(), who.ownerId)
      const parsed = parseReport(args.text, { sex: sexOf(profile), name: who.member?.name })

      if (parsed.items.length === 0 && parsed.findings.length === 0) {
        fail('这份文本里没有识别出任何体检项目。可能是抽取时表格结构丢了，'
          + '可以改用 health_measure，一行一项地传「名称 数值 单位 参考区间」')
      }

      const abnormal = parsed.items.filter((item) => item.flag)
      const unknown = parsed.items.filter((item) => !item.analyte)
      const reportId = args.report_id || [args.institution || '报告', date].join('-')

      if (mode === 'preview') {
        const lines = [
          '这份报告里识别到：' + parsed.items.length + ' 项测量，' + parsed.findings.length + ' 项体检所见。',
          '其中 ' + abnormal.length + ' 项超出参考区间：'
            + (abnormal.slice(0, 8).map((item) => item.analyte_text + ' ' + item.value + (item.flag === 'H' ? ' 偏高' : ' 偏低')).join('，') || '无'),
          unknown.length > 0 ? '有 ' + unknown.length + ' 项词典里没有，会原样保存：' + unknown.map((item) => item.analyte_text).join('、') : '',
          '报告日期 ' + date + '，归属 ' + who.ownerName + '。',
          '确认没问题就说"存吧"，我用 mode=commit 落盘（原文会一起存下来）。',
        ].filter(Boolean)
        return {
          ok: true,
          mode,
          date,
          observations: parsed.items.length,
          findings: parsed.findings.length,
          abnormal: abnormal.length,
          unknown: unknown.map((item) => item.analyte_text),
          text: lines.join(String.fromCharCode(10)),
        }
      }

      const context = {
        ownerId: who.ownerId,
        ownerName: who.ownerName,
        enteredBy: view.actorName(),
        effectiveOn: date,
        source: 'report',
        reportId,
        sensitivity: args.private ? 'private' : 'normal',
        pending: who.anonymous,
        now: runtime.now,
      }
      const existing = view.all()
      const seen = new Set(existing
        .filter((record) => record.report_id === reportId)
        .map((record) => record.analyte + '|' + record.value))
      const observations = parsed.items
        .filter((item) => !seen.has(item.analyte + '|' + item.value))
        .map((item) => observationRecord(item, context))
      const findings = parsed.findings
        .filter((finding) => !existing.some((record) => record.report_id === reportId
          && record.kind === 'finding' && record.item === finding.item))
        .map((finding) => findingRecord(finding, context))
      const document = documentRecord({
        title: (args.institution ? args.institution + ' ' : '') + date + ' 体检报告',
        text: args.text,
        institution: args.institution ?? null,
        reportDate: date,
      }, context)

      runtime.persist([document, ...observations, ...findings])
      return {
        ok: true,
        mode,
        report_id: reportId,
        observations: observations.length,
        findings: findings.length,
        abnormal: observations.filter((record) => record.flag).length,
        text: '存好了：' + date + ' 的体检报告（' + who.ownerName + '），'
          + observations.length + ' 项测量、' + findings.length + ' 项体检所见、原文一份。'
          + (observations.filter((record) => record.flag).length > 0
            ? '其中 ' + observations.filter((record) => record.flag).length + ' 项超出参考区间，可以问我要一份小结。'
            : ''),
      }
    },
  })
}

