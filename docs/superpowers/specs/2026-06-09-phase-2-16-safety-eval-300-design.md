# Phase 2.16 — 安全审核准确率 ≥90% 评测落地(300 样本 + 6 类目重组)

> 设计日期:2026-06-09
> PRD 锚点:§4.4.3 安全审核准确率 ≥ 90%(硬指标)
> 状态:设计稿,待实现

## 0. 目标与背景

PRD §4.4.3 要求"安全审核准确率 ≥ 90%"作为硬指标交付。当前仓库 `apps/api/test/fixtures/safety-eval/` 仅有 40 条占位样本(每类目 5 条),且没有评测脚本、没有报告、没有真实 LLM 调用结果。

**本期目标**:

1. 用公开数据集(ChineseHarm-Bench)替换占位样本,凑齐 300 条。
2. 写评测 runner 跑真实 LLM,产出 `docs/perf/safety-eval-2026-06-09.md` 报告(整体 Accuracy + 类目级 P/R/F1)。
3. **如实报告首跑结果**——不达标就写"不达标 + 失败样本诊断 + 后续优化方向",不刷数据。
4. 把 7 类目重组为 6 类目,与公开 benchmark 标签对齐(政治/毒品/医疗类目降级为词库兜底,模型不再训练这三类)。

## 1. 数据集来源:ChineseHarm-Bench

**学术出处**:浙大 NLP 组,arxiv 2506.10960,CC BY-NC 4.0,共 15.5k 样本,中文标注。
**类目覆盖**:赌博 / 色情 / 辱骂 / 诈骗 / 黑产广告 / 非违规 共 6 类,与本平台中长图文创作场景高度匹配。
**为什么用它**:

- 已标注、有学术引用、可复现(seed=42)
- 类目颗粒度与平台审核需求一致(覆盖创作内容里最常见的违规形态)
- 不需要人工撰写 → 避免引入主观偏见,也不存在"敏感不便复制"的避险逻辑

## 2. 类目重组:7 → 6

### 2.1 变更对照表

| 原类目      | 新类目      | 处置                                                |
| ----------- | ----------- | --------------------------------------------------- |
| politics    | (删除)      | 模型不训练,降级为 `sensitive-words.json` 关键词兜底 |
| drugs       | (删除)      | 同上                                                |
| medical     | (删除)      | 同上,作者发布时自检声明                             |
| pornography | pornography | 保留                                                |
| gambling    | gambling    | 保留                                                |
| fraud       | fraud       | 保留                                                |
| vulgarity   | abuse       | **重命名**(辱骂语义更窄、更可评测)                  |
| (新增)      | illicit_ads | **新增**:黑产广告(刷单 / 诱导添加微信 / 非法引流)   |

最终 6 类目:`pornography / gambling / abuse / fraud / illicit_ads`(高危 5 类)+ `(隐式)allow`。

### 2.2 为什么删 politics/drugs/medical

- **politics**:本平台 LLM 厂商内置政治审查,重复评测无意义;且公开数据集对该类目刻意规避。
- **drugs**:与诈骗类目重叠度高(很多毒品广告本质是诈骗 / 黑产),保留 fraud + illicit_ads 已能覆盖大部分实际场景。
- **medical**:涉及医疗合规属于专业领域,模型容易误伤(如正常科普),不适合用 LLM 通用审核器评测;改为发布时作者声明 + 平台事后处置。

三者降级后由 `packages/shared/src/sensitive-words.json` 关键词扫描兜底(已有,不动),不进入 6 类目模型评测。

### 2.3 同步改动清单

