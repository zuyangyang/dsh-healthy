import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { defaultDataDir, normalizeConfig } from '../lib/config.js'

test('two DSH homes never share one healthy', () => {
  // The isolation story in one assertion: a second profile sets its own
  // DSH_HOME and gets its own default directory without configuring anything.
  const a = defaultDataDir({ DSH_HOME: '/tmp/home-a' })
  const b = defaultDataDir({ DSH_HOME: '/tmp/home-b' })
  assert.equal(a, join('/tmp/home-a', 'healthy'))
  assert.equal(b, join('/tmp/home-b', 'healthy'))
  assert.notEqual(a, b)
})

test('without DSH_HOME it falls back to the desktop home', () => {
  assert.equal(defaultDataDir({}), join(homedir(), '.dsh', 'healthy'))
  assert.equal(defaultDataDir({ DSH_HOME: '   ' }), join(homedir(), '.dsh', 'healthy'))
})

test('the resolved default is reported as the default, not as custom', () => {
  const config = normalizeConfig({})
  assert.equal(config.dataDir, defaultDataDir())
  assert.equal(config.dataDirIsDefault, true)
})
