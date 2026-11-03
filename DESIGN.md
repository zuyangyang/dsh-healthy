# dsh-healthy 设计（v2，据真实报告修订）

一句话：把家里每个人的体检报告、生病经过、身体状态记成**可追溯、可比较、能直接拿给医生看**的档案。

v1 是想当然的版本。拿到真实报告（爱康国宾 2026.08.12，21 页）解析了一遍之后，有三处判断被推翻，改的地方标了 **[v2]**。

## 0. 已定的决策

| 问题 | 结论 |
|---|---|
| 报告怎么进来 | **只处理文本**。照片/PDF 的 OCR 由模型和 harness 做，插件只收文本或已抽取的结构 |
| 敏感分级 | **要**，`sensitivity: normal\|private`，默认 normal |
| 加密存储 | **不做**（忘密码等于丢档案），存储层留接口 |
| 性别/出生年 | 存在健康档案自己的 `profile` 记录里，auth 只管身份 |
| 词典 | 以 `docs/analytes-seed.md` 的 92 项为起点 |

## 1. 业内怎么建模

按事件建模，不按表单建模。记录类型对齐 HL7 FHIR：

| FHIR | 我们记什么 | 中文场景 |
|---|---|---|
| Patient | 成员基座：性别、出生年、身高、血型 | 谁 |
| Observation | 单项测量：化验值、血压、体重 | 体检表每一行 |
| DiagnosticReport | 一份报告整体（含影像结论） | 体检报告、CT |
| Condition | 持续存在的健康问题 | 高血压、甲状腺结节 |
| MedicationStatement / AllergyIntolerance / Immunization | 用药 / 过敏 / 疫苗 | 在吃什么、对什么过敏、打过什么 |
| Encounter / Procedure | 就诊 / 手术 | 去社区医院看咳嗽 |
| FamilyMemberHistory | 家族史 | 父亲糖尿病 |
| CarePlan / Goal | 建议与目标 | 3 个月后复查血脂 |
| **[v2]** finding | 体格检查的**定性所见** | 心律齐、甲状腺未触及 |

**[v2]** v1 只有数值型 Observation，漏了占比很大的一块：内科/外科/眼科/耳鼻喉/口腔的"检查所见"。它塞不进数值模型，单独一个 `finding` 形状。

编码：内部自有 `analyte id` 为主，LOINC 能确认才带；单位存"原值+原单位+标准值"；影像分级（BI-RADS/TI-RADS/Lung-RADS）必须结构化——结节随访规则依赖它。

## 2. 真实报告长什么样

### 2.1 六类页面

| 页 | 内容 | 意义 |
|---|---|---|
| 1-2 | 封面与基本信息（姓名、性别、体检号、日期、机构、婚否、出生日期） | 建档 |
| 3-7 | **重要异常结果** + **专家建议与指导** | 报告自己给的异常清单，高价值 |
| 8-16 | **健康体检结果**：一般检查室/内科/外科/眼科/耳鼻咽喉科/实验室检查/超声/放射科/口腔 | 主体 |
| 17-20 | 刷牙法、深度咨询、医学名词科普 | 噪声 |
| 21 | 字体编码损坏，抽出 `/uni0000001d` | 噪声 |

### 2.2 两类表格

**数值表**（一般检查室、实验室检查）——一格一行：
```
检查项目
缩写
测量结果
提示
参考区间
单位
HR
丙氨酸氨基转移酶
ALT
18
0—50
U/L
```

**定性表**（内科、外科、眼科、耳鼻喉、口腔）：
```
检查项目
检查所见
单位
初步意见
心率
74
次/分
心律
齐
心音
正常
```

### 2.3 五个必须处理的现实 [v2]

**① 表格结构已经没了。** 抽取工具把每个单元格按阅读顺序吐成一行，不是 `名称\t结果\t单位\t区间`。解析器不能"按列切"，只能**重建行**。

**② 重建行靠"中文名 + 缩写"锚点，不靠列序。** 实验室检查每项都是中文名紧跟一行纯 ASCII 缩写（`ALT`、`LDL-C`、`LYMPH%`）。见到"中文名 + 缩写"就开一条新记录，后面依次是结果、区间、单位，**长度不定**（间接胆红素没有区间，A/G 没有单位）。列序会错，锚点不会。

