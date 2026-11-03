/**
 * Configuration defaults. Anything the user leaves out has to produce a working
 * archive, because the first thing a new member does is paste a report.
 * @module dsh-healthy/config
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import { expandHome } from './util.js'

/**
 * The default archive, inside the harness home rather than at a fixed path.
 *
 * $DSH_HOME is what keeps two DSH profiles apart: the desktop app points it at
 * ~/.dsh, a second profile points it elsewhere, and neither has to configure a
 * dataDir to stay out of the other's health records. Health records are the
 * last thing that should end up shared by accident.
 * @param {object} [env] - environment to read.
 * @returns {string} absolute directory.
 */
export function defaultDataDir(env = process.env) {
  const home = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return join(home.length > 0 ? home : join(homedir(), '.dsh'), 'healthy')
}

/** How the default reads in config descriptions. */
export const DEFAULT_DATA_DIR_LABEL = '<DSH_HOME>/healthy（DSH_HOME 未设置时是 ~/.dsh/healthy）'

/** The shared bucket: records nobody has claimed yet. */
export const DEFAULT_OWNER = 'default'

/**
 * @param {object} [raw] - user configuration.
 * @returns {object} normalized configuration.
 */
export function normalizeConfig(raw = {}) {
  const fallbackDir = defaultDataDir()
  const requested = typeof raw.dataDir === 'string' && raw.dataDir.trim().length > 0
    ? raw.dataDir.trim()
    : fallbackDir
  const dataDir = expandHome(requested)
  const defaultDir = fallbackDir
  const fallbackOwner = typeof raw.fallbackOwner === 'string' && raw.fallbackOwner.trim().length > 0
    ? raw.fallbackOwner.trim()
    : DEFAULT_OWNER

  return {
    enabled: raw.enabled !== false,
    dataDir,
    defaultDataDir: defaultDir,
    dataDirIsDefault: dataDir === defaultDir,
    identity: raw.identity === 'auth' ? 'auth' : 'single',
    fallbackOwner,
    brief: raw.brief !== false,
    skill: raw.skill !== false,
    redactErrors: raw.redactErrors !== false,
    diag: raw.diag === true,
  }
}
