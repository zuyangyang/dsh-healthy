/**
 * dsh-healthy: a family health archive that a conversation can fill.
 *
 * The plugin owns structure, history and the permission seam. Reading a
 * photograph of a report is the model's job; everything here starts from text.
 * @module dsh-healthy
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { buildBrief } from './brief.js'
import { createRuntime } from './runtime.js'
import { HEALTH_SKILL_DESCRIPTION, HEALTH_SKILL_NAME, HEALTH_SKILL_WHEN_TO_USE, healthSkillContent } from './skill.js'
import { createClaimTool } from './tools/claim.js'
import { createDoctorTool } from './tools/doctor.js'
import { createExportTool } from './tools/export.js'
import { createMeasureTool } from './tools/measure.js'
import { createQueryTool } from './tools/query.js'
import { createRecordTool } from './tools/record.js'
import { createReportTool } from './tools/report.js'
import { createReviewTool } from './tools/review.js'
import { createSeriesTool } from './tools/series.js'

export const name = 'dsh-healthy'
export const inject = ['tools', 'skills', 'systemPrompt']

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description('关掉后不注册任何工具，档案文件保持原样。'),
  dataDir: z.string().default('~/.dsh/healthy')
    .description('健康档案目录，支持 ~ 和相对路径；默认 ~/.dsh/healthy。'),
  identity: z.union([z.const('single'), z.const('auth')]).default('single')
    .description('身份从哪来：single=单人档案，全部可见；auth=接 dsh-family-auth 按成员隔离，'
      + '它没加载时档案拒绝出数（不会退化成全部可见）。'),
  fallbackOwner: z.string().default('default')
    .description('认不出是谁的记录落在哪个桶里；默认 default。健康档案里这个桶只有户主能看。'),
  brief: z.boolean().default(true)
    .description('在对话开头注入一段档案现状（不含具体指标，只提醒该用工具查）。'),
  skill: z.boolean().default(true)
    .description('注册记录健康信息的行为规则（怎么记、什么必须问、绝不诊断）。'),
  diag: z.boolean().default(false)
    .description('输出更啰嗦的诊断日志。'),
})

/**
 * @param {object} ctx - Cordis context.
 * @param {object} [rawConfig] - plugin configuration.
 * @returns {Function} disposer.
 */
export function apply(ctx, rawConfig = {}) {
  const runtime = createRuntime({ config: rawConfig, logger: ctx.logger })
  if (!runtime.config.enabled) {
    runtime.logger?.info?.('[healthy] disabled by config')
    return () => {}
  }

  // dsh-family-auth is optional. When the profile provides it, it owns identity
  // and every read is scoped; when it is absent the archive is single-user.
  ctx.inject(['familyAuth'], (authCtx) => {
    runtime.auth = authCtx.familyAuth
    runtime.logger?.info?.('[healthy] identity and read scope come from dsh-family-auth')
  })

  const loaded = []
  for (const [label, factory] of [
    ['health_report', createReportTool],
    ['health_measure', createMeasureTool],
    ['health_record', createRecordTool],
    ['health_query', createQueryTool],
    ['health_series', createSeriesTool],
    ['health_review', createReviewTool],
    ['health_export', createExportTool],
    ['health_claim', createClaimTool],
    ['health_doctor', createDoctorTool],
  ]) {
    guard(runtime, 'tool ' + label, () => {
      ctx.tools.register(factory(runtime, defineTool))
      loaded.push(label)
    })
  }

  guard(runtime, 'skill', () => {
    if (!runtime.config.skill) return
    ctx.skills.register({
      name: HEALTH_SKILL_NAME,
      description: HEALTH_SKILL_DESCRIPTION,
      whenToUse: HEALTH_SKILL_WHEN_TO_USE,
      content: healthSkillContent(),
    })
  })

  if (runtime.config.brief) {
    guard(runtime, 'brief', () => {
      ctx.systemPrompt.context({
        name: 'dsh-healthy:brief',
        order: 45,
        text: () => buildBrief(runtime),
      })
    })
  }

  runtime.logger?.info?.('[healthy] ready at ' + runtime.config.dataDir + ' (' +
    runtime.store.all().length + ' records, ' + loaded.length + ' tools)')

  return () => {
    runtime.dispose()
  }
}

/** Run one registration step, reporting instead of throwing. */
function guard(runtime, label, step) {
  try {
    step()
  } catch (error) {
    runtime.logger?.warn?.('[healthy] ' + label + ' failed to register:', error?.message ?? error)
  }
}
