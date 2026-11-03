/**
 * A short reality check injected into every session.
 *
 * Cheap and synchronous: it may only touch the in-memory index.
 * @module dsh-healthy/brief
 */

/**
 * @param {object} runtime - plugin runtime.
 * @returns {string} prompt fragment.
 */
export function buildBrief(runtime) {
  if (!runtime.config.brief) return ''
  const base = '健康档案插件已就绪。用户说身体的事、拿来体检报告，就直接记录，不要问"要不要记"。'

  if (runtime.auth) {
    // The prompt hook is assembled per agent, not per message, so it cannot ask
    // who is speaking. A brief without numbers is the only honest version.
    return base + '档案已接入家庭权限：每个人只看得到自己的记录和别人显式授权给他的，'
      + '问具体指标必须调用 health_* 工具取当下范围内的数据，不要凭记忆回答，也不要替别人推断。'
  }

  let records = []
  try {
    records = runtime.store.all()
  } catch {
    return base
  }
  if (records.length === 0) {
    return base + '档案里还什么都没有。体检报告用 health_report，单个指标用 health_measure，口头说的用 health_record。'
  }
  const abnormal = records.filter((record) => record.flag && record.status === 'active').length
  return base + '档案里已有 ' + records.length + ' 条记录' + (abnormal > 0 ? '，其中 ' + abnormal + ' 条超出参考区间' : '')
    + '。问具体数字时用 health_query / health_series 取准数。'
}
