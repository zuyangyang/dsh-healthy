/**
 * Text normalization for Chinese medical reports.
 *
 * Report text arrives mangled in three ways that break naive matching:
 *   - CJK radical forms that NFKC does not fold (方 comes out as a radical)
 *   - dash/colon/full-width punctuation varying by printer
 *   - page furniture repeated on every page, sometimes slicing a table in half
 * Everything downstream may assume normalizeLine() has been applied.
 * @module dsh-healthy/normalize
 */

/** Radical and compatibility forms that survive NFKC. */
const RADICALS = new Map([
  ['\u2F00', '一'], ['\u2F01', '丨'], ['\u2F02', '丶'], ['\u2F03', '丿'],
  ['\u2F04', '乙'], ['\u2F05', '亅'], ['\u2F06', '二'], ['\u2F07', '亠'],
  ['\u2F08', '人'], ['\u2F09', '儿'], ['\u2F0A', '入'], ['\u2F0B', '八'],
  ['\u2F0C', '冂'], ['\u2F0D', '冖'], ['\u2F0E', '冫'], ['\u2F0F', '几'],
  ['\u2F10', '凵'], ['\u2F11', '刀'], ['\u2F12', '力'], ['\u2F13', '勹'],
  ['\u2F14', '匕'], ['\u2F15', '匚'], ['\u2F16', '匸'], ['\u2F17', '十'],
  ['\u2F18', '卜'], ['\u2F19', '卩'], ['\u2F1A', '厂'], ['\u2F1B', '厶'],
  ['\u2F1C', '又'], ['\u2F1D', '口'], ['\u2F1E', '囗'], ['\u2F1F', '土'],
  ['\u2F20', '士'], ['\u2F21', '夂'], ['\u2F22', '夊'], ['\u2F23', '夕'],
  ['\u2F24', '大'], ['\u2F25', '女'], ['\u2F26', '子'], ['\u2F27', '宀'],
  ['\u2F28', '寸'], ['\u2F29', '小'], ['\u2F2A', '尢'], ['\u2F2B', '尸'],
  ['\u2F2C', '屮'], ['\u2F2D', '山'], ['\u2F2E', '巛'], ['\u2F2F', '工'],
  ['\u2F30', '己'], ['\u2F31', '巾'], ['\u2F32', '干'], ['\u2F33', '幺'],
  ['\u2F34', '广'], ['\u2F35', '廴'], ['\u2F36', '廾'], ['\u2F37', '弋'],
  ['\u2F38', '弓'], ['\u2F39', '彐'], ['\u2F3A', '彡'], ['\u2F3B', '彳'],
  ['\u2F3C', '心'], ['\u2F3D', '戈'], ['\u2F3E', '戶'], ['\u2F3F', '手'],
  ['\u2F40', '支'], ['\u2F41', '攴'], ['\u2F42', '文'], ['\u2F43', '斗'],
  ['\u2F44', '斤'], ['\u2F45', '方'], ['\u2F46', '无'], ['\u2F47', '日'],
  ['\u2F48', '曰'], ['\u2F49', '月'], ['\u2F4A', '木'], ['\u2F4B', '欠'],
  ['\u2F4C', '止'], ['\u2F4D', '歹'], ['\u2F4E', '殳'], ['\u2F4F', '毋'],
  ['\u2F50', '比'], ['\u2F51', '毛'], ['\u2F52', '氏'], ['\u2F53', '气'],
  ['\u2F54', '水'], ['\u2F55', '火'], ['\u2F56', '爪'], ['\u2F57', '父'],
  ['\u2F58', '爻'], ['\u2F59', '爿'], ['\u2F5A', '片'], ['\u2F5B', '牙'],
  ['\u2F5C', '牛'], ['\u2F5D', '犬'], ['\u2F5E', '玄'], ['\u2F5F', '玉'],
  ['\u2F60', '瓜'], ['\u2F61', '瓦'], ['\u2F62', '甘'], ['\u2F63', '生'],
  ['\u2F64', '用'], ['\u2F65', '田'], ['\u2F66', '疋'], ['\u2F67', '疒'],
  ['\u2F68', '癶'], ['\u2F69', '白'], ['\u2F6A', '皮'], ['\u2F6B', '皿'],
  ['\u2F6C', '目'], ['\u2F6D', '矛'], ['\u2F6E', '矢'], ['\u2F6F', '石'],
  ['\u2F70', '示'], ['\u2F71', '禸'], ['\u2F72', '禾'], ['\u2F73', '穴'],
  ['\u2F74', '立'], ['\u2F75', '竹'], ['\u2F76', '米'], ['\u2F77', '糸'],
  ['\u2F78', '缶'], ['\u2F79', '网'], ['\u2F7A', '羊'], ['\u2F7B', '羽'],
  ['\u2F7C', '老'], ['\u2F7D', '而'], ['\u2F7E', '耒'], ['\u2F7F', '耳'],
  ['\u2F80', '聿'], ['\u2F81', '肉'], ['\u2F82', '臣'], ['\u2F83', '自'],
  ['\u2F84', '至'], ['\u2F85', '臼'], ['\u2F86', '舌'], ['\u2F87', '舛'],
  ['\u2F88', '舟'], ['\u2F89', '艮'], ['\u2F8A', '色'], ['\u2F8B', '艸'],
  ['\u2F8C', '虍'], ['\u2F8D', '虫'], ['\u2F8E', '血'], ['\u2F8F', '行'],
  ['\u2F90', '衣'], ['\u2F91', '襾'], ['\u2F92', '見'], ['\u2F93', '角'],
  ['\u2F94', '言'], ['\u2F95', '谷'], ['\u2F96', '豆'], ['\u2F97', '豕'],
  ['\u2F98', '豸'], ['\u2F99', '貝'], ['\u2F9A', '赤'], ['\u2F9B', '走'],
  ['\u2F9C', '足'], ['\u2F9D', '身'], ['\u2F9E', '車'], ['\u2F9F', '辛'],
  ['\u2FA0', '辰'], ['\u2FA1', '辵'], ['\u2FA2', '邑'], ['\u2FA3', '酉'],
  ['\u2FA4', '釆'], ['\u2FA5', '里'], ['\u2FA6', '金'], ['\u2FA7', '長'],
  ['\u2FA8', '門'], ['\u2FA9', '阜'], ['\u2FAA', '隶'], ['\u2FAB', '隹'],
  ['\u2FAC', '雨'], ['\u2FAD', '青'], ['\u2FAE', '非'], ['\u2FAF', '面'],
  ['\u2FB0', '革'], ['\u2FB1', '韋'], ['\u2FB2', '韭'], ['\u2FB3', '音'],
  ['\u2FB4', '頁'], ['\u2FB5', '風'], ['\u2FB6', '飛'], ['\u2FB7', '食'],
  ['\u2FB8', '首'], ['\u2FB9', '香'], ['\u2FBA', '馬'], ['\u2FBB', '骨'],
  ['\u2FBC', '高'], ['\u2FBD', '髟'], ['\u2FBE', '鬥'], ['\u2FBF', '鬯'],
  ['\u2FC0', '鬲'], ['\u2FC1', '鬼'], ['\u2FC2', '魚'], ['\u2FC3', '鳥'],
  ['\u2FC4', '鹵'], ['\u2FC5', '鹿'], ['\u2FC6', '麥'], ['\u2FC7', '麻'],
  ['\u2FC8', '黃'], ['\u2FC9', '黍'], ['\u2FCA', '黑'], ['\u2FCB', '黹'],
  ['\u2FCC', '黽'], ['\u2FCD', '鼎'], ['\u2FCE', '鼓'], ['\u2FCF', '鼠'],
  ['\u2FD0', '鼻'], ['\u2FD1', '齊'], ['\u2FD2', '齒'], ['\u2FD3', '龍'],
  ['\u2FD4', '龜'], ['\u2FD5', '龠'],
])

