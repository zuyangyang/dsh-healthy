/**
 * Whose file is this?
 *
 * Every write and every read has to answer that before it touches the store.
 * Without dsh-family-auth the archive belongs to one person and the answer is
 * trivial. With it, the answer comes from the conversation's actor - never from
 * an id the model made up - unless the caller explicitly names a member the
 * household actually has.
 * @module dsh-healthy/subjects
 */

/**
 * Resolve the subject of an operation.
 * @param {object} runtime - plugin runtime.
 * @param {object} exec - tool execution context.
 * @param {object} view - scoped view for this execution.
 * @param {string} [name] - member name given by the user, e.g. "我妈".
 * @returns {{ownerId: string, ownerName: string, anonymous: boolean, member: object|null}} subject.
 */
export function resolveSubject(runtime, exec, view, name) {
  const stamp = view.stamp()

  if (!runtime.auth) {
    if (runtime.config.identity === 'auth') {
      throw new Error('健康档案配置成必须接入家庭权限（identity: auth），但 dsh-family-auth 没有加载，'
        + '为了不把所有记录混在一起，这次拒绝执行')
    }
    if (name) {
      // Single-user archive:一个名字就是一个标签，不做成员校验。
      return { ownerId: name, ownerName: name, anonymous: false, member: null }
    }
    return { ownerId: stamp.ownerId, ownerName: stamp.ownerName, anonymous: stamp.anonymous, member: null }
  }

  if (name) {
    const member = runtime.auth.findMember(name)
    if (!member) {
      throw new Error('成员表里没有「' + name + '」。先让户主在家庭权限里把他加上，或者换成成员表里的名字')
    }
    return { ownerId: member.id, ownerName: member.name, anonymous: false, member }
  }

  const actor = runtime.auth.actorOf(exec)
  if (!actor) {
    return { ownerId: stamp.ownerId, ownerName: stamp.ownerName, anonymous: true, member: null }
  }
  return { ownerId: actor.id, ownerName: actor.name, anonymous: false, member: actor }
}

/**
 * The owner id whose records this execution may read.
 * @param {object} runtime - plugin runtime.
 * @param {object} exec - tool execution context.
 * @param {object} view - scoped view.
 * @returns {Set<string>|null} allowed owners, or null for everything.
 */
export function readOwners(runtime, exec, view) {
  return view.scope
}
