/**
 * Identifier derivation. The model never supplies these (see DESIGN.md 4.5).
 * @module dsh-healthy/ids
 */

import { randomBytes } from 'node:crypto'
import { sha256hex } from './util.js'

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

function base32(bytes, length) {
  let out = ''
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    out += ALPHABET[bytes[i] % 32]
  }
  return out.slice(0, length)
}

/** Sortable record id: h_<time36><random>. */
export function newRecordId(now = new Date()) {
  return 'h_' + now.getTime().toString(36) + base32(randomBytes(6), 6)
}

/**
 * Idempotency key derived from what the model can actually see. Repeats of the
 * same message (retry, replay, double submit) collapse onto one key.
 */
export function deriveRequestId({ sessionId, messageId, toolName, itemIndex, payloadHash }) {
  return 'req_' + sha256hex(
    [sessionId || '', messageId || '', toolName || '', String(itemIndex ?? ''), payloadHash || ''].join('|'),
    12,
  )
}

/** Report item key: the same analyte on the same report is one observation. */
export function deriveItemKey({ reportId, analyte, analyteText, value, unit }) {
  return sha256hex([reportId || '', analyte || analyteText || '', String(value ?? ''), unit || ''].join('|'), 16)
}
