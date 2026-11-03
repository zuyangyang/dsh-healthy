import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { adviceRecord, describeJudgement, judgeAdvice, severityOf } from '../lib/advice.js'
import { advicesFor } from '../lib/insight.js'
import { createRuntime } from '../lib/runtime.js'
import { createMeasureTool } from '../lib/tools/measure.js'
import { createReviewTool } from '../lib/tools/review.js'

const exec = { session: { id: 'session-1' } }
const defineTool = (definition) => definition

function observation(analyte, value, date, flag, ref = { text: '0-3.37', low: 0, high: 3.37 }) {
  return {
    kind: 'observation', analyte, analyte_text: analyte, value, effective_on: date,
    unit: 'mmol/L', ref, flag, status: 'active', subject: 'u_a', version: 1,
  }
}

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-advice-'))
  const runtime = createRuntime({ config: { dataDir }, logger: { info() {}, warn() {} } })
  return {
    runtime,
    measure: createMeasureTool(runtime, defineTool),
    review: createReviewTool(runtime, defineTool),
  }
}

test('severity ranks a double flag above a single one', () => {
  assert.equal(severityOf('HH'), 2)
  assert.equal(severityOf('H'), 1)
  assert.equal(severityOf(null), 0)
})

test('an advice carries the numbers it was based on and a recheck date', () => {
  const records = [observation('ldl_c', 3.82, '2026-08-12', 'H')]
  const advice = advicesFor(records)[0]
  const record = adviceRecord(advice, {
    ownerId: 'u_a', ownerName: '张三', effectiveOn: '2026-08-12', source: 'review',
    records, now: () => new Date('2026-08-12T10:00:00+08:00'),
  })
  assert.equal(record.kind, 'advice')
  assert.equal(record.baseline.ldl_c.value, 3.82)
  assert.equal(record.baseline.ldl_c.date, '2026-08-12')
  assert.equal(record.baseline.ldl_c.flag, 'H')
  assert.equal(record.baseline.ldl_c.ref.high, 3.37)
  assert.equal(record.due_on, '2027-02-08')
})

test('an advice is judged against the newer measurement, not the newer claim', () => {
  const base = [observation('ldl_c', 3.82, '2026-08-12', 'H')]
  const record = adviceRecord(advicesFor(base)[0], {
    ownerId: 'u_a', ownerName: '张三', effectiveOn: '2026-08-12', source: 'review',
    records: base, now: () => new Date('2026-08-12T10:00:00+08:00'),
  })

  const worse = judgeAdvice(record, [...base, observation('ldl_c', 4.4, '2026-12-01', 'H')], '2026-12-02')
  assert.equal(worse.state, 'worse')
  assert.equal(worse.resolved, false)

  const better = judgeAdvice(record, [...base, observation('ldl_c', 3.5, '2026-12-01', 'H')], '2026-12-02')
  assert.equal(better.state, 'improved')

  const resolved = judgeAdvice(record, [...base, observation('ldl_c', 2.85, '2027-02-01', null)], '2027-02-05')
  assert.equal(resolved.state, 'resolved')
  assert.match(describeJudgement(resolved), /3.82.*→.*2.85/)
})

test('a review remembers its advice once and then watches it', async () => {
  const { runtime, measure, review } = setup()
  await measure.execute({ date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37'] }, exec)

  const first = await review.execute({}, exec)
  assert.equal(first.saved, 1)
  assert.match(first.text, /新记下的建议/)
  const stored = runtime.store.all().filter((record) => record.kind === 'advice')
  assert.equal(stored.length, 1)

  const second = await review.execute({}, exec)
  assert.equal(second.saved, 0, 'the same advice must not be filed twice')
  assert.match(second.text, /建议追踪/)
  assert.match(second.text, /还没有新数据/)

  await measure.execute({ date: '2027-02-01', lines: ['低密度脂蛋白胆固醇 2.85 mmol/L 0-3.37'] }, exec)
  const third = await review.execute({}, exec)
  assert.match(third.text, /已回到参考区间/)
  const advice = runtime.store.all().find((record) => record.kind === 'advice')
  assert.equal(advice.status, 'resolved')
  assert.match(advice.resolved_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.deepEqual(advice.resolved_by, ['ldl_c'])
})
