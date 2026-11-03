/**
 * health_record: everything a person says out loud that is not a number.
 * @module dsh-healthy/tools/record
 */

import { newRecordId } from '../ids.js'
import { baseRecord } from '../records.js'
import { resolveSubject } from '../subjects.js'
import { fail, identityDefineTool } from './shared.js'
import { shanghaiDate } from '../util.js'

const KINDS = new Set([
  'symptom', 'condition', 'medication', 'allergy', 'immunization',
  'encounter', 'procedure', 'family_history', 'social', 'profile',
])

/** Which argument every kind cannot live without. */
const REQUIRED = {
  symptom: ['complaint'],
  condition: ['name'],
  medication: ['name'],
  allergy: ['substance'],
  immunization: ['vaccine'],
  encounter: ['reason'],
  procedure: ['name'],
  family_history: ['relative', 'condition'],
  social: ['topic'],
  profile: [],
}

/**
 * @param {object} args - tool arguments.
 * @returns {object} the kind-specific payload.
 */
function payloadOf(args) {
  const kind = args.kind
  if (kind === 'symptom') {
    return {
      complaint: args.complaint,
      location: args.location ?? null,
      severity: Number.isInteger(args.severity) ? args.severity : null,
      duration: args.duration ?? null,
      trigger: args.trigger ?? null,
      relief: args.relief ?? null,
      note: args.note ?? null,
      resolved_on: args.resolved_on ?? null,
    }
  }
  if (kind === 'condition') {
    return {
      name: args.name,
      since: args.since ?? null,
      // Stored beside the record status on purpose: "这个病还在不在" is a
      // clinical fact, while record.status is the archive's own lifecycle.
      condition_status: args.status ?? null,
      note: args.note ?? null,
    }
  }
  if (kind === 'medication') {
    return {
      name: args.name,
      dose: args.dose ?? null,
      frequency: args.frequency ?? null,
      reason: args.reason ?? null,
      started_on: args.since ?? null,
      stopped_on: args.stopped_on ?? null,
      note: args.note ?? null,
    }
  }
  if (kind === 'allergy') {
    return { substance: args.substance, reaction: args.reaction ?? null, note: args.note ?? null }
  }
  if (kind === 'immunization') {
    return { vaccine: args.vaccine, dose_number: args.dose ?? null, place: args.place ?? null, note: args.note ?? null }
  }
  if (kind === 'encounter') {
    return { reason: args.reason, place: args.place ?? null, diagnosis: args.diagnosis ?? null, note: args.note ?? null }
  }
  if (kind === 'procedure') {
    return { name: args.name, place: args.place ?? null, note: args.note ?? null }
  }
  if (kind === 'family_history') {
    return { relative: args.relative, condition: args.condition, note: args.note ?? null }
  }
  if (kind === 'social') {
    return { topic: args.topic, value: args.value ?? null, note: args.note ?? null }
  }
  return {
    sex: args.sex ?? null,
    birth_year: Number.isInteger(args.birth_year) ? args.birth_year : null,
    height: args.height ?? null,
    blood_type: args.blood_type ?? null,
    note: args.note ?? null,
  }
}

/**
 * @param {object} runtime - plugin runtime.
 * @param {Function} [defineTool] - injected for tests.
 * @returns {object} tool definition.
 */
