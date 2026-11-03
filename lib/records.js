/**
 * Turning parsed rows into records.
 *
 * A record is what survives the conversation: it keeps what was measured, the
 * range it was judged against, who it belongs to and which document it came
 * from. Nothing here decides whether the value is good news - that is the
 * advice engine's job.
 * @module dsh-healthy/records
 */

import { newRecordId } from './ids.js'
import { shanghaiIso } from './util.js'

/**
 * @param {object} context - who/where/when.
 * @returns {object} the fields every record shares.
 */
export function baseRecord(context) {
  const stamp = {
    schema: 1,
    version: 1,
    status: 'active',
    supersedes: null,
    subject: context.ownerId,
    subject_name: context.ownerName,
    // Whose bucket the record reads out of: `subject` says whose body the row is
    // about, this says who may see it, and the view filters on this one. Without
    // it every record fell into the shared bucket and any member could read it.
    ownerId: context.ownerId,
    entered_by: context.enteredBy || null,
    effective_on: context.effectiveOn,
    recorded_at: shanghaiIso(context.now ? context.now() : new Date()),
    source: context.source,
    sensitivity: context.sensitivity || 'normal',
    tags: context.tags || [],
    pending: Boolean(context.pending),
  }
  return stamp
}

/**
 * @param {object} item - one parsed observation.
 * @param {object} context - who/where/when.
 * @returns {object} an observation record.
 */
export function observationRecord(item, context) {
  return {
    id: newRecordId(),
    ...baseRecord(context),
    kind: 'observation',
    analyte: item.analyte ?? null,
    analyte_text: item.analyte_text,
    analyte_abbr: item.analyte_abbr ?? null,
    category: item.category ?? null,
    value: item.value,
    qualitative: Boolean(item.qualitative),
    unit: item.unit ?? null,
    ref: item.ref ?? null,
    ref_source: item.ref_source ?? null,
    flag: item.flag ?? null,
    report_id: context.reportId ?? null,
    raw_text: item.raw_text ?? null,
    needs_review: Boolean(item.needs_review),
    warnings: item.warnings ?? [],
  }
}

/**
 * @param {object} finding - one parsed exam finding.
 * @param {object} context - who/where/when.
 * @returns {object} a finding record.
 */
export function findingRecord(finding, context) {
  return {
    id: newRecordId(),
    ...baseRecord(context),
    kind: 'finding',
    department: finding.department,
    item: finding.item,
    item_text: finding.item_text,
    finding: finding.finding,
    is_normal: finding.is_normal ?? null,
    skipped: Boolean(finding.skipped),
    report_id: context.reportId ?? null,
  }
}

/**
 * A verbatim copy of a report is itself a record, so a later question can
 * always be answered against what the paper actually said.
 * @param {{title: string, text: string, institution?: string, reportDate?: string}} doc - document.
 * @param {object} context - who/where/when.
 * @returns {object} a document record.
 */
export function documentRecord(doc, context) {
  return {
    id: newRecordId(),
    ...baseRecord(context),
    kind: 'document',
    title: doc.title,
    institution: doc.institution ?? null,
    report_date: doc.reportDate ?? null,
    text: doc.text,
    bytes: Buffer.byteLength(doc.text || '', 'utf8'),
  }
}
