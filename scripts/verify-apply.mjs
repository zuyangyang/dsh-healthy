#!/usr/bin/env node
/**
 * Load the plugin the way Cordis does - apply(ctx, config) - against a fake
 * context. This catches the wiring mistakes unit tests cannot see: a plugin
 * that throws on mount, a config that does not normalize, a disposer that is
 * not returned.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'healthy-verify-home-'))
const dataDir = mkdtempSync(join(tmpdir(), 'healthy-verify-data-'))

const plugin = await import('../lib/index.js')

const tools = []
const skills = []
const prompts = []
const ctx = {
  logger: { info: () => {}, warn: () => {} },
  tools: { register: (tool) => tools.push(tool) },
  skills: { register: (skill) => skills.push(skill) },
  systemPrompt: { context: (block) => prompts.push(block) },
  inject: (names, run) => {
    // No dsh-family-auth in this check: the plugin must mount without it.
    run({ ...ctx, familyAuth: null })
  },
  effect: () => () => {},
}

const dispose = plugin.apply(ctx, { dataDir })

const problems = []
if (typeof dispose !== 'function') problems.push('apply() must return a disposer')
if (tools.length !== 9) problems.push('expected 9 tools, got ' + tools.length)
for (const tool of tools) {
  if (!tool.name || typeof tool.execute !== 'function') problems.push('tool without name/execute: ' + tool.name)
}

if (problems.length > 0) {
  for (const problem of problems) console.error('FAIL  ' + problem)
  process.exit(1)
}

dispose()
console.log('OK  mounted, tools=' + tools.length + ' dataDir=' + dataDir)
