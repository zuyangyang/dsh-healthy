import assert from 'node:assert/strict'
import test from 'node:test'

import { allAnalytes, byCategory, byId, isAnalyteName, lookup, refFor } from '../lib/analytes.js'

test('the dictionary covers the checkup panels we care about', () => {
  assert.ok(allAnalytes().length >= 60)
  for (const category of ['blood', 'urine', 'liver', 'kidney', 'lipid', 'glycemic', 'thyroid', 'vital']) {
    assert.ok(byCategory(category).length > 0, category)
  }
})

test('names and abbreviations resolve to the same id', () => {
  assert.equal(lookup('低密度脂蛋白胆固醇').id, 'ldl_c')
  assert.equal(lookup('LDL-C').id, 'ldl_c')
  assert.equal(lookup('ldl-c').id, 'ldl_c')
  assert.equal(lookup('甘油三脂').id, 'tg')
  assert.equal(lookup('谷丙转氨酶').id, 'alt')
  assert.equal(lookup('HbA1c').id, 'hba1c')
})

test('an unknown name stays unknown instead of matching something close', () => {
  assert.equal(lookup('糖化血清蛋白'), null)
  assert.equal(lookup('尿酸尿素'), null)
  assert.equal(isAnalyteName('低密度脂蛋白胆固醇'), true)
  assert.equal(isAnalyteName('低密度脂蛋白胆固醇x'), false)
})

test('sex-specific ranges pick the right half', () => {
  const crea = byId('crea')
  assert.deepEqual(refFor(crea, 'male'), { low: 57, high: 97 })
  assert.deepEqual(refFor(crea, 'female'), { low: 41, high: 73 })
  assert.deepEqual(refFor(crea, null), { low: 57, high: 97 })
})

test('a range that does not depend on sex is returned as is', () => {
  assert.deepEqual(refFor(byId('alt'), 'female'), { low: 0, high: 50 })
  assert.equal(refFor(byId('u_pro'), 'male'), null)
})
