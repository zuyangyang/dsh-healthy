import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ENTRIES_FILE, HealthStore } from '../lib/store.js'

const tempDir = () => mkdtempSync(join(tmpdir(), 'healthy-store-'))

function record(overrides = {}) {
  return {
    id: 'h_1',
    schema: 1,
    version: 1,
    kind: 'observation',
    status: 'active',
    subject: 'u_a',
    analyte_text: '低密度脂蛋白胆固醇',
    value: 3.82,
    unit: 'mmol/L',
    effective_on: '2026-08-12',
    recorded_at: '2026-08-12T10:00:00+08:00',
    ...overrides,
  }
}

test('a fresh directory yields an empty store without throwing', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  assert.deepEqual(store.all(), [])
  assert.equal(store.stats().entries, 0)
})

test('append writes one line per record and reads it back', () => {
  const dataDir = tempDir()
  const store = new HealthStore({ dataDir, logger: { warn() {} } }).init()
  store.append([record()])
  const reopened = new HealthStore({ dataDir, logger: { warn() {} } }).init()
  assert.equal(reopened.all().length, 1)
  assert.equal(reopened.get('h_1').value, 3.82)
  const lines = readFileSync(join(dataDir, ENTRIES_FILE), 'utf8').trim().split(String.fromCharCode(10))
  assert.equal(lines.length, 1)
})

test('a revised record keeps history and wins the index', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  store.append([record()])
  const { before, after } = store.revise('h_1', { value: 4.1 })
  assert.equal(before.value, 3.82)
  assert.equal(after.version, 2)
  assert.equal(store.all().length, 1)
  assert.equal(store.get('h_1').value, 4.1)
})

test('a repeated request id is reported, not written twice', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  store.append([record({ request_id: 'req_1' })])
  const result = store.append([record({ request_id: 'req_1' })])
  assert.equal(result.written.length, 0)
  assert.equal(result.duplicates.length, 1)
  assert.equal(store.all().length, 1)
})

test('a torn line is quarantined and the rest still loads', () => {
  const dataDir = tempDir()
  const store = new HealthStore({ dataDir, logger: { warn() {} } }).init()
  store.append([record()])
  writeFileSync(join(dataDir, ENTRIES_FILE), readFileSync(join(dataDir, ENTRIES_FILE), 'utf8') + '{"id":', 'utf8')
  const reopened = new HealthStore({ dataDir, logger: { warn() {} } }).init()
  assert.equal(reopened.all().length, 1)
  assert.equal(reopened.quarantined.length, 1)
})

test('a record with an unknown kind is refused at write time', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  assert.throws(() => store.append([record({ kind: 'mystery' })]), /unknown kind/)
})

test('an observation without a value or components is refused', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  assert.throws(() => store.append([record({ value: undefined })]), /without value/)
})

test('stats report size and quarantine count', () => {
  const store = new HealthStore({ dataDir: tempDir(), logger: { warn() {} } }).init()
  store.append([record()])
  const stats = store.stats()
  assert.equal(stats.entries, 1)
  assert.equal(stats.quarantined, 0)
  assert.equal(typeof stats.bytes, 'number')
})
