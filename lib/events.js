/**
 * What a stored health record must look like.
 *
 * Validation is deliberately shallow: enough to keep a query from tripping over
 * a record it cannot render, not enough to reject a real report because one
 * optional field is missing. Anything a clinician wrote and we could not
 * structure still goes in.
 * @module dsh-healthy/events
 */

export const SCHEMA_VERSION = 1

export const KINDS = [
  'observation', 'finding', 'symptom', 'condition', 'medication', 'allergy',
  'immunization', 'encounter', 'procedure', 'family_history', 'social',
  'profile', 'document', 'advice',
]

export const STATUSES = ['active', 'resolved', 'replaced', 'entered-in-error']
export const SENSITIVITY = ['normal', 'private']
export const SOURCES = ['report', 'oral', 'self_measured', 'clinic', 'import', 'review']

/** Per-kind required fields. Everything else is optional. */
export const REQUIRED_BY_KIND = {
  observation: ['analyte_text'],
  finding: ['department', 'item_text'],
  symptom: ['complaint'],
  condition: ['name'],
  medication: ['name'],
  allergy: ['substance'],
  immunization: ['vaccine'],
  encounter: ['reason'],
  procedure: ['name'],
  family_history: ['relative', 'condition'],
  social: ['topic'],
  profile: [],
  document: ['title'],
  advice: ['rule_id'],
}

/**
 * Check one record as it would be stored.
 * @param {object} record - candidate record.
 * @returns {{ok: boolean, reason?: string}} verdict.
 */
export function validateStoredRecord(record) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'not an object' }
  if (typeof record.id !== 'string' || record.id.length === 0) return { ok: false, reason: 'missing id' }
  if (!KINDS.includes(record.kind)) return { ok: false, reason: 'unknown kind: ' + record.kind }
  if (!STATUSES.includes(record.status)) return { ok: false, reason: 'unknown status: ' + record.status }
  if (record.sensitivity !== undefined && !SENSITIVITY.includes(record.sensitivity)) {
    return { ok: false, reason: 'unknown sensitivity: ' + record.sensitivity }
  }
  if (record.source !== undefined && !SOURCES.includes(record.source)) {
    return { ok: false, reason: 'unknown source: ' + record.source }
  }
  if (record.kind === 'observation') {
    const hasValue = record.value !== undefined && record.value !== null
    const hasComponents = Array.isArray(record.components) && record.components.length > 0
    if (!hasValue && !hasComponents) return { ok: false, reason: 'observation without value or components' }
  }
  for (const field of REQUIRED_BY_KIND[record.kind] || []) {
    const value = record[field]
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { ok: false, reason: record.kind + ' is missing ' + field }
    }
  }
  return { ok: true }
}

/**
 * Check a record that is about to be written.
 *
 * Stricter than the stored check: a new record must say whose file it is and
 * when the event happened, otherwise it can never be placed on a timeline.
 * @param {object} record - candidate record.
 * @returns {{ok: boolean, reason?: string}} verdict.
 */
export function validateNewRecord(record) {
  const base = validateStoredRecord(record)
  if (!base.ok) return base
  if (typeof record.subject !== 'string' || record.subject.length === 0) {
    return { ok: false, reason: 'missing subject' }
  }
  if (typeof record.effective_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.effective_on)) {
    return { ok: false, reason: 'effective_on must be YYYY-MM-DD' }
  }
  return { ok: true }
}
