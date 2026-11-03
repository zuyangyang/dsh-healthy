/**
 * The analyte dictionary: the 90-odd things a Chinese checkup report measures,
 * keyed by the names and abbreviations the reports actually print.
 *
 * It is used for three different jobs, so it has to be exact rather than
 * clever: normalizing a name to an id, deciding which line starts a new
 * table row, and supplying a fallback range when a report prints none.
 * No fuzzy matching: confusing 尿酸 with 尿素 is worse than not recognizing it.
 * @module dsh-healthy/analytes
 */

/** [id, 中文名, 缩写, category, unit, ref|null] */
const RAW = [
  // blood count
  ['wbc', '白细胞计数', 'WBC', 'blood', '10^9/L', { low: 3.5, high: 9.5 }],
  ['rbc', '红细胞计数', 'RBC', 'blood', '10^12/L', { male: { low: 4.3, high: 5.8 }, female: { low: 3.8, high: 5.1 } }],
  ['hgb', '血红蛋白', 'Hb', 'blood', 'g/L', { male: { low: 130, high: 175 }, female: { low: 115, high: 150 } }],
  ['hct', '红细胞比容', 'HCT', 'blood', '%', { male: { low: 40, high: 50 }, female: { low: 35, high: 45 } }],
  ['mcv', '平均红细胞体积', 'MCV', 'blood', 'fL', { low: 82, high: 100 }],
  ['mch', '平均红细胞血红蛋白含量', 'MCH', 'blood', 'pg', { low: 27, high: 34 }],
  ['mchc', '平均红细胞血红蛋白浓度', 'MCHC', 'blood', 'g/L', { low: 316, high: 354 }],
  ['rdw_cv', '红细胞分布宽度-变异系数', 'RDW-CV', 'blood', '%', { low: 11, high: 16 }],
  ['rdw_sd', '红细胞分布宽度-标准差', 'RDW-SD', 'blood', 'fL', { low: 39, high: 52 }],
  ['plt', '血小板计数', 'PLT', 'blood', '10^9/L', { low: 125, high: 350 }],
  ['mpv', '平均血小板体积', 'MPV', 'blood', 'fL', { low: 7, high: 13 }],
  ['pdw', '血小板分布宽度', 'PDW', 'blood', '%', { low: 9, high: 17 }],
  ['pct', '血小板压积', 'PCT', 'blood', '%', { low: 0.1, high: 0.35 }],
  ['lymph_pct', '淋巴细胞百分比', 'LYMPH%', 'blood', '%', { low: 20, high: 50 }],
  ['neut_pct', '中性粒细胞百分比', 'NEUT%', 'blood', '%', { low: 40, high: 75 }],
  ['lymph', '淋巴细胞绝对值', 'LYMPH', 'blood', '10^9/L', { low: 1.1, high: 3.2 }],
  ['neut', '中性粒细胞绝对值', 'NEUT', 'blood', '10^9/L', { low: 1.8, high: 6.3 }],
  ['mono_pct', '单核细胞百分比', 'MONO%', 'blood', '%', { low: 3, high: 10 }],
  ['mono', '单核细胞绝对值', 'MONO', 'blood', '10^9/L', { low: 0.1, high: 0.6 }],
  ['eos_pct', '嗜酸性细胞百分比', 'EOS%', 'blood', '%', { low: 0.4, high: 8 }],
  ['eos', '嗜酸性细胞绝对值', 'EOS', 'blood', '10^9/L', { low: 0.02, high: 0.52 }],
  ['baso_pct', '嗜碱性细胞百分比', 'BASO%', 'blood', '%', { low: 0, high: 1 }],
  ['baso', '嗜碱性细胞绝对值', 'BASO', 'blood', '10^9/L', { low: 0, high: 0.06 }],
  // urine
  ['u_sg', '尿比重', 'SG', 'urine', null, { low: 1.005, high: 1.03 }],
  ['u_ph', '尿酸碱度', 'PH', 'urine', null, { low: 5, high: 7.5 }],
  ['u_leu', '尿白细胞', 'LEU', 'urine', 'cells/uL', null],
  ['u_nit', '尿亚硝酸盐', 'NIT', 'urine', null, null],
  ['u_pro', '尿蛋白质', 'PRO', 'urine', 'g/L', null],
  ['u_glu', '尿糖', 'GLU', 'urine', 'mmol/L', null],
  ['u_ket', '尿酮体', 'KET', 'urine', 'mmol/L', null],
  ['u_uro', '尿胆原', 'URO', 'urine', 'umol/L', null],
  ['u_bil', '尿胆红素', 'BIL', 'urine', null, null],
  ['u_bld', '尿隐血', 'BLD', 'urine', 'cells/uL', null],
  // liver
  ['alt', '丙氨酸氨基转移酶', 'ALT', 'liver', 'U/L', { low: 0, high: 50 }],
  ['ast', '天门冬氨酸氨基转移酶', 'AST', 'liver', 'U/L', { low: 0, high: 40 }],
  ['ggt', 'γ-谷氨酰转移酶', 'GGT', 'liver', 'U/L', { low: 10, high: 60 }],
  ['alp', '碱性磷酸酶', 'ALP', 'liver', 'U/L', { low: 45, high: 125 }],
  ['tbil', '总胆红素', 'TBIL', 'liver', 'umol/L', { low: 0, high: 26 }],
  ['dbil', '直接胆红素', 'DBIL', 'liver', 'umol/L', { low: 0, high: 10 }],
  ['ibil', '间接胆红素', 'IBIL', 'liver', 'umol/L', { low: 0, high: 20 }],
  ['tp', '总蛋白', 'TP', 'liver', 'g/L', { low: 65, high: 85 }],
  ['alb', '白蛋白', 'ALB', 'liver', 'g/L', { low: 40, high: 55 }],
  ['glb', '球蛋白', 'GLb', 'liver', 'g/L', { low: 20, high: 40 }],
  ['ag_ratio', '白蛋白/球蛋白比值', 'A/G', 'liver', null, { low: 1.2, high: 2.4 }],
  // kidney
  ['urea', '尿素', 'UREA', 'kidney', 'mmol/L', { low: 3.1, high: 8 }],
  ['crea', '肌酐', 'Cr', 'kidney', 'umol/L', { male: { low: 57, high: 97 }, female: { low: 41, high: 73 } }],
  ['ua', '尿酸', 'UA', 'kidney', 'umol/L', { male: { low: 210, high: 420 }, female: { low: 155, high: 357 } }],
  // lipid
  ['tc', '总胆固醇', 'TC', 'lipid', 'mmol/L', { low: 0, high: 5.2 }],
  ['tg', '甘油三酯', 'TG', 'lipid', 'mmol/L', { low: 0, high: 1.7 }],
  ['hdl_c', '高密度脂蛋白胆固醇', 'HDL-C', 'lipid', 'mmol/L', { low: 1.04, high: 2.0 }],
  ['ldl_c', '低密度脂蛋白胆固醇', 'LDL-C', 'lipid', 'mmol/L', { low: 0, high: 3.37 }],
  // glucose
  ['fpg', '空腹血葡萄糖', 'FBG', 'glycemic', 'mmol/L', { low: 3.9, high: 6.1 }],
  ['hba1c', '糖化血红蛋白', 'HbA1c', 'glycemic', '%', { low: 4, high: 6 }],
  // thyroid
  ['ft3', '游离三碘甲状腺原氨酸', 'FT3', 'thyroid', 'pmol/L', { low: 3.1, high: 6.8 }],
  ['ft4', '游离甲状腺素', 'FT4', 'thyroid', 'pmol/L', { low: 12, high: 22 }],
  ['t3', '三碘甲状腺原氨酸', 'T3', 'thyroid', 'nmol/L', { low: 1.3, high: 3.1 }],
  ['t4', '甲状腺素', 'T4', 'thyroid', 'nmol/L', { low: 66, high: 181 }],
  ['tsh', '促甲状腺激素', 'TSH', 'thyroid', 'mIU/L', { low: 0.27, high: 4.2 }],
  // tumor markers
  ['afp', '甲胎蛋白定量', 'AFP', 'tumor', 'ng/mL', { low: 0, high: 7 }],
  ['cea', '癌胚抗原定量', 'CEA', 'tumor', 'ng/mL', { low: 0, high: 5 }],
  // general measurements
  ['height', '身高', null, 'vital', 'cm', null],
  ['weight', '体重', null, 'vital', 'Kg', null],
  ['bmi', '体重指数', 'BMI', 'vital', null, { low: 18.5, high: 23.99 }],
  ['body_fat', '体脂肪率', null, 'vital', '%', { low: 11, high: 21 }],
  ['sbp', '收缩压', 'SBP', 'vital', 'mmHg', { low: 90, high: 139 }],
  ['dbp', '舒张压', 'DBP', 'vital', 'mmHg', { low: 60, high: 89 }],
  ['hr', '心率', 'HR', 'vital', '次/分', { low: 60, high: 100 }],
  ['temp', '体温', 'T', 'vital', 'C', { low: 36, high: 37.2 }],
  ['waist', '腰围', null, 'vital', 'cm', { male: { low: 0, high: 90 }, female: { low: 0, high: 85 } }],
]

