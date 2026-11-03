import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseReport } from '../lib/parsers/report.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REAL = join(HERE, 'fixtures', 'ikang-2026.txt')
const EXAMPLE = join(HERE, 'fixtures', 'ikang-2026.example.txt')

// The real report is personal data and stays out of the repository; when it is
// present locally the parser is held to the stricter expectations.
const hasReal = existsSync(REAL)
const fixture = hasReal ? REAL : EXAMPLE

const parsed = parseReport(readFileSync(fixture, 'utf8'), { sex: 'male', name: hasReal ? '张三' : '示例 用户' })
const byId = new Map(parsed.items.map((item) => [item.analyte, item]))

test('rows are rebuilt from a one-cell-per-line stream', () => {
  assert.ok(parsed.items.length >= (hasReal ? 60 : 10), 'items: ' + parsed.items.length)
  assert.equal(parsed.items.length, new Set(parsed.items.map((item) => item.analyte)).size)
})

test('every rebuilt row carries a value', () => {
  const empty = parsed.items.filter((item) => item.value === null || item.value === undefined)
  assert.deepEqual(empty.map((item) => item.analyte), [])
})

test('the abbreviation column is read as a column, not as a new row', () => {
  assert.equal(byId.get('wbc')?.analyte_abbr, 'WBC')
  assert.equal(byId.get('alt')?.analyte_abbr, 'ALT')
})

test('values match what the report printed', () => {
  if (hasReal) {
    assert.equal(byId.get('ldl_c').value, 2.85)
    assert.equal(byId.get('alt').value, 18)
    assert.equal(byId.get('hgb').value, 152)
    assert.equal(byId.get('fpg').value, 4.53)
    assert.equal(byId.get('tsh').value, 1.38)
  } else {
    assert.equal(byId.get('wbc').value, 6.1)
    assert.equal(byId.get('alt').value, 22)
    assert.equal(byId.get('tsh').value, 2.1)
  }
})

test('ranges come from the report when it prints one', () => {
  const ldl = byId.get('ldl_c')
  assert.equal(ldl.ref_source, 'report')
  assert.equal(ldl.ref.text, '0-3.37')
})

test('a row without a printed range falls back to the dictionary but is not flagged', () => {
  const ibil = byId.get('ibil')
  assert.ok(ibil)
  assert.equal(ibil.ref_source, 'dictionary')
  assert.equal(ibil.flag, null)
})

test('an out-of-range value is flagged, in both directions', () => {
  if (hasReal) {
    assert.equal(byId.get('rdw_sd').flag, 'L')
  }
  for (const item of parsed.items) {
    if (item.flag === 'L') assert.ok(item.value < item.ref.high)
    if (item.flag === 'H') assert.ok(item.value > item.ref.high)
  }
})

test('physical exam findings are segmented by the department word list', () => {
  const rhythm = parsed.findings.find((finding) => finding.item === 'rhythm')
  assert.equal(rhythm.finding, '齐')
  assert.equal(rhythm.is_normal, true)
  const skipped = parsed.findings.find((finding) => finding.item === 'genital_exam')
  assert.equal(skipped.skipped, true)
  assert.equal(skipped.is_normal, null)
})

test('the sections of the report are recognized', () => {
  const names = parsed.sections.map((section) => section.name)
  assert.ok(names.includes('一般检查室'))
  assert.ok(names.includes('内科'))
  assert.ok(names.includes('实验室检查'))
})

test('a marker line that collides with an abbreviation is not a row', () => {
  const text = ['实验室检查', '检查项目', '缩写', '测量结果', '参考区间', '单位',
    'HR', '白细胞计数', 'WBC', '4.8', '3.5-9.5', '10^9/L'].join(String.fromCharCode(10))
  const one = parseReport(text, { sex: 'male' })
  assert.equal(one.items.length, 1)
  assert.equal(one.items[0].analyte, 'wbc')
  assert.equal(one.items[0].value, 4.8)
})

test('a urine dipstick row keeps its expected value as the range', () => {
  const text = ['尿常规', '检查项目', '缩写', '测量结果', '提示', '参考区间', '单位',
    '尿蛋白质', 'PRO', '阴性', '阴性', 'g/L'].join(String.fromCharCode(10))
  const one = parseReport(text)
  const item = one.items.find((entry) => entry.analyte === 'u_pro')
  assert.equal(item.value, '阴性')
  assert.equal(item.qualitative, true)
})

test('an unknown analyte is not invented into a known one', () => {
  const text = ['实验室检查', '检查项目', '缩写', '测量结果', '参考区间', '单位',
    '糖化血清蛋白', 'GSP', '1.9', '1.1-2.2', 'mmol/L'].join(String.fromCharCode(10))
  const one = parseReport(text)
  assert.equal(one.items.length, 0)
})
