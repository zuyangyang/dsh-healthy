# 词典种子（来自真实报告）

从样例报告（爱康国宾 2026.08.12，21 页）里实际抽出的项目。M1 的 `lib/analytes.js` 以这份清单为起点，
每条补上单位、参考区间（分性别）、LOINC（能确认的）、`positive_meaning`（定性项阳性是好是坏）。

全表共 92 项。

## 血常规（23）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 白细胞计数 | WBC | `wbc` |
| 红细胞计数 | RBC | `rbc` |
| 血红蛋白 | Hb | `hgb` |
| 红细胞比容 | HCT | `hct` |
| 平均红细胞体积 | MCV | `mcv` |
| 平均红细胞血红蛋白含量 | MCH | `mch` |
| 平均红细胞血红蛋白浓度 | MCHC | `mchc` |
| 红细胞分布宽度-变异系数 | RDW-CV | `rdw_cv` |
| 红细胞分布宽度-标准差 | RDW-SD | `rdw_sd` |
| 血小板计数 | PLT | `plt` |
| 平均血小板体积 | MPV | `mpv` |
| 血小板分布宽度 | PDW | `pdw` |
| 血小板压积 | PCT | `pct` |
| 淋巴细胞百分比 | LYMPH% | `lymph_pct` |
| 中性粒细胞百分比 | NEUT% | `neut_pct` |
| 淋巴细胞绝对值 | LYMPH | `lymph` |
| 中性粒细胞绝对值 | NEUT | `neut` |
| 单核细胞百分比 | MONO% | `mono_pct` |
| 单核细胞绝对值 | MONO | `mono` |
| 嗜酸性细胞百分比 | EOS% | `eos_pct` |
| 嗜酸性细胞绝对值 | EOS | `eos` |
| 嗜碱性细胞百分比 | BASO% | `baso_pct` |
| 嗜碱性细胞绝对值 | BASO | `baso` |

## 尿常规（10）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 尿比重 | SG | `u_sg` |
| 尿酸碱度 | PH | `u_ph` |
| 尿白细胞 | LEU | `u_leu` |
| 尿亚硝酸盐 | NIT | `u_nit` |
| 尿蛋白质 | PRO | `u_pro` |
| 尿糖 | GLU | `u_glu` |
| 尿酮体 | KET | `u_ket` |
| 尿胆原 | URO | `u_uro` |
| 尿胆红素 | BIL | `u_bil` |
| 尿隐血 | BLD | `u_bld` |

## 肝功能（11）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 丙氨酸氨基转移酶 | ALT | `alt` |
| 天门冬氨酸氨基转移酶 | AST | `ast` |
| γ-谷氨酰转移酶 | GGT | `ggt` |
| 碱性磷酸酶 | ALP | `alp` |
| 总胆红素 | TBIL | `tbil` |
| 直接胆红素 | DBIL | `dbil` |
| 间接胆红素 | IBIL | `ibil` |
| 总蛋白 | TP | `tp` |
| 白蛋白 | ALB | `alb` |
| 球蛋白 | GLb | `glb` |
| 白蛋白/球蛋白比值 | A/G | `ag_ratio` |

## 肾功能（3）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 尿素 | UREA | `urea` |
| 肌酐 | Cr | `crea` |
| 尿酸 | UA | `ua` |

## 血脂（4）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 总胆固醇 | TC | `tc` |
| 甘油三酯 | TG | `tg` |
| 高密度脂蛋白胆固醇 | HDL-C | `hdl_c` |
| 低密度脂蛋白胆固醇 | LDL-C | `ldl_c` |

## 血糖（2）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 空腹血葡萄糖 | FBG | `fpg` |
| 糖化血红蛋白 | HbA1c | `hba1c` |

## 甲状腺功能（5）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 游离三碘甲状腺原氨酸 | FT3 | `ft3` |
| 游离甲状腺素 | FT4 | `ft4` |
| 三碘甲状腺原氨酸 | T3 | `t3` |
| 甲状腺素 | T4 | `t4` |
| 促甲状腺激素 | TSH | `tsh` |

## 肿瘤标志物（2）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 甲胎蛋白定量 | AFP | `afp` |
| 癌胚抗原定量 | CEA | `cea` |

## 一般检查（7）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 身高 | — | `height` |
| 体重 | — | `weight` |
| 体重指数 | — | `bmi` |
| 体脂肪率 | — | `body_fat` |
| 收缩压 | — | `sbp` |
| 舒张压 | — | `dbp` |
| 心率 | — | `hr` |

## 体格检查所见（25）

| 中文名 | 缩写 | 标准 id |
|---|---|---|
| 病史 | — | `history_note` |
| 家族史 | — | `family_note` |
| 心律 | — | `rhythm` |
| 心音 | — | `heart_sound` |
| 肺部听诊 | — | `lung_ausc` |
| 肝脏触诊 | — | `liver_palp` |
| 脾脏触诊 | — | `spleen_palp` |
| 肾脏叩诊 | — | `kidney_perc` |
| 皮肤 | — | `skin` |
| 浅表淋巴结 | — | `lymph_nodes` |
| 甲状腺(外科) | — | `thyroid_exam` |
| 乳房 | — | `breast_exam` |
| 脊柱 | — | `spine` |
| 四肢关节 | — | `joints` |
| 外生殖器 | — | `genital_exam` |
| 肛门、直肠指诊 | — | `dre` |
| 前列腺(外科) | — | `prostate_exam` |
| 裸视力(右) | — | `va_r` |
| 裸视力(左) | — | `va_l` |
| 矫正视力(右) | — | `cva_r` |
| 矫正视力(左) | — | `cva_l` |
| 色觉 | — | `color_vision` |
| 外眼 | — | `external_eye` |
| 裂隙灯检查 | — | `slit_lamp` |
| 眼底镜检查 | — | `fundus` |