/** Simplified radicals that are not in the Kangxi block. */
const SIMPLIFIED = new Map([
  ['⻅', '见'], ['⻔', '门'], ['⻬', '齐'], ['⻮', '齿'], ['⻢', '马'], ['⻓', '长'], ['⻣', '骨'],
  ['戶', '户'], ['檢', '检'], ['驗', '验'], ['體', '体'], ['報告', '报告'], ['區', '区'],
  ['⻛', '风'], ['⻛', '风'], ['⻆', '角'], ['⻩', '黄'], ['⻘', '青'], ['⻄', '西'],
  ['⻝', '食'], ['⺠', '民'], ['⺟', '母'], ['⺩', '王'], ['⺮', '竹'], ['⻈', '讠'],
  ['⻏', '阝'], ['⻐', '钅'], ['⻑', '长'], ['⻒', '镸'], ['⻗', '雨'],
])

const PUNCTUATION = new Map([
  ['\u2014', '-'], ['\u2013', '-'], ['\u2012', '-'], ['\uFF0D', '-'],
  ['\u2212', '-'], ['\uFF5E', '-'], ['\u301C', '-'], ['~', '-'],
  ['\uFF08', '('], ['\uFF09', ')'], ['\uFF1A', ':'], ['\uFF0C', ','],
  ['\uFF1B', ';'], ['\u3000', ' '], ['\u00B7', '·'],
])

