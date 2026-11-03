import assert from 'node:assert/strict'
import test from 'node:test'

import { isMetaKey, isNoise, normalizeLine, normalizeReport } from '../lib/normalize.js'

test('radical forms that survive NFKC are folded', () => {
  // Copied from the real report: NFKC leaves these as radicals on its own.
  assert.equal(normalizeLine('望之京⻔诊部').includes('门诊部'), true)
  assert.equal(normalizeLine('⽅法'), '方法')
  assert.equal(normalizeLine('心律⻬'), '心律齐')
  assert.equal(normalizeLine('锁⻣上'), '锁骨上')
})

test('printer punctuation becomes one dash and ASCII brackets', () => {
  assert.equal(normalizeLine('0\u201450'), '0-50')
  assert.equal(normalizeLine('0\u201350'), '0-50')
  assert.equal(normalizeLine('\uFF080.5-1.0\uFF09'), '(0.5-1.0)')
  assert.equal(normalizeLine('\uFF1A'), ':')
})

test('page furniture is recognized as noise', () => {
  for (const line of ['健康体检报告', 'MEDICAL EXAMINATION REPORT', '先生', '用户ID', '操作者:', '===== PAGE 3 =====']) {
    assert.equal(isNoise(line), true, line)
  }
  assert.equal(isNoise('低密度脂蛋白胆固醇'), false)
  assert.equal(isNoise('3.82'), false)
})

test('report keys are separated from data lines', () => {
  assert.equal(isMetaKey('姓名'), true)
  assert.equal(isMetaKey('体检号'), true)
  assert.equal(isMetaKey('低密度脂蛋白胆固醇'), false)
})

test('a whole report comes back without furniture', () => {
  const text = ['===== PAGE 1 =====', '健康体检报告', '姓名', '张三', '', '实验室检查', '丙氨酸氨基转移酶'].join(String.fromCharCode(10))
  const lines = normalizeReport(text)
  assert.deepEqual(lines, ['===== PAGE 1 =====', '姓名', '张三', '实验室检查', '丙氨酸氨基转移酶'])
})