/** Extra names seen in the wild for the same analyte. */
const ALIASES = [
  ['alt', ['谷丙转氨酶', 'ALT(GPT)', 'GPT']],
  ['ast', ['谷草转氨酶', 'AST(GOT)', 'GOT']],
  ['ggt', ['谷氨酰转肽酶', 'γ-GT', 'GGT']],
  ['tbil', ['总胆红素(干化学)']],
  ['hgb', ['血红蛋白浓度', 'HGB', 'HB']],
  ['fpg', ['空腹血糖', '葡萄糖', 'GLU(血清)', 'FPG']],
  ['hba1c', ['糖化血红蛋白A1c', 'HbA1c%', 'GHb']],
  ['crea', ['血肌酐', 'CREA', 'CRE']],
  ['urea', ['尿素氮', 'BUN', 'UREA']],
  ['ua', ['血尿酸', 'URIC']],
  ['tc', ['胆固醇', 'CHOL', 'TCHO']],
  ['tg', ['甘油三脂', 'TRIG']],
  ['hdl_c', ['高密度脂蛋白', 'HDL']],
  ['ldl_c', ['低密度脂蛋白', 'LDL']],
  ['plt', ['血小板', 'PLT']],
  ['wbc', ['白细胞', 'WBC']],
  ['rbc', ['红细胞', 'RBC']],
  ['neut', ['中性粒细胞', 'NEUT#']],
  ['lymph', ['淋巴细胞', 'LYMPH#']],
  ['tsh', ['促甲状腺素', 'TSH']],
  ['afp', ['甲胎蛋白', 'AFP']],
  ['cea', ['癌胚抗原', 'CEA']],
]