/** Lines that are page furniture, not data. */
const NOISE = [
  /^===== PAGE \d+ =====$/,
  /^健康体检报告$/,
  /^MEDICAL EXAMINATION REPORT$/,
  /^下载爱康体检宝APP$/,
  /^查看彩色报告$/,
  /^全国统一报告解读专线:?$/,
  /^400-\d{3}-\d{4}$/,
  /^用户(ID|号)$/,
  /^先生$/,
  /^女士$/,
  /^操作者:?$/,
  /^审核者:?$/,
  /^检查者:?$/,
  /^\d{1,2}\s*\/\s*\d{1,2}$/,
  /^\d{6,}$/,
  /^\/uni[0-9a-f]{6,}$/i,
  /^[A-Za-z0-9]{32,}$/,
]

/** Report headers we want as metadata, not as table rows. */
const META_KEYS = new Set([
  '姓名', '性别', '婚否', '民族', '出生日期', '联系方式', '身份证件类别',
  '体检号', '体 检 号', '检查日期', '项目号', '类别', '部门', '单位',
  '项目简称', '员工号', '卡号', '递送地址', '递送方式', '联系电话', '用户ID',
])

/**
 * Normalize one line of report text.
 * @param {string} raw - source line.
 * @returns {string} normalized line.
 */
export function normalizeLine(raw) {
  let text = String(raw ?? '').normalize('NFKC')
  for (const [from, to] of RADICALS) text = text.split(from).join(to)
  for (const [from, to] of SIMPLIFIED) text = text.split(from).join(to)
  for (const [from, to] of PUNCTUATION) text = text.split(from).join(to)
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/**
 * @param {string} line - normalized line.
 * @returns {boolean} true when the line carries no data.
 */
export function isNoise(line) {
  if (line.length === 0) return true
  return NOISE.some((pattern) => pattern.test(line))
}

/**
 * @param {string} line - normalized line.
 * @returns {boolean} true when the line is a report metadata key.
 */
export function isMetaKey(line) {
  return META_KEYS.has(line.replace(/\s+/g, '')) || META_KEYS.has(line)
}

/**
 * Strip page furniture and return the data lines.
 * @param {string} text - whole report.
 * @returns {string[]} normalized, de-noised lines.
 */
export function normalizeReport(text) {
  const out = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (raw.includes('===== PAGE')) {
      out.push(normalizeLine(raw))
      continue
    }
    const line = normalizeLine(raw)
    if (isNoise(line)) continue
    out.push(line)
  }
  return out
}
