/**
 * An unfinished oral record.
 *
 * People speak in fragments: "我妈过敏" arrives before "青霉素", and "头晕" before
 * "三天了". Refusing the fragment loses the fact that something happened; writing
 * half a record loses the ability to use it. So the fragment becomes a draft: it
 * holds exactly what was said, remembers one question, and disappears on its own
 * if nobody answers.
 * @module dsh-healthy/drafts
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { newRecordId } from './ids.js'

/** How long an unanswered draft is worth keeping. */
export const DRAFT_TTL_DAYS = 14

/**
 * The one question to ask for each kind, phrased the way a person would, and
 * what it is asking for.
 */
const QUESTIONS = {
  symptom: { fields: ['complaint'], ask: '具体是哪里不舒服？怎么个不舒服法，说说原话就行。' },
  condition: { fields: ['name'], ask: '是哪个病？医生当时怎么说的？' },
  medication: { fields: ['name'], ask: '在吃的是什么药？盒子上的名字就可以。' },
  allergy: { fields: ['substance'], ask: '对什么东西过敏？当时是什么反应（起疹子、肿、喘不上气）？' },
  immunization: { fields: ['vaccine'], ask: '打的是哪种疫苗？' },
  encounter: { fields: ['reason'], ask: '这次是为什么去看医生？' },
  procedure: { fields: ['name'], ask: '做的是什么手术或者检查？' },
  family_history: { fields: ['relative', 'condition'], ask: '是哪位家里人，得的什么病？' },
  social: { fields: ['topic'], ask: '想记哪方面：抽烟、喝酒、运动，还是睡眠？' },
  profile: { fields: [], ask: '基本资料给我一项就够：性别、出生年份、身高、血型。' },
}

/**
 * The question a draft should ask.
 * @param {string} kind - record kind.
 * @param {string[]} missing - field names still needed.
 * @returns {string} one short question, in Chinese.
 */
export function questionFor(kind, missing) {
  const entry = QUESTIONS[kind]
  if (entry && missing.every((field) => entry.fields.includes(field))) return entry.ask
  return '这条记录还缺：' + missing.join('、') + '，补一句就行。'
}

/**
 * A small persistence layer for drafts: one JSON file, rewritten atomically.
 *
 * Drafts are conversation state, not archive: they live beside the records, are
 * never read by the read view, and expire. A draft is only ever visible to the
 * conversation that opened it, because the tool returns its id and nothing else
 * lists drafts across members.
 */
export class DraftStore {
  /**
   * @param {{dataDir: string, logger?: object, now?: Function}} input - where to keep drafts.
   */
  constructor({ dataDir, logger = console, now = () => new Date() }) {
    this.path = join(dataDir, 'drafts.json')
    this.logger = logger
    this.now = now
    this.drafts = null
  }

  /** Read the file once, dropping drafts that have expired. */
  load() {
    if (this.drafts !== null) return this.drafts
    this.drafts = []
    try {
      const raw = readFileSync(this.path, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) this.drafts = parsed.filter((draft) => draft && typeof draft.id === 'string')
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn?.('[healthy] drafts unreadable, starting empty: ' + (error?.message ?? error))
      }
    }
    this.prune()
    return this.drafts
  }

  /** Every open draft. */
  all() {
    return this.load().map((draft) => ({ ...draft }))
  }

  /**
   * One draft by id.
   * @param {string} id - draft id.
   * @returns {object|null} the draft.
   */
  get(id) {
    if (typeof id !== 'string' || id.length === 0) return null
    const found = this.load().find((draft) => draft.id === id)
    return found ? { ...found } : null
  }

  /**
   * Open a draft holding what has been said so far.
   * @param {{kind: string, args: object, missing: string[], ownerId: string, ownerName: string, enteredBy: string|null, anonymous: boolean}} input - the fragment.
   * @returns {object} the stored draft.
   */
  open(input) {
    const now = this.now()
    const draft = {
      id: newRecordId().replace(/^h_/, 'd_'),
      kind: input.kind,
      args: input.args,
      missing: input.missing,
      question: questionFor(input.kind, input.missing),
      owner: input.ownerId,
      owner_name: input.ownerName,
      entered_by: input.enteredBy ?? null,
      anonymous: Boolean(input.anonymous),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DRAFT_TTL_DAYS * 86400000).toISOString(),
    }
    this.load().push(draft)
    this.flush()
    return { ...draft }
  }

  /**
   * Add what the answer supplied and work out what is still missing.
   * @param {string} id - draft id.
   * @param {object} args - the new fields.
   * @param {string[]} missing - fields still missing after the merge.
   * @returns {object|null} the updated draft.
   */
  patch(id, args, missing) {
    const draft = this.load().find((item) => item.id === id)
    if (!draft) return null
    draft.args = { ...draft.args, ...args }
    draft.missing = missing
    draft.question = questionFor(draft.kind, missing)
    draft.updated_at = this.now().toISOString()
    this.flush()
    return { ...draft }
  }

  /**
   * Forget one draft: it either became a record or was cancelled.
   * @param {string} id - draft id.
   * @returns {boolean} whether it existed.
   */
  close(id) {
    const before = this.load().length
    this.drafts = this.load().filter((draft) => draft.id !== id)
    if (this.drafts.length === before) return false
    this.flush()
    return true
  }

  /** Drop drafts nobody came back to. */
  prune() {
    if (this.drafts === null) return 0
    const now = this.now().getTime()
    const before = this.drafts.length
    this.drafts = this.drafts.filter((draft) => {
      const expires = Date.parse(draft.expires_at ?? '')
      return !Number.isFinite(expires) || expires > now
    })
    return before - this.drafts.length
  }

  /** Write the whole list atomically. */
  flush() {
    try {
      mkdirSync(join(this.path, '..'), { recursive: true, mode: 0o700 })
      const tmp = this.path + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.drafts, null, 2) + String.fromCharCode(10), { mode: 0o600 })
      renameSync(tmp, this.path)
    } catch (error) {
      this.logger?.warn?.('[healthy] drafts not saved: ' + (error?.message ?? error))
    }
  }
}

