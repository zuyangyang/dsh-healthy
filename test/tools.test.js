import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createRuntime } from '../lib/runtime.js'
import { createDoctorTool } from '../lib/tools/doctor.js'
import { createMeasureTool } from '../lib/tools/measure.js'
import { createQueryTool } from '../lib/tools/query.js'
import { createRecordTool } from '../lib/tools/record.js'

const exec = { session: { id: 'session-1' } }
const defineTool = (definition) => definition

function fresh() {
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-tools-'))
  const runtime = createRuntime({ config: { dataDir }, logger: { info() {}, warn() {} } })
  const tools = {
    measure: createMeasureTool(runtime, defineTool),
    record: createRecordTool(runtime, defineTool),
    query: createQueryTool(runtime, defineTool),
    doctor: createDoctorTool(runtime, defineTool),
  }
  return { runtime, tools }
}

test('a measurement line becomes an observation with a flag', async () => {
  const { runtime, tools } = fresh()
  const result = await tools.measure.execute({
    date: '2026-08-12',
    lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37', '血压 138/88 mmHg'],
  }, exec)
  assert.equal(result.recorded, 3)
  assert.deepEqual(result.abnormal, ['低密度脂蛋白胆固醇'])
  const stored = runtime.store.all()
  assert.equal(stored.length, 3)
  assert.equal(stored.find((record) => record.analyte === 'sbp').value, 138)
  assert.equal(stored.find((record) => record.analyte === 'ldl_c').flag, 'H')
})

test('recording the same measurement twice does not duplicate it', async () => {
  const { runtime, tools } = fresh()
  const args = { date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37'] }
  await tools.measure.execute(args, exec)
  const second = await tools.measure.execute(args, exec)
  assert.equal(second.recorded, 0)
  assert.deepEqual(second.duplicates, ['低密度脂蛋白胆固醇'])
  assert.equal(runtime.store.all().length, 1)
})

test('an unknown analyte is stored, not dropped', async () => {
  const { runtime, tools } = fresh()
  const result = await tools.measure.execute({ date: '2026-08-12', lines: ['糖化血清蛋白 1.9 mmol/L'] }, exec)
  assert.equal(result.recorded, 1)
  const record = runtime.store.all()[0]
  assert.equal(record.analyte, null)
  assert.equal(record.needs_review, true)
  assert.equal(record.analyte_text, '糖化血清蛋白')
})

test('a correction becomes a new version and the old one stays on disk', async () => {
  const { runtime, tools } = fresh()
  const created = await tools.record.execute({ kind: 'medication', name: '氨氯地平', dose: '5mg' }, exec)
  const revised = await tools.record.execute({ record_id: created.id, dose: '10mg' }, exec)
  assert.equal(revised.version, 2)
  const record = runtime.store.all()[0]
  assert.equal(record.dose, '10mg')
  assert.equal(record.name, '氨氯地平', 'a field nobody mentioned must survive the revision')
  const lines = readFileSync(join(runtime.config.dataDir, 'entries.ndjson'), 'utf8')
    .trim().split(String.fromCharCode(10))
  assert.equal(lines.length, 2, 'both versions are kept in the log')
  await assert.rejects(tools.record.execute({ record_id: 'h_missing', dose: '1mg' }, exec), /找不到这条记录/)
  await assert.rejects(tools.record.execute({ record_id: created.id }, exec), /没说改哪个字段/)
})

test('a spoken symptom is recorded with what was said', async () => {
  const { runtime, tools } = fresh()
  const result = await tools.record.execute({
    kind: 'symptom', date: '2026-11-03', complaint: '早上起来头晕', severity: 4, duration: '半小时',
  }, exec)
  assert.equal(result.ok, true)
  const record = runtime.store.all()[0]
  assert.equal(record.kind, 'symptom')
  assert.equal(record.complaint, '早上起来头晕')
  assert.equal(record.severity, 4)
})

test('a fragment becomes a question instead of an error', async () => {
  const { runtime, tools } = fresh()
  const first = await tools.record.execute({ kind: 'allergy', reaction: '起疹子' }, exec)
  assert.equal(first.recorded, 0)
  assert.deepEqual(first.needs_answer, ['substance'])
  assert.match(first.text, /对什么东西过敏/)
  assert.equal(runtime.store.all().length, 0)

  const second = await tools.record.execute({ draft_id: first.draft_id, substance: '青霉素' }, exec)
  assert.equal(second.ok, true)
  assert.match(second.text, /补上了/)
  const stored = runtime.store.all()
  assert.equal(stored.length, 1)
  assert.equal(stored[0].substance, '青霉素')
  assert.equal(stored[0].reaction, '起疹子', 'the field from the first message must survive the answer')
  assert.equal(runtime.drafts.get(first.draft_id), null)
})

test('an abandoned draft can be cancelled, and an unknown kind still fails', async () => {
  const { runtime, tools } = fresh()
  const draft = await tools.record.execute({ kind: 'medication' }, exec)
  const cancelled = await tools.record.execute({ cancel_draft: draft.draft_id }, exec)
  assert.equal(cancelled.cancelled, true)
  assert.equal(runtime.drafts.get(draft.draft_id), null)

  await assert.rejects(tools.record.execute({ kind: 'nonsense' }, exec), /kind 只能是/)
  await assert.rejects(tools.record.execute({ draft_id: 'd_missing' }, exec), /过期/)
})

test('an empty profile asks for one item rather than storing nothing', async () => {
  const { runtime, tools } = fresh()
  const first = await tools.record.execute({ kind: 'profile' }, exec)
  assert.match(first.text, /性别、出生年份/)
  assert.equal(runtime.store.all().length, 0)
  const second = await tools.record.execute({ draft_id: first.draft_id, height: 176 }, exec)
  assert.equal(second.ok, true)
  assert.equal(runtime.store.all()[0].height, 176)
})

test('the profile supplies the sex the ranges need', async () => {
  const { runtime, tools } = fresh()
  await tools.record.execute({ kind: 'profile', sex: 'male', birth_year: 1985 }, exec)
  await tools.measure.execute({ date: '2026-08-12', lines: ['肌酐 80 umol/L'] }, exec)
  const crea = runtime.store.all().find((record) => record.analyte === 'crea')
  assert.equal(crea.ref.low, 57)
  assert.equal(crea.ref.high, 97)
  assert.equal(crea.ref_source, 'dictionary')
})

test('the archive can be read back and summarized', async () => {
  const { runtime, tools } = fresh()
  await tools.measure.execute({ date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37'] }, exec)
  await tools.record.execute({ kind: 'condition', date: '2025-01-01', name: '高血压' }, exec)

  const query = await tools.query.execute({ kind: 'observation' }, exec)
  assert.equal(query.count, 1)
  assert.match(query.text, /低密度脂蛋白胆固醇/)

  const doctor = await tools.doctor.execute({}, exec)
  assert.equal(doctor.records, 2)
  assert.equal(doctor.abnormal, 1)
  assert.equal(runtime.store.all().length, 2)
})
