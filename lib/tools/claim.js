/**
 * health_claim: give unowned records to the person they belong to.
 * @module dsh-healthy/tools/claim
 */

import { describeRecord } from './shared.js'
import { identityDefineTool } from './shared.js'

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createClaimTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_claim',
    description: '把还没归属的健康记录认领给某个家庭成员。户主说"这条是我的""这些是妈的"时用。'
      + '只有户主能操作，历史记录本身不会被改写。',
    parameters: {
      member: { type: 'string', required: true, description: '认领给谁：成员表里的名字。' },
      ids: { type: 'array', description: '只认领这几条记录 id；不给就认领所有未归属的。' },
      dry_run: { type: 'boolean', description: '只预览，不写。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      if (!runtime.auth) {
        throw new Error('这个档案没有接入家庭权限（dsh-family-auth），所有记录本来就是同一个人的，不需要认领')
      }
      if (!view.isOwner()) throw new Error('只有户主能认领记录归属')
      const member = runtime.auth.findMember(args.member)
      if (!member) throw new Error('成员表里没有「' + args.member + '」')

      const all = view.all()
      const wanted = Array.isArray(args.ids) && args.ids.length > 0
        ? all.filter((record) => args.ids.includes(record.id))
        : all.filter((record) => record.pending || record.ownerId === 'default')

      if (wanted.length === 0) return { ok: true, claimed: 0, text: '没有需要认领的记录。' }
      if (args.dry_run) {
        return {
          ok: true,
          dry_run: true,
          would_claim: wanted.length,
          text: '会把 ' + wanted.length + ' 条记录归给「' + member.name + '」：'
            + wanted.slice(0, 5).map((record) => describeRecord(record)).join('；') + (wanted.length > 5 ? ' …' : ''),
        }
      }

      const written = runtime.claim(
        wanted.map((record) => ({ recordId: record.id, ownerId: member.id })),
        { by: view.actorName(), reason: 'health-claim' },
      )
      return {
        ok: true,
        claimed: written,
        text: '已把 ' + written + ' 条记录归到「' + member.name + '」名下。从现在起只有本人和被授权的人能看到。',
      }
    },
  })
}
