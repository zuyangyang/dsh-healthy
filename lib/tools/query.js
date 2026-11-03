/**
 * health_query: read the archive back, scoped to whoever is asking.
 * @module dsh-healthy/tools/query
 */

import { lookup } from '../analytes.js'
import { describeRecord } from './shared.js'
import { fail, identityDefineTool } from './shared.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createQueryTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_query',
    description: '查健康档案：某段时间发生了什么、某个指标的历史、谁还有没归属的记录、'
      + '或者要一份时间线。只能看到自己有权限看的部分。',
    parameters: {
      subject: { type: 'string', description: '查谁的：成员表里的名字；不说就是当前说话的人。' },
      kind: { type: 'string', description: '只看某类记录：observation|finding|symptom|condition|medication|allergy|immunization|encounter|procedure|family_history|social|profile|document' },
      analyte: { type: 'string', description: '只看某个指标，可以给中文名、缩写或 id，比如"低密度脂蛋白""LDL-C"。' },
      from: { type: 'string', description: '起始日期 YYYY-MM-DD。' },
      to: { type: 'string', description: '结束日期 YYYY-MM-DD。' },
      only_abnormal: { type: 'boolean', description: '只看超出参考区间的。' },
      mode: { type: 'string', description: 'records（默认）| timeline 时间线 | summary 概览 | pending 未归属的记录 | drafts 没填完的记录' },
      limit: { type: 'number', description: '最多返回多少条，默认 20。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      const mode = String(args.mode || 'records')
      if (mode === 'drafts') {
        const visible = new Set([...view.all().map((record) => record.subject)])
        const drafts = runtime.drafts.all().filter((draft) => visible.has(draft.owner) || view.scope === null)
        if (drafts.length === 0) return { ok: true, count: 0, text: '没有还没填完的记录。' }
        return {
          ok: true,
          count: drafts.length,
          text: '有 ' + drafts.length + ' 条没填完：' + String.fromCharCode(10)
            + drafts.map((draft) => '- ' + draft.kind + '（' + draft.owner_name + '）：' + draft.question).join(String.fromCharCode(10)),
        }
      }
      if (mode === 'pending') {
        const pending = view.all().filter((record) => record.pending || record.ownerId === 'default')
        if (pending.length === 0) return { ok: true, count: 0, text: '没有未归属的健康记录。' }
        return {
          ok: true,
          count: pending.length,
          text: '有 ' + pending.length + ' 条记录还没归属到人：' + String.fromCharCode(10)
            + pending.slice(0, 10).map((record) => '- ' + record.effective_on + ' ' + describeRecord(record)).join(String.fromCharCode(10))
            + String.fromCharCode(10) + '如果知道是谁的，可以说"这些是我的"或"是妈的"，我用 health_claim 归过去。',
        }
      }

      let records = view.all()
      if (args.subject) {
        const who = resolveName(runtime, view, args.subject)
        records = records.filter((record) => record.subject === who)
      }
      if (args.kind) records = records.filter((record) => record.kind === args.kind)
      if (args.analyte) {
        const entry = lookup(args.analyte)
        const needle = String(args.analyte).trim()
        records = records.filter((record) => record.analyte === entry?.id
          || record.analyte_text === needle || record.analyte_abbr === needle)
      }
      if (args.from) records = records.filter((record) => record.effective_on >= args.from)
      if (args.to) records = records.filter((record) => record.effective_on <= args.to)
      if (args.only_abnormal) records = records.filter((record) => record.flag)

      const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 20
      records.sort((a, b) => String(b.effective_on).localeCompare(String(a.effective_on)))
      const shown = records.slice(0, limit)

      if (shown.length === 0) return { ok: true, count: 0, text: '按这些条件没查到记录。' }

      const header = mode === 'summary'
        ? '档案里有 ' + records.length + ' 条符合条件的记录'
        : '找到 ' + records.length + ' 条' + (shown.length < records.length ? '，先列最近 ' + shown.length + ' 条' : '')
      return {
        ok: true,
        count: records.length,
        text: header + '：' + String.fromCharCode(10)
          + shown.map((record) => '- ' + record.effective_on + ' ' + describeRecord(record)).join(String.fromCharCode(10)),
      }
    },
  })
}

function resolveName(runtime, view, name) {
  if (!runtime.auth) return name
  const member = runtime.auth.findMember(name)
  if (!member) fail('成员表里没有「' + name + '」')
  return member.id
}
