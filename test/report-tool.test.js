import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createRuntime } from '../lib/runtime.js'
import { createExportTool } from '../lib/tools/export.js'
import { createMeasureTool } from '../lib/tools/measure.js'
import { createReportTool } from '../lib/tools/report.js'
import { createReviewTool } from '../lib/tools/review.js'
import { createSeriesTool } from '../lib/tools/series.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REAL = join(HERE, 'fixtures', 'ikang-2026.txt')
const EXAMPLE = join(HERE, 'fixtures', 'ikang-2026.example.txt')
const hasReal = existsSync(REAL)
const reportText = readFileSync(hasReal ? REAL : EXAMPLE, 'utf8')

const exec = { session: { id: 'session-1' } }
const defineTool = (definition) => definition

function fresh() {
  const dataDir = mkdtempSync(join(tmpdir(), 'healthy-report-'))
  const runtime = createRuntime({ config: { dataDir }, logger: { info() {}, warn() {} } })
  return {
    runtime,
    report: createReportTool(runtime, defineTool),
    measure: createMeasureTool(runtime, defineTool),
    series: createSeriesTool(runtime, defineTool),
    review: createReviewTool(runtime, defineTool),
    exportTool: createExportTool(runtime, defineTool),
  }
}

test('preview reads the report but writes nothing', async () => {
  const { runtime, report } = fresh()
  const result = await report.execute({ mode: 'preview', text: reportText, date: '2026-08-12' }, exec)
  assert.equal(result.mode, 'preview')
  assert.ok(result.observations >= (hasReal ? 60 : 10), 'observations: ' + result.observations)
  assert.ok(result.findings > 0)
  assert.equal(runtime.store.all().length, 0)
  assert.match(result.text, /识别到/)
})

test('commit stores the rows and the report text verbatim', async () => {
  const { runtime, report } = fresh()
  const result = await report.execute({
    mode: 'commit', text: reportText, date: '2026-08-12', institution: '某某门诊部',
  }, exec)
  assert.ok(result.observations > 0)
  const stored = runtime.store.all()
  const document = stored.find((record) => record.kind === 'document')
  assert.ok(document)
  assert.equal(document.text, reportText)
  assert.ok(stored.some((record) => record.kind === 'finding'))
})

test('committing the same report twice does not duplicate rows', async () => {
  const { runtime, report } = fresh()
  const args = { mode: 'commit', text: reportText, date: '2026-08-12', institution: '某某门诊部' }
  const first = await report.execute(args, exec)
  const before = runtime.store.all().length
  await report.execute(args, exec)
  assert.ok(first.observations > 0)
  // Only a second document copy may be added; the rows themselves must not double.
  const observations = runtime.store.all().filter((record) => record.kind === 'observation').length
  assert.equal(observations, first.observations)
  assert.ok(runtime.store.all().length - before <= 1)
})

test('a series reports every point and the change since last time', async () => {
  const { measure, series } = fresh()
  await measure.execute({ date: '2026-01-05', lines: ['低密度脂蛋白胆固醇 3.9 mmol/L 0-3.37'] }, exec)
  await measure.execute({ date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 2.85 mmol/L 0-3.37'] }, exec)
  const result = await series.execute({ analyte: 'LDL-C' }, exec)
  assert.equal(result.points, 2)
  assert.equal(result.latest, 2.85)
  assert.equal(Math.round(result.delta * 100) / 100, -1.05)
})

test('an unknown analyte name in series is refused, not guessed', async () => {
  const { series } = fresh()
  await assert.rejects(series.execute({ analyte: '低密度脂蛋白胆固醇x' }, exec), /词典里没有/)
})

test('the review surfaces the abnormal value and the advice behind it', async () => {
  const { measure, review } = fresh()
  await measure.execute({ date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37'] }, exec)
  const result = await review.execute({}, exec)
  assert.ok(result.abnormal >= 1)
  assert.match(result.text, /低密度脂蛋白/)
  assert.match(result.text, /不是医生/)
})

test('the export card carries what a doctor asks first', async () => {
  const { measure, exportTool } = fresh()
  await measure.execute({ date: '2026-08-12', lines: ['低密度脂蛋白胆固醇 3.82 mmol/L 0-3.37'] }, exec)
  const card = await exportTool.execute({ format: 'card' }, exec)
  assert.match(card.text, /就诊摘要/)
  assert.match(card.text, /已知疾病/)
  assert.match(card.text, /最近异常指标/)

  const csv = await exportTool.execute({ format: 'csv' }, exec)
  assert.match(csv.text, /^日期,项目,数值,单位,参考区间,异常/)
})