export function createRecordTool(runtime, defineTool = identityDefineTool) {
  return defineTool({
    name: 'health_record',
    description: '记录口头说的一切健康事实：症状（头晕、咳嗽）、确诊的疾病、在吃的药、过敏、疫苗、'
      + '看过医生、做过的手术、家族病史、生活习惯（抽烟喝酒运动睡眠）、以及本人的性别出生年血型。'
      + '数值测量用 health_measure，整份体检报告用 health_report。',
    parameters: {
      kind: { type: 'string', description: 'symptom|condition|medication|allergy|immunization|encounter|procedure|family_history|social|profile。补全一条没填完的记录时不用再给。' },
      draft_id: { type: 'string', description: '上一次返回的 draft_id：用户回答了那个问题时带上，把这条记录补全，不要重新开一条。' },
      cancel_draft: { type: 'string', description: '用户说"算了不记了"时给 draft_id，丢掉那条没填完的记录。' },
      record_id: { type: 'string', description: '改一条已经记下的记录时给它的 id，只说改哪个字段。旧版本不会丢，档案里留着。' },
      subject: { type: 'string', description: '这是谁的事：成员表里的名字；不说就是当前说话的人。' },
      date: { type: 'string', description: '发生日期 YYYY-MM-DD；症状用开始那天，用药用开始吃药那天。' },
      complaint: { type: 'string', description: 'symptom：主诉原话，比如"早上起来头晕"。' },
      location: { type: 'string', description: 'symptom：部位。' },
      severity: { type: 'number', description: 'symptom：0-10 有多难受。' },
      duration: { type: 'string', description: 'symptom：持续多久，比如"半小时"。' },
      trigger: { type: 'string', description: 'symptom：什么情况下加重。' },
      relief: { type: 'string', description: 'symptom：什么情况下缓解。' },
      name: { type: 'string', description: 'condition/procedure：疾病或手术名称；medication：药名。' },
      since: { type: 'string', description: 'condition：从什么时候开始；medication：从什么时候开始吃。' },
      status: { type: 'string', description: 'condition：active|resolved。' },
      dose: { type: 'string', description: 'medication：每次剂量，比如"5mg"；immunization：第几针。' },
      frequency: { type: 'string', description: 'medication：一天几次。' },
      reason: { type: 'string', description: 'medication：为什么吃；encounter：为什么去看。' },
      stopped_on: { type: 'string', description: 'medication：什么时候停的。' },
      substance: { type: 'string', description: 'allergy：过敏原。' },
      reaction: { type: 'string', description: 'allergy：过敏反应。' },
      vaccine: { type: 'string', description: 'immunization：疫苗名称。' },
      place: { type: 'string', description: 'encounter/procedure/immunization：在哪家医院。' },
      diagnosis: { type: 'string', description: 'encounter：医生给的诊断。' },
      relative: { type: 'string', description: 'family_history：哪位亲属，比如"父亲"。' },
      condition: { type: 'string', description: 'family_history：他得了什么病。' },
      topic: { type: 'string', description: 'social：话题，比如"吸烟""饮酒""运动""睡眠"。' },
      value: { type: 'string', description: 'social：情况，比如"每天半包"。' },
      sex: { type: 'string', description: 'profile：male|female。' },
      birth_year: { type: 'number', description: 'profile：出生年份，比如 1985。' },
      height: { type: 'number', description: 'profile：身高 cm。' },
      blood_type: { type: 'string', description: 'profile：血型。' },
      private: { type: 'boolean', description: '标记为敏感记录（生殖、精神、遗传、传染病这类用）。' },
      note: { type: 'string', description: '补充说明。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.text || '' }],
    },
    async execute(args, exec) {
      const view = runtime.view(exec)
      const drafts = runtime.drafts
      const who = resolveSubject(runtime, exec, view, args.subject)

      if (args.cancel_draft) {
        const cancelled = drafts.get(args.cancel_draft)
        if (cancelled && cancelled.owner === who.ownerId) drafts.close(cancelled.id)
        return { ok: true, cancelled: Boolean(cancelled), text: cancelled ? '好，这条不记了。' : '没有等着补的记录。' }
      }

      // A second message that answers the question continues the draft instead of
      // starting a new half-record. The draft carries the owner, so a different
      // conversation cannot finish it.
      const draft = args.draft_id ? drafts.get(args.draft_id) : null
      if (args.draft_id && !draft) fail('这条没填完的记录已经过期了，重新说一遍就行')
      if (draft && draft.owner !== who.ownerId) fail('这条没填完的记录不属于当前对话，换个对话补或者重新说一遍')

      // Correcting an earlier record is a revision, never an overwrite: the
      // archive keeps the old version and the new one points at what it replaced.
      if (args.record_id) {
        const existing = view.byId(args.record_id)
        if (!existing) fail('找不到这条记录，或者它不在你现在的权限范围里')
        if (!view.can(existing)) fail('这条记录不在你有权修改的范围内')
        const patch = patchOf(existing.kind, args)
        if (args.date) patch.effective_on = args.date
        if (args.private !== undefined) patch.sensitivity = args.private ? 'private' : 'normal'
        if (Object.keys(patch).length === 0) fail('没说改哪个字段，比如 dose、name、severity')
        const { after } = runtime.revise(existing.id, patch, { expectedVersion: existing.version })
        return {
          ok: true,
          id: after.id,
          version: after.version,
          revised: Object.keys(patch),
          text: '改好了：' + describe(after) + '（第 ' + after.version + ' 版，上一版还留在档案里）',
        }
      }

      const kind = String(draft ? draft.kind : (args.kind || '')).trim()
      if (!KINDS.has(kind)) fail('kind 只能是：' + [...KINDS].join('、'))

      const spoken = { ...args }
      delete spoken.draft_id
      delete spoken.cancel_draft
      delete spoken.record_id
      const merged = { ...(draft ? draft.args : {}), ...spoken }
      const missing = missingFields(kind, merged)
      if (missing.length > 0) {
        const saved = draft
          ? drafts.patch(draft.id, merged, missing)
          : drafts.open({
            kind,
            args: merged,
            missing,
            ownerId: who.ownerId,
            ownerName: who.ownerName,
            enteredBy: view.actorName(),
            anonymous: who.anonymous,
          })
        return {
          ok: true,
          recorded: 0,
          needs_answer: missing,
          draft_id: saved.id,
          question: saved.question,
          text: '先记下了（' + who.ownerName + '）。' + saved.question,
        }
      }

      const date = merged.date || shanghaiDate(runtime.now())
      // Payload first, base fields second: a payload must never be able to
      // overwrite id/status/subject and make a record unreadable.
      const record = {
        id: newRecordId(),
        ...payloadOf(merged),
        ...baseRecord({
          ownerId: who.ownerId,
          ownerName: who.ownerName,
          enteredBy: view.actorName(),
          effectiveOn: date,
          source: 'oral',
          sensitivity: merged.private ? 'private' : 'normal',
          pending: who.anonymous,
          now: runtime.now,
        }),
        kind,
      }

      runtime.persist([record])
      if (draft) drafts.close(draft.id)
      return {
        ok: true,
        id: record.id,
        kind,
        text: '记下来了：' + describe(record) + '（' + date + '，' + who.ownerName + '）'
          + (draft ? '。刚才没说完的也补上了。' : ''),
      }
    },
  })
}

/**
 * Only the fields the caller actually mentioned, mapped onto the record.
 *
 * payloadOf() fills every field it knows about; a revision must not silently
 * null the ones nobody talked about.
 * @param {string} kind - record kind.
 * @param {object} args - tool arguments.
 * @returns {object} the fields to change.
 */
function patchOf(kind, args) {
  const full = payloadOf({ ...args, kind })
  const patch = {}
  for (const [key, value] of Object.entries(full)) {
    if (value === undefined || value === null) continue
    patch[key] = value
  }
  return patch
}

/**
 * What a record of this kind still cannot do without.
 *
 * One missing field is a question, not an error: the fragment is kept as a draft
 * so the next message can finish the job.
 * @param {string} kind - record kind.
 * @param {object} merged - everything said so far.
 * @returns {string[]} missing field names.
 */
function missingFields(kind, merged) {
  const empty = (value) => value === undefined || value === null || String(value).trim().length === 0
  const missing = (REQUIRED[kind] || []).filter((field) => empty(merged[field]))
  if (kind === 'profile') {
    const filled = ['sex', 'birth_year', 'height', 'blood_type'].some((field) => !empty(merged[field]))
    if (!filled) missing.push('sex|birth_year|height|blood_type')
  }
  return missing
}

/**
 * @param {object} record - just-written record.
 * @returns {string} one line for the receipt.
 */
function describe(record) {
  if (record.kind === 'symptom') {
    const bits = [record.complaint]
    if (record.severity !== null) bits.push('难受程度 ' + record.severity + '/10')
    if (record.duration) bits.push('持续 ' + record.duration)
    return bits.join('，')
  }
  if (record.kind === 'family_history') return record.relative + '有' + record.condition
  if (record.kind === 'medication') return '在吃' + record.name + (record.dose ? ' ' + record.dose : '')
  if (record.kind === 'social') return record.topic + (record.value ? '：' + record.value : '')
  if (record.kind === 'profile') return '基本资料'
  return record.name || record.substance || record.vaccine || record.reason || record.topic || record.kind
}