**③ 报告里的"提示"列抽出来是空的——异常必须自己算。** v1 以为能读报告上的 ↑↓。实际没有。`flag` 必须由 `value` 与 `ref` 比较得出。这反而更好：口径统一，不依赖各家报告的标记习惯。

**④ 字符是兼容区/部首形，NFKC 修不干净。** 报告里"方"是 `⽅`、"门"是 `⻔`、"齐"是 `⻬`、"齿"是 `⻮`。必须自带映射表：`⽅→方、⻔→门、⻬→齐、⻮→齿、⽛→牙、⽀→支…`。不修的话"望之京⻔诊部""心律⻬"全都匹配失败。

**⑤ 每页都有页眉页脚噪声。** 姓名/用户ID/体检号/院名/400 电话/页码/防伪码重复出现，实测会**插进表格中间**（"外科"表头和第 7 项之间就插了一段）。必须分页前按模式剥掉。

### 2.4 定性表的"行"也要靠词典切

`心律` 后面跟 `齐`、`心音` 后面跟 `正常`，抽取后全是一行一个词，无法判断 `齐` 属于谁。解法：**每个科室一份已知项目词表**（内科约 10 项、外科 12 项、眼科 7 项）。遇到词表里的项目名就开新键，到下一个键之间的所有行都是它的值。**词典既是标准化工具，也是切分工具**。

## 3. 数据模型

```js
{
  id: 'h_20261103_ab12', schema: 1,
  kind: 'observation' | 'finding' | 'condition' | 'medication' | 'allergy'
      | 'immunization' | 'encounter' | 'procedure' | 'family_history'
      | 'social' | 'profile' | 'document' | 'advice',
  subject: 'u_yang',
  status: 'active' | 'resolved' | 'replaced' | 'entered-in-error',
  supersedes: null,
  effective_on: '2026-08-12',
  recorded_at: '2026-11-03T15:20:00+08:00',
  recorded_by: '杨',
  source: 'report' | 'oral' | 'self_measured' | 'clinic',
  raw_text: '……原始那一行或那段话……',
  confidence: 0.92,
  sensitivity: 'normal' | 'private',
  tags: [],
}
```

**observation（数值）**
```js
{ kind: 'observation', analyte: 'ldl_c', analyte_text: '低密度脂蛋白胆固醇',
  analyte_abbr: 'LDL-C', category: 'lipid',
  value: 3.82, unit: 'mmol/L', value_canonical: 3.82, unit_canonical: 'mmol/L',
  ref: { low: 0, high: 3.37, text: '0—3.37' }, ref_source: 'report',
  flag: 'H', report_id: 'doc_20260812' }
```

血压这类一次多个分量用 `components`（对齐 FHIR component）。

**[v2] finding（定性所见）**
```js
{ kind: 'finding', department: '内科', item: 'rhythm', item_text: '心律',
  finding: '齐', is_normal: true, skipped: false, report_id: 'doc_20260812' }
```
`is_normal` 由"未见明显异常/正常/无/齐/阴性"判定；"放弃检查"是第三种状态 `is_normal: null, skipped: true`，**不能当正常**。

## 4. 存储

沿用账本验证过的形态：追加式 NDJSON + 内存索引 + 侧表。

```
~/.dsh/healthy/
  entries.ndjson        所有记录，一行一条，只追加
  ownership.ndjson      归属侧表
  documents/<id>.txt    报告原文，一字不改
  meta.json / exports/
```

修订 = 追加 `status: active + supersedes` 的新记录 + 一条把旧记录标 `replaced` 的补丁。文件 0600、目录 0700。

## 5. 摄入三条路径

**5.1 结构化（首选）** 模型自己读成表格，直接把数组交给 `health_measure` / `health_report`：
```js
{ report_id: 'doc_1', items: [
  { analyte_text: '低密度脂蛋白胆固醇', analyte_abbr: 'LDL-C', value: 3.82, unit: 'mmol/L', ref: '0—3.37' } ] }
```
插件负责归一化、单位换算、区间解析、异常判定、与上次比对。**最省事也最准**，skill 优先引导走这条。

**5.2 原始文本（兜底）** 整段文本丢进来（`health_report({ mode: 'text', text })`），插件跑行流重建解析器。必须有这条路径：模型可能懒得抽、文本可能来自复制粘贴、OCR 结果就是这个形态。

