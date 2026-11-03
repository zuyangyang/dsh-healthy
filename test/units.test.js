import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalUnit, convertValue, isUnit, looksMisplaced } from '../lib/units.js'

test('units from both halves of the Unicode table unify', () => {
  assert.equal(canonicalUnit('\u03BCmol/L'), 'umol/L')
  assert.equal(canonicalUnit(' kg '), 'Kg')
})

test('only real units are recognized', () => {
  assert.equal(isUnit('mmol/L'), true)
  assert.equal(isUnit('10^9/L'), true)
  assert.equal(isUnit('次/分'), true)
  assert.equal(isUnit('阴性'), false)
  assert.equal(isUnit('ALT'), false)
})

test('the conversions that are safe are applied', () => {
  assert.equal(Math.round(convertValue('fpg', 100, 'mg/dL', 'mmol/L') * 100) / 100, 5.56)
  assert.equal(convertValue('crea', 1.0, 'mg/dL', 'umol/L'), 88.4)
  assert.equal(convertValue('hgb', 15.2, 'g/dL', 'g/L'), 152)
})

test('an unknown pair is left alone rather than guessed', () => {
  assert.equal(convertValue('wbc', 5, 'bogus', 'other'), 5)
  assert.equal(convertValue('alt', 18, 'U/L', 'U/L'), 18)
})

test('a value a hundred times off its usual range is suspicious', () => {
  assert.equal(looksMisplaced(560, { low: 3.9, high: 6.1 }), true)
  assert.equal(looksMisplaced(5.6, { low: 3.9, high: 6.1 }), false)
  assert.equal(looksMisplaced(5.6, null), false)
})
