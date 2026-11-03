/**
 * One runtime per plugin activation: config, store, ownership and the clock.
 * Tools read from it instead of closing over module state.
 * @module dsh-healthy/runtime
 */

import { normalizeConfig } from './config.js'
import { appendOwnership, loadOwnership } from './ownership.js'
import { HealthStore } from './store.js'
import { createView } from './view.js'

/**
 * @param {{config?: object, logger?: object, now?: () => Date}} [input] - runtime inputs.
 * @returns {object} the runtime.
 */
export function createRuntime({ config: rawConfig = {}, logger = console, now = () => new Date() } = {}) {
  const config = normalizeConfig(rawConfig)
  const store = new HealthStore({ dataDir: config.dataDir, logger }).init()
  const owners = loadOwnership(config.dataDir)

  const runtime = {
    config,
    store,
    owners,
    logger,
    now,
    /** dsh-family-auth service, attached by the entry point when present. */
    auth: null,

    /** The scoped read view for one execution. */
    view(exec) {
      return createView(runtime, exec)
    },

    /** Persist new records. */
    persist(records) {
      return store.append(records)
    },

    /** Apply a patch to one record as a new revision. */
    revise(id, patch, options) {
      return store.revise(id, patch, options)
    },

    /**
     * Record ownership for existing records (migration and claim).
     * @param {Array<{recordId: string, ownerId: string}>} entries - facts to append.
     * @param {{by?: string, reason?: string}} [meta] - who decided and why.
     * @returns {number} how many were written.
     */
    claim(entries, meta = {}) {
      const at = new Date().toISOString()
      const stamped = entries.map((entry) => ({
        recordId: entry.recordId,
        ownerId: entry.ownerId,
        at,
        by: meta.by || null,
        reason: meta.reason || 'claim',
      }))
      const written = appendOwnership(config.dataDir, stamped)
      for (const entry of stamped) owners.set(entry.recordId, entry.ownerId)
      return written
    },

    dispose() {},
  }

  return runtime
}
