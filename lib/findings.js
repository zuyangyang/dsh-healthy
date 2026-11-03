/**
 * The physical-exam half of a checkup: what the doctor wrote under 检查所见.
 *
 * These are qualitative ("心律齐", "甲状腺未见明显异常") and they need their own
 * shape, but they also serve as the segmentation key: the text arrives one cell
 * per line, so the only way to know where one finding ends and the next begins
 * is that the item names come from a known list.
 * @module dsh-healthy/findings
 */

/** 内科 / 外科 / 眼科 / 耳鼻咽喉科 / 口腔 item names, in report order. */
export const EXAM_ITEMS = {
  内科: [
    ['history_note', '病史'], ['family_note', '家族史'], ['hr', '心率'], ['rhythm', '心律'],
    ['heart_sound', '心音'], ['lung_ausc', '肺部听诊'], ['liver_palp', '肝脏触诊'],
    ['spleen_palp', '脾脏触诊'], ['kidney_perc', '肾脏叩诊'], ['internal_other', '内科其它'],
  ],
  外科: [
    ['skin', '皮肤'], ['lymph_nodes', '浅表淋巴结'], ['thyroid_exam', '甲状腺(外科)'],
    ['breast_exam', '乳房'], ['spine', '脊柱'], ['joints', '四肢关节'],
    ['genital_exam', '外生殖器'], ['dre', '肛门、直肠指诊'], ['prostate_exam', '前列腺(外科)'],
    ['surgery_other', '外科其它'],
  ],
  眼科: [
    ['va_r', '裸视力(右)'], ['va_l', '裸视力(左)'], ['cva_r', '矫正视力(右)'],
    ['cva_l', '矫正视力(左)'], ['color_vision', '色觉'], ['external_eye', '外眼'],
    ['slit_lamp', '裂隙灯检查'], ['fundus', '眼底镜检查'], ['eye_other', '眼科其它'],
  ],
  耳鼻咽喉科: [
    ['ent_ear', '耳'], ['ent_nose', '鼻'], ['ent_throat', '咽'], ['ent_other', '耳鼻咽喉科其它'],
  ],
  口腔: [
    ['teeth', '牙齿'], ['gums', '牙龈'], ['oral_mucosa', '口腔粘膜'], ['oral_other', '口腔其它'],
  ],
}

/** Section headings that open a table of measured values. */
export const MEASURE_SECTIONS = new Set(['一般检查室', '一般检查'])

/** Section headings that open a table of printed lab values. */
export const LAB_SECTIONS = new Set(['实验室检查', '尿常规', '血常规', '血生化', '生化检查', '检验科'])

/** Section headings that open an exam narrative. */
export const EXAM_SECTIONS = new Set(['内科', '外科', '眼科', '耳鼻咽喉科', '口腔'])

/** Headings that describe imaging; parsed as documents, kept verbatim. */
export const IMAGING_SECTIONS = new Set(['超声', '放射科', '彩超', 'CT', '核磁'])

/** 名称 -> [科室, 项目 id] */
const ITEM_INDEX = new Map()
for (const [department, items] of Object.entries(EXAM_ITEMS)) {
  for (const [id, name] of items) ITEM_INDEX.set(name, { department, id })
}

/**
 * @param {string} name - a line that might be an exam item.
 * @returns {{department: string, id: string}|null} match.
 */
export function examItem(name) {
  return ITEM_INDEX.get(String(name ?? '').trim()) ?? null
}

/**
 * Classify a section heading.
 * @param {string} name - heading text.
 * @returns {{type: string, department?: string}|null} section kind.
 */
export function sectionKind(name) {
  const text = String(name ?? '').trim()
  if (MEASURE_SECTIONS.has(text)) return { type: 'measure' }
  if (LAB_SECTIONS.has(text)) return { type: 'lab' }
  if (EXAM_SECTIONS.has(text)) return { type: 'exam', department: text }
  if (IMAGING_SECTIONS.has(text)) return { type: 'imaging', department: text }
  return null
}

const NORMAL = /^(未见明显异常|未见异常|正常|无|齐|阴性|-|未触及|未闻及|无异常|未见)$/
const SKIPPED = /^(放弃检查|拒检|未查|未做)$/

/**
 * Read a 检查所见 value.
 * @param {string} text - value text.
 * @returns {{is_normal: boolean|null, skipped: boolean}} reading.
 */
export function readFinding(text) {
  const value = String(text ?? '').trim()
  if (SKIPPED.test(value)) return { is_normal: null, skipped: true }
  if (NORMAL.test(value)) return { is_normal: true, skipped: false }
  if (/^(阳性|\+|\+\+|异常)/.test(value)) return { is_normal: false, skipped: false }
  return { is_normal: null, skipped: false }
}
