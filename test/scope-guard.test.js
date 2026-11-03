/**
 * Static guard: a tool may not reach around the read view.
 *
 * The whole point of lib/view.js is that one place decides who may see what.
 * A tool that reads the store directly is a permission hole that no runtime
 * test will notice until somebody else's report shows up in an answer.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOOLS_DIR = join(ROOT, 'lib', 'tools')

/** Patterns that mean a tool bypassed the view. */
const BYPASS = [
  /\.store\.all\(/,
  /\.store\.get\(/,
  /\.store\.records\b/,
  /runtime\.store\b/,
]

/**
 * @param {string} source - tool source text.
 * @returns {string[]} human-readable violations.
 */
export function findScopeViolations(source) {
  const found = []
  for (const pattern of BYPASS) {
    const match = pattern.exec(source)
    if (match) found.push('bypasses the read view: ' + match[0])
  }
  return found
}

test('the scanner flags a direct store read', () => {
  assert.equal(findScopeViolations('const rows = runtime.store.all()').length, 2)
  assert.equal(findScopeViolations('const view = runtime.view(exec); view.all()').length, 0)
  assert.equal(findScopeViolations('const view = exec.view; return view.all()').length, 0)
})

test('every tool goes through the view', () => {
  let files = []
  try {
    files = readdirSync(TOOLS_DIR).filter((name) => name.endsWith('.js'))
  } catch {
    files = []
  }
  for (const name of files) {
    const source = readFileSync(join(TOOLS_DIR, name), 'utf8')
    const violations = findScopeViolations(source)
    assert.deepEqual(violations, [], name + ': ' + violations.join('; '))
  }
})