const BY_ID = new Map()
const BY_KEY = new Map()

const keyOf = (text) => String(text ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()

for (const [id, zh, abbr, category, unit, ref] of RAW) {
  const entry = { id, zh, abbr, category, unit, ref, aliases: [] }
  BY_ID.set(id, entry)
  BY_KEY.set(keyOf(zh), entry)
  if (abbr) BY_KEY.set(keyOf(abbr), entry)
}

for (const [id, names] of ALIASES) {
  const entry = BY_ID.get(id)
  for (const name of names) {
    entry.aliases.push(name)
    if (!BY_KEY.has(keyOf(name))) BY_KEY.set(keyOf(name), entry)
  }
}

/** How the checkup prints an abnormality. */
export const FLAG_LABELS = { H: '偏高', L: '偏低', HH: '明显偏高', LL: '明显偏低' }

/**
 * @param {string} text - 中文名 or 缩写.
 * @returns {object|null} dictionary entry.
 */
export function lookup(text) {
  return BY_KEY.get(keyOf(text)) ?? null
}

/**
 * @param {string} id - analyte id.
 * @returns {object|null} dictionary entry.
 */
export function byId(id) {
  return BY_ID.get(id) ?? null
}

/**
 * @param {string} text - 中文名 or 缩写.
 * @returns {boolean} true when the dictionary knows it.
 */
export function isAnalyteName(text) {
  return BY_KEY.has(keyOf(text))
}

/**
 * Resolve the range that applies to one person.
 * @param {object} entry - dictionary entry.
 * @param {'male'|'female'|null} sex - who the record is about.
 * @returns {{low?: number, high?: number}|null} range.
 */
export function refFor(entry, sex = null) {
  const ref = entry?.ref
  if (!ref) return null
  if (ref.male || ref.female) return (sex && ref[sex]) || ref.male || ref.female || null
  return ref
}

/** All entries, in dictionary order. */
export function allAnalytes() {
  return [...BY_ID.values()]
}

/** Entries in one category. */
export function byCategory(category) {
  return allAnalytes().filter((entry) => entry.category === category)
}