**5.3 口头（`health_record`）** "妈今天早上头晕，躺一会儿好些，量了血压 138/88" → 一条 symptom + 一条 observation。字段：主诉、起始、部位、性质、程度 0-10、诱因、缓解、伴随症状。

**5.4 preview / commit 两段式** preview 返回：识别到多少项、异常几项、**哪些没认出来**、哪些值可疑（单位缺失/区间矛盾/数量级离谱）。确认后 commit 落盘 + 原文存档。
未识别项目一律保留：`analyte: null` + 原名 + `needs_review: true`。宁可留一条看不懂的，也不能让"糖化血红蛋白 7.1"因为词典没这个词而消失。

## 6. 归一化与词典

**`lib/normalize.js`（v1 没有，必加）**：NFKC → 部首/兼容形映射（20 余条）→ 标点统一（`—`/`–`/`－`/`~` → `-`，全角括号→半角）→ 去空白与零宽字符 → 丢弃噪声行（`/uniXXXXXX`、纯页码、页眉页脚模式、`操作者/审核者` 块）。

**`lib/analytes.js`**：92 项起步（`docs/analytes-seed.md`），每条带 `zh[]`、`abbr[]`、`category`、`unit`、`ref<sex>`、可选 `loinc`、定性项 `positive_meaning`。
匹配顺序：缩写精确 → 中文名精确 → 别名 → 归一化后包含。**不做编辑距离模糊匹配**——把"尿酸"认成"尿素"比认不出危险得多。

## 7. 异常判定与趋势

- `flag`：`>high → H`、`<low → L`、超上限 1.5 倍或低于下限一半 → `HH/LL`；定性项按 `positive_meaning` 判断（尿蛋白阳性是异常，表面抗体阳性是好事）。
- 区间优先用报告自带的，否则词典标准区间，记 `ref_source`。
- 单位换算只做有把握的（葡萄糖 18、胆固醇 38.67、甘油三酯 88.57、肌酐 88.4、尿酸 59.48…），换不了原样存。
- **数量级校验**：换算后与词典常见范围差 100 倍以上 → 标 `suspicious` 进 preview。真实报告逼出来的——血糖写成 560 mmol/L 一眼是错的。

## 8. 身份与权限

复用账本的 `lib/view.js` + `lib/ownership.js` + `health_claim`，比账本**严格一级**：

| 场景 | 账本 | 健康档案 |
|---|---|---|
| 认不出说话人 | 写 `default` 共享桶，全家可见 | 写 `pending` 区，**只有户主可见可认领** |
| 默认可见 | 本人 + 授权者 + 共享桶 | 本人 + 授权者（**不含共享桶**） |
| 敏感记录 | 无 | `private` 级连户主都要显式授权 |
| 缺 auth | 退化成单用户 | `identity: auth` 下**拒绝出数** |

一条流水被家人看到，损失是一顿饭钱；一条"HBsAg 阳性"或"重度抑郁"被看到，损失是这个人在家里的处境。所以**不设全家默认可见的兜底**。

## 9. 跟踪与反馈

- **单指标趋势** `health_series`：所有点、Δ（vs 上次/vs 一年前）、个人基线（近 6 次中位数+MAD）、连续异常次数、首次异常日期、是否复检过。
- **时间线** `health_query mode=timeline`：症状/测量/用药/就诊混排，回答"这三个月到底怎么了"。
- **红旗分诊** `lib/redflags.js`：确定性规则，命中就是"现在就医/打 120"。胸痛+出汗、中风征象、血压≥180/110、血糖<3.9 有症状或 >16.7、高热 3 天、3 个月非主动体重下降>5%。
- **复查到期** `lib/followup.js`：血脂 3-6 月、糖化 3 月、甲功 6-12 月、结节超声 6-12 月、肠镜 5-10 年。被问才列，**不主动推送**。
- **周期综述** `health_review`：新症状、异常变化、用药变动、待复查、下月注意，每条可追到记录 id。

## 10. 建议引擎

**判定靠规则，措辞才靠模型。**
```js
{ id: 'lipid_ldl_high', when: (ctx) => ctx.latest('ldl_c')?.flag === 'H',
  level: 'attention', advice: '低密度脂蛋白偏高，先调饮食和运动，3-6 个月复查血脂',
  cite: ['ldl_c'] }
```
产出写成 `advice` 记录，下次能回答"上次让你复查血脂，做了吗"——**闭环是最值钱的反馈**。
等级 info / attention / see_doctor / urgent。输出格式固定：观察到什么 → 依据哪几条 → 建议做什么 → 什么情况必须就医。明确写"这不是诊断"。

