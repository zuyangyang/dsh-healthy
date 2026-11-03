import assert from 'node:assert/strict'
import test from 'node:test'

import { flagFor, parseRange, qualitativeFlag } from '../lib/reference.js'

test('a printed range is read in either direction', () => {
  assert.deepEqual(parseRange('0-50'), { low: 0, high: 50, text: '0-50' })
  assert.deepEqual(parseRange('1.1-3.2'), { low: 1.1, high: 3.2, text: '1.1-3.2' })
  assert.deepEqual(parseRange('3.2-1.1'), { low: 1.1, high: 3.2, text: '3.2-1.1' })
})

test('one-sided ranges keep their open end', () => {
  assert.deepEqual(parseRange('<5.0'), { low: null, high: 5, text: '<5.0' })
  assert.deepEqual(parseRange('>1.0'), { low: 1, high: null, text: '>1.0' })
})

test('nonsense is not a range', () => {
  assert.equal(parseRange('阴性'), null)
  assert.equal(parseRange(''), null)
})

test('flags follow the report range, including the far side', () => {
  assert.equal(flagFor(24.6, parseRange('0-26')), null)
  assert.equal(flagFor(37, parseRange('39-52')), 'L')
  assert.equal(flagFor(4.8, parseRange('3.5-9.5')), null)
  assert.equal(flagFor(12, parseRange('3.5-9.5')), 'H')
})

test('a value far past the edge is marked as plainly abnormal', () => {
  assert.equal(flagFor(30, parseRange('10-14')), 'HH')
  assert.equal(flagFor(2, parseRange('10-14')), 'LL')
})

test('a missing value never produces a flag', () => {
  assert.equal(flagFor(null, parseRange('0-50')), null)
  assert.equal(flagFor(undefined, parseRange('0-50')), null)
})

test('qualitative results are read against what positive means', () => {
  assert.equal(qualitativeFlag('阴性'), false)
  assert.equal(qualitativeFlag('阳性'), true)
  assert.equal(qualitativeFlag('弱阳性'), true)
  assert.equal(qualitativeFlag('阳性', { positiveMeaning: 'normal' }), false)
  assert.equal(qualitativeFlag('说不清'), null)
})
