/**
 * Configuration defaults. Anything the user leaves out has to produce a working
 * archive, because the first thing a new member does is paste a report.
 * @module dsh-healthy/config
 */

import { expandHome } from './util.js'

export const DEFAULT_DATA_DIR = '~/.dsh/healthy'

/** The shared bucket: records nobody has claimed yet. */
export const DEFAULT_OWNER = 'default'

/**
 * @param {object} [raw] - user configuration.
 * @returns {object} normalized configuration.
 */
export function normalizeConfig(raw = {}) {
  const requested = typeof raw.dataDir === 'string' && raw.dataDir.trim().length > 0
    ? raw.dataDir.trim()
    : DEFAULT_DATA_DIR
  const dataDir = expandHome(requested)
  const defaultDataDir = expandHome(DEFAULT_DATA_DIR)
  const fallbackOwner = typeof raw.fallbackOwner === 'string' && raw.fallbackOwner.trim().length > 0
    ? raw.fallbackOwner.trim()
    : DEFAULT_OWNER

  return {
    enabled: raw.enabled !== false,
    dataDir,
    defaultDataDir,
    dataDirIsDefault: dataDir === defaultDataDir,
    identity: raw.identity === 'auth' ? 'auth' : 'single',
    fallbackOwner,
    brief: raw.brief !== false,
    skill: raw.skill !== false,
    redactErrors: raw.redactErrors !== false,
    diag: raw.diag === true,
  }
}