## 11. 工具清单（9 个）

| 工具 | 用途 |
|---|---|
| `health_record` | 口头的一切：症状、就诊、用药、过敏、疫苗、手术、家族史、生活习惯、基本资料 |
| `health_measure` | 结构化测量：化验、血压、体重腰围、体温 |
| `health_report` | 整份报告：结构化数组或原始文本，preview/commit |
| `health_query` | 按时间/类型/异常/关键词查；含 timeline |
| `health_series` | 单指标趋势与基线 |
| `health_review` | 周期综述 + 红旗 + 复查到期 + 建议 |
| `health_export` | 就诊摘要卡、CSV、FHIR-lite |
| `health_claim` | 户主认领 pending 记录 |
| `health_doctor` | 自检：条数、坏行、未识别项、待复查、可疑值 |

压在 9 个：工具越多模型选错率越高，"记一条"这种高频动作必须只有一个入口。

## 12. 实现计划 [v2]

v1 把解析放在 M3 靠后。真实报告证明**解析是最大风险**（表格已碎、字符损坏、行要靠锚点重建），必须提前，并且用 fixture 驱动开发。

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0** 骨架 | store/events/ids/runtime/view/ownership/normalize + `identity: auth` | 测试绿；`scope-guard` 禁止绕过 view |
| **M1** 解析内核 | 归一化（NFKC+部首表+噪声剥离）、词典 92 项、单位、区间、行流重建 | **真 fixture 跑通：92 项认全，值/区间/单位/异常全对** |
| **M2** 测量与所见 | `health_measure`、`finding` 切分、数量级校验 | 结构化路径与文本路径结果一致 |
| **M3** 报告导入 | `health_report` preview/commit、原文存档、多报告比对、重要异常页 | preview 能准确说"3 项没认出来" |
| **M4** ✅ 口头与事实 | `health_record` 九种 kind、SOAP、回执 | 每种 kind 的必填/追问/修订链 |
| **M5** ✅ 趋势与建议 | series/timeline/redflags/advice/followup/review | 规则命中表；红旗不漏 |
| **M6** 导出收尾 | 摘要卡/CSV/FHIR-lite/doctor/verify-apply/文档/0.1.0 | 一份报告进 → 一页摘要出 |

M1 是硬骨头，也是整个插件的价值所在，单独留最多时间。

**进度（2026-11）**：M0–M5 已完成，测试 90 条。M4 的追问链在 `lib/drafts.js`：残缺的话存成草稿，返回一个问题，14 天没人回答自动丢掉；修订走 `store.revise`，同一个 id 追加新版本，日志里旧版本不动。M5 的建议闭环在 `lib/advice.js`：建议落成 `kind: 'advice'` 记录，带 baseline（当时的数值/日期/区间）和 `due_on`；判定先比红旗等级，等级相同再比超出参考区间多少，所以"还是偏高但更接近了"不会被报成"没变化"。M6 的卡片/CSV/doctor/verify 已提前落地，剩 FHIR-lite 与图片入口。

## 13. 测试

- **fixture 驱动**：`test/fixtures/ikang-2026.txt`（已脱敏：姓名/ID/电话/生日/医生名/防伪码全替换）。M1 的验收标准就是"这份报告 92 项全部正确落表"。
- **表驱动**：区间解析、单位换算、异常判定、红旗、部首映射。
- **权限矩阵**：成员 × 敏感度 × 动作，断言 allow/deny。
- **静态护栏**：扫描所有工具禁止绕过 `view`（照抄账本）。
- **不测**：模型怎么抽取（那是模型的事），只测抽取结果进来之后。

## 14. 风险

| 风险 | 应对 |
|---|---|
| 真实报告版式千变万化 | 锚点式解析 + 未识别兜底 + preview 让模型补；每来一份新报告加一个 fixture |
| 模型抽错数值（3.82→38.2） | 数量级校验 + 异常值高亮 + commit 前 preview |
| 建议被当医嘱 | 规则判定、免责声明、urgent 只给"立即就医"不给处置 |
| 隐私泄露 | 默认私有、无共享桶、敏感分级、日志脱敏、导出即披露提示 |
| 词典不够 | `needs_review` 反向补，`health_doctor` 列未识别项 |