| 文件                                                   | 改动                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/shared/src/review.ts:78-86`                  | `SENSITIVE_CATEGORIES` 改为 6 项                                                               |
| `packages/shared/src/sensitive-words.json`             | 删 politics/drugs/medical 三 key,vulgarity → abuse,新增 illicit_ads                            |
| `packages/shared/rules/`                               | 删 politics.yaml / drugs.yaml / medical.yaml,vulgarity.yaml → abuse.yaml,新增 illicit_ads.yaml |
| `apps/api/src/reviews/review.service.ts`               | `parseSafetyOf7Cats` → `parseSafetyOf6Cats`,SAFETY_REVIEW prompt 6 维                          |
| `apps/api/prisma/seed.ts`                              | 平台 SAFETY_REVIEW prompt body 同步 6 类目                                                     |
| `apps/api/test/**/*.e2e-spec.ts`                       | 涉及 SENSITIVE_CATEGORIES 的 fixture / 期望值 6 维                                             |
| `apps/web/src/components/SafetyDimensions.tsx`(若存在) | 类目展示 6 维                                                                                  |
| `docs/PRD.md` §4.1.1 / §4.1.3                          | 类目列表 7 → 6,新增 illicit_ads 描述                                                           |

## 3. 测试集构成(300 样本)

### 3.1 数量分布

| 类目         | 数量    | 抽样口径                             |
| ------------ | ------- | ------------------------------------ |
| pornography  | 40      | 从 ChineseHarm-Bench `色情` 标签抽样 |
| gambling     | 40      | 从 `赌博` 标签抽样                   |
| abuse        | 40      | 从 `辱骂` 标签抽样                   |
| fraud        | 40      | 从 `诈骗` 标签抽样                   |
| illicit_ads  | 40      | 从 `黑产广告` 标签抽样               |
| allow        | 70      | 从 `非违规` 标签抽样                 |
| **保留缓冲** | 30      | 高危 5 类各 6 条,作为后续补样备选    |
| **合计**     | **300** | (主测 270 + 缓冲 30)                 |

主测集 270,缓冲 30。**目标 Accuracy 计算口径基于主测 270**。
正样本(allow)占 70/270 ≈ 26%,符合"轻度倾斜测违规命中率"的评测惯例。

### 3.2 抽样规则

- **seed = 42** 固定,可复现。
- 每类目抽样前过滤:文本长度 20–500 字之间(过滤超短噪声 + 过长拼接)。
- 采样脚本独立,产物为 jsonl,每行 `{ "text": string, "expected": SensitiveCategory | "allow", "source_id": string }`。
- 文件位置仍在 `apps/api/test/fixtures/safety-eval/<category>.jsonl`(8 → 6 个类目文件 + allow.jsonl + buffer.jsonl)。

### 3.3 数据合规

- ChineseHarm-Bench 协议为 CC BY-NC 4.0(非商业),本平台为训练营学习项目,不商用,符合协议。
- 报告中标注数据来源 + 学术引用。
- jsonl 文件作为测试 fixture 入库,不进生产构建。

## 4. 评测 Runner(在已有骨架上升级)

### 4.0 现状

`apps/api/scripts/eval-safety.ts` Phase 2.5 时已落骨架(NestFactory 启 ReviewService → 7 类目串行调 `reviewPrompt(text)` → 累计 TP/FN/FP/TN → 写 markdown),`pnpm eval:safety` 已挂在 package.json。本期是**升级**而非从零写。

### 4.1 升级清单

| 项        | 现状(Phase 2.5 骨架)         | 本期改造                                               |
| --------- | ---------------------------- | ------------------------------------------------------ |
| 类目      | 7 类目硬编码                 | 改为 `import { SENSITIVE_CATEGORIES }` 6 类目          |
| 调用方法  | `reviews.reviewPrompt(text)` | 改为 `reviews.reviewPostPublish(text)`(贴合发布后场景) |
| 并发      | 串行 forEach                 | `p-limit(5)` 并发                                      |
| 重试      | 无,任一失败抛                | per-sample 2 次指数退避(1s / 4s)                       |
| 错误样本  | 抛异常脚本崩                 | 计入 `error` 段,不计入 Accuracy 分母                   |
| 报告      | 仅 P/R/F1 + Accuracy         | 加混淆矩阵 + 失败样本 + Macro-F1 + 元数据段            |
| Exit code | 无显式判断                   | Accuracy < 0.90 → exit 1                               |
| 单元测试  | 无                           | 加聚合函数纯函数测                                     |

### 4.2 流程(升级后)

```
1. 加载 6 个高危类目 jsonl + allow.jsonl(主测 270 条)
2. 用 p-limit(5) 并发,每条:
   a. 调 ReviewService.reviewPostPublish(text)
   b. per-sample 2 次重试,指数退避(1s / 4s)
   c. 取 result.hitCategories[0] || "allow" 作为 predicted
   d. 与 sample.expected 比对
3. 累计混淆矩阵 + per-category P/R/F1 + Macro-F1 + Accuracy
4. 输出 docs/perf/safety-eval-YYYY-MM-DD.md
5. exit code:Accuracy ≥ 0.90 → 0,否则 1
```

### 4.3 关键依赖

- **p-limit**:并发限流(若未依赖,本期 add 到 apps/api devDependencies)
- **复用** `ReviewService.reviewPostPublish(text)` 现有 parser(改完 6 类目后),无需另写 LLM 调用
- 现有 `eval-fixtures-count.ts` 数量校验脚本同步改 6 类目 + 总数门槛 ≥ 270

### 4.4 错误处理

- LLM 调用 2 次重试都失败 → 该样本计为 `error`,不计入 Accuracy 分母,但写进报告"运行时错误"段落,逐条列出原始报错。
- LLM 输出 JSON 解析失败 → 同上,计入 `error` 段。

## 5. 报告格式

文件位置:`docs/perf/safety-eval-YYYY-MM-DD.md`(YYYY-MM-DD 为脚本运行当天)。

```markdown
# 安全审核评测报告 — 2026-MM-DD

## 元数据

