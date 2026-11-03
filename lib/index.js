/**
 * dsh-healthy: a family health archive that a conversation can fill.
 *
 * The plugin owns structure, history and the permission seam. Reading a
 * photograph of a report is the model's job; everything here starts from text.
 * @module dsh-healthy
 */

import z from '@deepseek-ai/schemastery'

import { createRuntime } from './runtime.js'

export const name = 'dsh-healthy'
export const inject = ['tools']

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
  // Tools are added milestone by milestone; each registers as it lands.

  runtime.logger?.info?.('[healthy] ready at ' + runtime.config.dataDir + ' (' +
    runtime.store.all().length + ' records, ' + loaded.length + ' tools)')

  return () => {
    runtime.dispose()
  }
}
