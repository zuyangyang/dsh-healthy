/**
 * health_series: one number over time.
 * @module dsh-healthy/tools/series
 */

import { lookup } from '../analytes.js'
import { analyteSeries } from '../insight.js'
import { fail, identityDefineTool } from './shared.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createSeriesTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_series',
    description: '看某个指标的历史：每个点的值、和上次比差多少、是否还在参考区间外。'
      + '用户问"血脂现在怎么样""这个指标降到多少了"时用。',
    parameters: {
      analyte: { type: 'string', required: true, description: '指标名，可以给中文名、缩写或 id，比如"低密度脂蛋白""LDL-C"。' },
      subject: { type: 'string', description: '看谁的；不说就是当前说话的人。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const entry = lookup(args.analyte)
      if (!entry) fail('词典里没有「' + args.analyte + '」这个指标；可以试试中文全名或者缩写')
      const view = runtime.view(exec)
      let records = view.all()
      if (args.subject && runtime.auth) {
        const member = runtime.auth.findMember(args.subject)
        if (!member) fail('成员表里没有「' + args.subject + '」')
        records = records.filter((record) => record.subject === member.id)
      }
      const series = analyteSeries(records, entry.id)
      if (series.points.length === 0) {
        return { ok: true, points: 0, text: '还没有' + entry.zh + '的记录。体检报告用 health_report，单独一次用 health_measure。' }
      }
      const unit = series.latest.unit ? ' ' + series.latest.unit : ''
      const ref = series.latest.ref?.text ? '，参考 ' + series.latest.ref.text : ''
      const lines = [
        entry.zh + '（' + series.points.length + ' 次记录，单位' + (unit || '无') + ref + '）',
        ...series.points.map((point) => '- ' + point.effective_on + '：' + point.value + unit + (point.flag ? ' ' + point.flag : '')),
      ]
      if (series.delta !== null) {
        lines.push('最近一次 ' + series.latest.effective_on + '，比上次（' + series.previous.effective_on + '）'
          + (series.delta > 0 ? '高了 ' : '低了 ') + Math.abs(series.delta).toFixed(2) + unit)
      }
      return {
        ok: true,
        analyte: entry.id,
        points: series.points.length,
        latest: series.latest.value,
        delta: series.delta,
        text: lines.join(String.fromCharCode(10)),
      }
    },
  })
}