- 数据来源:ChineseHarm-Bench (arxiv 2506.10960, CC BY-NC 4.0)
- 样本数:270(主测) + 30(缓冲未跑)
- LLM:LLM_MODEL=$LLM_MODEL @ LLM_BASE_URL=$LLM_BASE_URL
- 运行时长:N 分钟
- 失败样本数:N(详见末尾)

## 总体指标

| 指标     | 值   | PRD 目标 | 状态                |
| -------- | ---- | -------- | ------------------- |
| Accuracy | 0.XX | ≥ 0.90   | ✅ 达标 / ⚠️ 不达标 |
| Macro-F1 | 0.XX | (参考)   | -                   |

## 类目级 P/R/F1

| 类目        | Precision | Recall | F1   | Support |
| ----------- | --------- | ------ | ---- | ------- |
| pornography | 0.XX      | 0.XX   | 0.XX | 40      |
| gambling    | ...       |        |      |         |
| ...         |           |        |      |         |
| allow       | ...       |        |      |         |

## 混淆矩阵

(6×6 矩阵,行 expected,列 predicted)

## 失败样本(全部列出)

- `text` / expected / predicted / hit_categories / 简要诊断
- 至少要标记 5–10 条典型错误,作为后续优化输入

## 运行时错误(LLM 调用 / 解析失败)

N 条,逐条列原始报错。

## 结论

- 达标:✅ / 不达标:⚠️
- 不达标时给出后续优化方向(prompt 调优 / 规则库补强 / 换模型 / 加 few-shot)
```

## 6. CI 与 Husky

- **CI**:不挂(token 成本 + LLM 不稳定),`scripts/safety-eval.ts` 仅手动触发。
- **Husky pre-commit**:不动(继续跑 lint + typecheck + 单测)。
- 脚本 exit code 1 时 `pnpm eval:safety` 仍能 fail,方便交付前手动校验。

## 7. 单元测试

`apps/api/scripts/eval-safety.spec.ts`(独立脚本测试,不进 e2e):

- 把聚合函数(混淆矩阵生成、P/R/F1 公式、Macro-F1 计算、错误样本计数)从 `eval-safety.ts` 抽出为纯函数,便于测
- mock 输入 `[{expected, predicted, error?}]` → 输出 `{accuracy, macroF1, perCategory, errors}`
- 用最小 fixture(每类目 2 条)跑通,**不调真实 LLM**

`packages/shared/src/review.ts` 的 6 类目 enum 改动有现有 spec 覆盖(`review.service.spec.ts`),需同步更新期望值。

## 8. 范围之外(Out of Scope)

明确**不在本期 Phase 2.16 内**:

1. **politics / drugs / medical 的模型评测**:已降级为词库兜底,不评测。
2. **Macro-F1 ≥ 某阈值**:仅作参考指标,不锁硬指标。
3. **CI 集成 / 自动跑**:token 成本不允许,手动跑。
4. **300 → 1000 样本扩展**:首期 300 满足 PRD 要求,后续扩展为后续 Phase。
5. **Few-shot prompt 调优**:首跑用现有 SAFETY_REVIEW prompt(6 类目版),不达标再开新 Phase 调优。
6. **多语言 / 长文本切分评测**:本期只测中文 + 单段文本(20–500 字)。

## 9. 验收清单

- [ ] `packages/shared/src/review.ts` SENSITIVE_CATEGORIES 6 项,所有依赖文件同步通过 typecheck
- [ ] `packages/shared/sensitive-words.json` + `packages/shared/rules/` 6 类目对齐
- [ ] `apps/api/src/reviews/review.service.ts` parseSafetyOf6Cats + SAFETY_REVIEW prompt 6 维
- [ ] `apps/api/prisma/seed.ts` SAFETY_REVIEW prompt 6 维
- [ ] `apps/api/test/fixtures/safety-eval/` 6 + allow + buffer.jsonl 共 300 条样本(seed=42 可复现)
- [ ] `apps/api/scripts/eval-safety.ts` runner 升级:6 类目 + p-limit + 重试 + 混淆矩阵 + 失败样本 + Macro-F1 + exit code
- [ ] `apps/api/scripts/eval-safety.spec.ts` 聚合函数单测通过
- [ ] `apps/api/scripts/eval-fixtures-count.ts` 同步 6 类目 + 总数 ≥ 270 阈值
- [ ] `pnpm --filter @bytedance-aigc/api test` + `test:e2e` 全绿(端口 e2e 需 db:up)
- [ ] `pnpm --filter @bytedance-aigc/web test` + `typecheck` + `lint` 全绿
- [ ] `docs/PRD.md` §4.1.1 / §4.1.3 类目列表 6 维同步
- [ ] README 加 Phase 2.16 段落:报告链接 + 类目重组说明
- [ ] `docs/perf/safety-eval-2026-06-09.md` 报告产出(达标/不达标如实写)
- [ ] 报告首跑结果如实写,达标 / 不达标都接受;不达标附诊断 + 优化方向
