import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
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

test('a record kind without its required field is refused', async () => {
  const { tools } = fresh()
  await assert.rejects(tools.record.execute({ kind: 'allergy' }, exec), /需要 substance/)
  await assert.rejects(tools.record.execute({ kind: 'nonsense' }, exec), /kind 只能是/)
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
