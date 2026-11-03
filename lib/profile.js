/**
 * The member's baseline: sex, birth year, height, blood type.
 *
 * It is a normal record, not configuration, so it travels with the archive and
 * gets the same permissions as everything else.
 * @module dsh-healthy/profile
 */

/**
 * Latest profile for one subject.
 * @param {object[]} records - visible records.
 * @param {string} ownerId - subject id.
 * @returns {object|null} the profile fields, or null.
 */
export function profileOf(records, ownerId) {
  const profiles = records
    .filter((record) => record.kind === 'profile' && record.subject === ownerId && record.status === 'active')
    .sort((a, b) => String(a.effective_on).localeCompare(String(b.effective_on)))
  return profiles.length > 0 ? profiles[profiles.length - 1] : null
}

/**
 * Sex as the reference ranges need it.
 * @param {object|null} profile - profile record.
 * @returns {'male'|'female'|null} sex.
 */
export function sexOf(profile) {
  const value = String(profile?.sex ?? '').toLowerCase()
  if (value === 'male' || value === '男' || value === 'm') return 'male'
  if (value === 'female' || value === '女' || value === 'f') return 'female'
  return null
}
