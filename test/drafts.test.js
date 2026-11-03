import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { DRAFT_TTL_DAYS, DraftStore, questionFor } from '../lib/drafts.js'

function store(now = () => new Date('2026-11-03T10:00:00+08:00')) {
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-drafts-'))
  return new DraftStore({ dataDir, logger: { warn() {} }, now })
}

test('a draft keeps the fragment and the question', () => {
  const drafts = store()
  const draft = drafts.open({
    kind: 'allergy', args: { reaction: '起疹子' }, missing: ['substance'],
    ownerId: 'u_a', ownerName: '张三', enteredBy: '张三', anonymous: false,
  })
  assert.match(draft.id, /^d_/)
  assert.equal(draft.question, questionFor('allergy', ['substance']))
  assert.deepEqual(drafts.get(draft.id).args, { reaction: '起疹子' })
})

test('an answered draft is completed and then forgotten', () => {
  const drafts = store()
  const draft = drafts.open({
    kind: 'allergy', args: {}, missing: ['substance'],
    ownerId: 'u_a', ownerName: '张三', enteredBy: '张三', anonymous: false,
  })
  const patched = drafts.patch(draft.id, { substance: '青霉素' }, [])
  assert.equal(patched.args.substance, '青霉素')
  assert.deepEqual(patched.missing, [])
  assert.equal(drafts.close(draft.id), true)
  assert.equal(drafts.get(draft.id), null)
})

test('drafts survive a new instance, so the next message can finish them', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-drafts-'))
  const first = new DraftStore({ dataDir, logger: { warn() {} } })
  const draft = first.open({
    kind: 'symptom', args: { complaint: '头晕' }, missing: [],
    ownerId: 'u_a', ownerName: '张三', enteredBy: null, anonymous: false,
  })
  const second = new DraftStore({ dataDir, logger: { warn() {} } })
  assert.equal(second.get(draft.id).kind, 'symptom')
})

test('a draft nobody answers expires', () => {
  let clock = new Date('2026-11-03T10:00:00+08:00').getTime()
  const now = () => new Date(clock)
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-drafts-'))
  const drafts = new DraftStore({ dataDir, logger: { warn() {} }, now })
  const draft = drafts.open({
    kind: 'symptom', args: {}, missing: ['complaint'],
    ownerId: 'u_a', ownerName: '张三', enteredBy: null, anonymous: false,
  })
  clock += (DRAFT_TTL_DAYS + 1) * 86400000
  const later = new DraftStore({ dataDir, logger: { warn() {} }, now })
  assert.equal(later.get(draft.id), null)
})

test('a question is phrased for the person, not the schema', () => {
  assert.match(questionFor('family_history', ['relative', 'condition']), /哪位家里人/)
  assert.match(questionFor('allergy', ['substance']), /对什么东西过敏/)
  assert.match(questionFor('medication', ['name', 'dose']), /还缺/)
})
