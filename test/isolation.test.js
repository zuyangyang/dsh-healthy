import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { defaultDataDir, normalizeConfig } from '../lib/config.js'
import { createRuntime } from '../lib/runtime.js'
import { createRecordTool } from '../lib/tools/record.js'

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

function stubAuth(ownerId, name) {
  return {
    readScope: () => new Set([ownerId, 'default']),
    mustAccess: () => ({ ownerId, ownerName: name, anonymous: false }),
    mustWrite: () => ({ ownerId, ownerName: name, actor: name, anonymous: false }),
    ownerLabel: () => name,
    actorOf: () => ({ id: ownerId, name }),
    record() {},
    findMember: () => null,
  }
}

test('a record written under auth belongs to its writer, not the shared bucket', async () => {
  // The bug this locks down: baseRecord carried only `subject`, while the view
  // filters on `ownerId`. Every record therefore resolved to the shared bucket,
  // so one member could read another member's checkup.
  const dir = mkdtempSync(join(tmpdir(), 'healthy-owner-'))
  const runtime = createRuntime({ config: { dataDir: dir, identity: 'auth' } })
  runtime.auth = stubAuth('u_yang', '杨')
  const tool = createRecordTool(runtime, (definition) => definition)

  const result = await tool.execute({ kind: 'symptom', complaint: '头痛' }, { session: { id: 's1' } })
  assert.equal(result.ok, true)

  const [record] = runtime.store.all()
  assert.equal(record.ownerId, 'u_yang')

  runtime.auth = stubAuth('u_wife', '小曼')
  assert.equal(runtime.view({ session: { id: 's2' } }).all().length, 0)

  runtime.auth = stubAuth('u_yang', '杨')
  assert.equal(runtime.view({ session: { id: 's3' } }).all().length, 1)
})
