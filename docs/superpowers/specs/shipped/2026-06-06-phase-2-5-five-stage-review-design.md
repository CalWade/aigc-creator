# Phase 2.5 5 阶段审核(前 3 阶段)+ 规则库 + 准确率验证 — 设计稿

> **范围**:PRD §4.1.1-4.1.3 三阶段审核(① Prompt / ② 输入 / ③ 生成中) + §4.4 规则库(yaml) + §4.4.3 准确率 ≥ 90% [硬指标] 验证。
>
> **不含**:④ 发布前(Phase 2.3 已 ship)、⑤ 发布后(超出 3 周交付窗口,推到 Phase 2.6+)、§4.5 误判反馈队列(同上)、规则库 admin UI(违反"评委交付物不堆冗余"原则,详见 §决策 D-B3)。

## 目标(Goal)

让 PDF「在创作的各个阶段自动识别并干预潜在合规风险」从纸面落到 3 个真实运行的接入点:

1. **作者写选题/提示词时**(FastModeDialog topic/hint 失焦)→ 大模型审 → 高危类目弹窗 → 作者"换角度 / 我有把握继续"
2. **作者键入正文时**(TipTap 1.5s 防抖)→ 本地词库 Worker 扫描 → 命中下划红波浪 + tooltip → 不阻塞输入
3. **AI 流式生成段落时**(SectionStream onSectionEnd)→ 大模型审段落 → 违规段红框 + "重新生成 / 修改建议 / 仍要保留";连续 ≥ 3 段 high → 中断流式

加上一份可被评委查的 **300 条标注集准确率报告**(交付物 #3 / #4 的硬证据),把 PDF §4.4.3 的"≥ 90%"从口号变成可检验事实。

## 范围决策(Scope)

**做**:

- ① Prompt 阶段:`POST /reviews/prompt` 同步端点 + FastModeDialog topic/hint 失焦防抖触发 + 命中弹窗组件
- ② 输入阶段:Aho-Corasick Web Worker + 静态 JSON 词库(2000-5000 词 × 7 类目,与规则库类目对齐)+ ProseMirror review-decoration plugin 红波浪
- ③ 生成中阶段:`POST /reviews/section` 同步端点 + SectionStream onSectionEnd 接入(异步、非阻塞下一段)+ ProseMirror 段落红框 + `<SectionReviewCard>` 3 动作卡 + 连续违规中断逻辑
- §4.4 规则库:`packages/shared/rules/{politics,porn,gambling,drugs,vulgar,fraud,medical}.yaml`,7 类目,review.service 拼装 prompt_hint
- 300 条标注集:`apps/api/test/fixtures/safety-eval/*.jsonl`,每类 ≥ 30 条,覆盖正负样本
- `pnpm --filter @bytedance-aigc/api eval:safety` 脚本 → 跑 300 条 → 输出 `docs/perf/safety-eval-2026-06-XX.md` 准确率报告
- 共享 review schema 扩 stage 字面量:`PROMPT_INPUT` / `SECTION_INLINE` 两个新值;Prisma `ReviewStage` enum 同步加(POST_PUBLISH 留 placeholder 但本期不用)
- DraftToolType enum 加 `PROMPT_REVIEW` / `SECTION_REVIEW` 两个值,接入 PromptsService 的平台保留 Prompt 通道
- README 新增 Phase 2.5 小节:操作方式 + 准确率指标摘要 + link 到 `packages/shared/rules/` 规则库 yaml + link 到最新 `docs/perf/safety-eval-2026-06-XX.md` 报告(交付物 #3 / #4 的展示路径)
- 学习笔记追写 `bytedance-aigc-notes/notes-02.md` 或新开 `notes-03.md`(若 02 超 1500 行)

**不做**(Phase 2.6 或永不):

- ⑤ 发布后阶段 / 用户举报 / 抽样巡检 / 规则更新批量复审 — Phase 2.6+
- §4.4.2 规则库管理 admin UI — 违反"给评委的交付物不堆冗余设计",评委可看 README 截图 + yaml 源文件
- §4.5 误判反馈队列(作者点"我觉得不该被拦"→ 误判队列)— Phase 2.6+
- 规则库 yaml 的 `version` / `status: active|deprecated` 字段 — 用 Git 管版本,删了就删了 PR review 兜底
- 一键合规替代(§4.2 的"一键生成合规替代")— 落到 ③ 的"修改建议"按钮文案,但本期不真做改写,只是占位
- ② 词库后端 API / Postgres 词库表 — 静态 JSON 在仓库内,不接 admin
- 小型分类模型兜底(PRD §8 风险表的 fallback)— 本期纯靠 LLM Prompt + 规则库 prompt_hint 调教达 ≥ 90%
- ① 阶段对 PromptDrawer / 作者私人 Prompt 编辑场景的失焦审核 — 边界遵守 PRD §4.7.2,作者私人 Prompt 不走平台审核

## 已拍板决策

### D-B0:范围 = 三阶段全切

PRD §4.1.1-4.1.3 三阶段全做,不拆。理由:三阶段共享 review.service 多 stage 框架,接入点在仓库里都已经存在(FastModeDialog topic/hint 输入、SectionStream onSectionEnd hook),拆开做反而要做 2 遍 review.service stage 扩容。

### D-B1:② 词库扫描 = Web Worker + Aho-Corasick

主线程绝对不阻塞。理由:PRD §4.1.2 写的是"P99 < 50ms",数千词 × 数千字一遍 AC 自动机理论上 5-10ms 内完成;但**主线程上跑** = 任何不在意的代码热路径(React render / TipTap 内部 transaction)都可能让 P99 飙到 100ms+。Web Worker 是把"绝不阻塞"从口头承诺变成物理隔离。

- 实现:`apps/web/src/workers/sensitive-scanner.worker.ts`,Aho-Corasick 自写约 80 行(`buildAC(words)` / `match(text)`)
- 词库通过 main → worker postMessage 注入,Worker 启动时构建 trie 一次缓存
- 扫描请求格式:`{ id: string; text: string }` → 返回 `{ id; hits: { from: number; to: number; word: string; category: string; severity: 'high'|'medium'|'low' }[] }`
- 防抖:TipTap update 事件后 1.5s 防抖再投递 worker

### D-B2:词库源 = 开源词库 + 手筛 → 静态 JSON

参考开源敏感词集(如 `fighting41love/funNLP` 的子集、`observerss/textfilter` 等),手筛裁剪到 2000-5000 词。结构:

```ts
// packages/shared/src/sensitive-words.ts
export type SensitiveCategory =
  | "politics"
  | "porn"
  | "gambling"
  | "drugs"
  | "vulgar"
  | "fraud"
  | "medical";
export interface SensitiveWordList {
  version: string; // ISO date
  categories: {
    [cat in SensitiveCategory]: { severity: "high" | "medium" | "low"; words: string[] };
  };
}
```

JSON 文件位置:`packages/shared/src/sensitive-words.json`。词库类目与规则库 yaml 类目一一对齐(7 个),lint 守则:JSON 中所有词长度 ≥ 2(避免单字误伤);CI 跑 `pnpm validate:words` 校验结构(纯结构 lint,**不调 LLM 不进 eval:safety,可放心进 CI**)。

理由:开源词库覆盖广、手筛去掉常用词避免误伤(如"小米"应放过),静态 JSON 入仓库 = Git 管版本 + PR review 兜底。运营热更新需求 = 没有(本项目没真实运营)。"广告引流"合并到 `fraud`(虚假宣传),与 §4.7.1 平台保留 Prompt 的"虚假宣传"维度一致。

### D-B3:§4.4 规则库 = yaml 文件 + 脚本跑测试集 + 不做 admin UI

理由:PDF 交付物 #4 「内容安全审核规则库与质量评估体系说明」是**文档**,做 admin UI 是评委向的过度工程,违反 `feedback_reject_overdesign_for_evaluators.md`。规则库以 yaml 文件呈现给评委(README 直接 link 到 GitHub 文件 + 截图),准确率以脚本跑出的报告呈现。

- 文件位置:`packages/shared/rules/{politics,porn,gambling,drugs,vulgar,fraud,medical}.yaml`(7 类目,与 PRD §4.4.2 类目树对齐 + 砍掉"版权"和"其他"两个无具体边界的)
- yaml schema(简化掉 PRD §4.4.1 的 version / status):

```yaml
rule_id: SEC-POLITICS-001
category: politics
severity: high # high | medium | low
description: 对国家领导人的负面或调侃言论
prompt_hint: |
  以下文本若涉及对国家领导人的负面评价、人身攻击、调侃……
examples_positive: # 应被命中的样本(给 LLM Prompt 当 few-shot)
  - "..."
examples_negative: # 应被放过的样本
  - "..."
```

- review.service 在审核时:加载所有 active yaml → 按 category 拼装 prompt_hint 列表 → 注入 SAFETY_REVIEW Prompt 的 system message → 调 LLM
- 规则迭代 = 改 yaml + PR(本项目无运营,这是合理路径)

### D-B4:300 条标注集 = 仓库内 JSONL + 本地脚本跑 + 不进 CI

`apps/api/test/fixtures/safety-eval/{politics,...}.jsonl`,每行:

```json
{
  "text": "...",
  "expected_recommendation": "BLOCK",
  "expected_categories": ["politics"],
  "source": "manual"
}
```

每个高危类目(politics/porn/gambling/drugs)≥ 50 条,中危(vulgar/fraud/medical)≥ 30 条,合计 ≥ 300 条。负样本(应被放过的 ALLOW 样本)单独存 `allow.jsonl` ≥ 50 条,避免假阳性测不到。

脚本:

```bash
pnpm --filter @bytedance-aigc/api eval:safety
# → apps/api/scripts/eval-safety.ts
# → 启动 NestApplicationContext + 调 ReviewService.reviewSafety(text)
# → 对比 expected_recommendation
# → 输出 JSON + Markdown 报告
```

报告格式 `docs/perf/safety-eval-2026-06-XX.md`:

```markdown
| 类目     | 样本数 | TP  | FN  | FP  | TN  | Precision | Recall | F1    |
| -------- | ------ | --- | --- | --- | --- | --------- | ------ | ----- |
| politics | 60     | 56  | 4   | 2   | 50  | 0.965     | 0.933  | 0.949 |

...
| 总体 | 350 | ... | ... | ... | ... | 0.94 | 0.91 | 0.92 |
```

**不进 CI**:每次 PR 都跑会花 LLM 钱、网络抖动让数字不稳;改为发布前手动跑 + commit 报告 + README 引用最新报告。

### D-B5:① Prompt 阶段触发点 = topic / hint 任一失焦,合并文本审核,800ms 防抖

接入点:`apps/web/src/app/drafts/[id]/_components/FastModeDialog.tsx` 第 58-65 行 input(topic) + 第 68-75 行 textarea(hint)加 `onBlur`;**任一失焦即触发**,前端拼接 `text = (topic + '\n' + hint).trim()` 作为审核体,800ms 防抖合并 topic / hint 的连续失焦事件,避免一次填写触发两次 LLM 调用。命中后:

- 弹一个二级模态(覆盖 FastModeDialog 上方),内容:"该选题可能涉及 [politics/medical/...],建议调整方向"
- 两按钮:"换个角度"(清空 topic / hint 焦点回 input)/ "我有把握继续"(关闭弹窗,不阻断生成)
- 命中**不阻断** → 作者点"生成大纲"还是能走通(PRD §4.1.1 末"作者可'我有把握继续'")
- **登录前置**:FastModeDialog 只在 `/drafts/[id]` 页内渲染,该页已是 UserGuard 保护;`POST /reviews/prompt` 接 UserGuard,非登录态 401

### D-B6:③ 段落审核 = onSectionEnd 异步触发,不阻塞下一段流式

接入点:`apps/web/src/app/drafts/[id]/_components/SectionStream.tsx` 第 73 行 `onSectionEnd`。

- onSectionEnd 时记录段落起止 doc range(`from = sectionEnds[idx-1] ?? 0`,`to = sectionEnds[idx]`)
- **fire-and-forget** `POST /reviews/section`:next section 已在生成,审核结果回来后再 mutate decoration
- 命中 → addViolation(from, to, severity, message)+ 该段下方挂 SectionReviewCard
- ReviewService 维护内存级 `streamSession[draftId]` 计数:连续 ≥ 3 段返 high → 通过 SSE 端点的 abort 信号(实现:在 `POST /reviews/section` 的响应里返 `{ abortStream: true, reason }`,前端拦截并 `stop()` SectionStream 的 hook)
- ⚠ 风险:段落 from/to 在后续 onToken 不会变(SectionStream 用 insertContent at `focus("end")` 追加,不动前面的段落),所以 range 稳定;但若用户在生成途中编辑(虽然 streaming 期 useAutosave 已屏蔽),仍要在 ReviewService 收到响应时校对 range 是否还存在

### D-B7:TipTap decoration 共用 review-decoration plugin

`apps/web/src/lib/tiptap/review-decorations.ts`:

```ts
export interface Violation {
  id: string;          // hash from+to+word,去重
  from: number;
  to: number;
  severity: 'low'|'medium'|'high';
  category: string;
  source: 'word'|'section';   // ② 词库还是 ③ 段落
  message: string;
}

export const ReviewDecorationsExt = Extension.create<{...}>({
  name: 'reviewDecorations',
  addProseMirrorPlugins() {
    return [new Plugin<{ violations: Violation[] }>({
      state: { init() { return { violations: [] }; }, apply(tr, prev) {
        const meta = tr.getMeta('review/setViolations');
        return meta ? { violations: meta as Violation[] } : prev;
      }},
      props: { decorations(state) {
        const { violations } = this.getState(state) as { violations: Violation[] };
        return DecorationSet.create(state.doc, violations.map(v => Decoration.inline(
          v.from, v.to,
          { class: `review-violation review-violation--${v.severity} review-violation--${v.source}` },
          { 'data-review-id': v.id, 'data-review-message': v.message }
        )));
      }},
    })];
  },
});
```

useReviewDecorations(editor)hook 暴露 `setWordViolations(items)` / `setSectionViolations(items)` / `clear()`,各自管自己 source 的子集合并 dispatch。

样式:① low 灰色波浪 + ② medium 橙色波浪 + ③ high 红色波浪;source=section + severity=high → 该段 block 包一层红色边框(用 `widget` decoration 在段首加 marker class,CSS `.review-section-violation > p { border: 1px solid red ... }`)。

### D-B8:Prompt 调教 ≠ 代码

平台保留的 SAFETY_REVIEW / PROMPT_REVIEW / SECTION_REVIEW 三个 Prompt 都在数据库 `prompts` 表,不是代码常量。准确率达不到 90% 时,PE(=用户)调 Prompt(改 systemPrompt 字段,可走 fixtures 重 seed 或 admin SQL),review.service **不动**。这与 `feedback_collaboration_owner_reviewer_selective_coder.md` 的"用户 owner / AI selective coder"分工对齐:Prompt 调教是用户的领地。

### D-B9:Web Worker 加载方式 = Next.js 16 标准 `new Worker(new URL(...))`

按 `apps/web/AGENTS.md` 提示:Next.js 16 写法可能与训练数据不同,实施前先 `cat node_modules/next/dist/docs/...` 找 Worker 加载文档。备选:用 `worker-loader` 之类第三方 webpack loader(劣);静态 import + named function(不可,因为 Worker 必须独立 bundle)。

## 架构

```
       ┌─────────────────────────────────────────────────────────┐
       │              FastModeDialog (Phase 2.2)                 │
       │  topic <input>  hint <textarea>                         │
       │       │ onBlur (800ms debounce)                          │
       │       ▼                                                  │
       │  ① POST /reviews/prompt → review.service.reviewPrompt   │
       │       └─ LLM 调 PROMPT_REVIEW Prompt + 规则库 prompt_hint  │
       │       ▼                                                  │
       │  <PromptReviewBanner> 弹层 ("换角度 / 有把握继续")        │
       └─────────────────────────────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │             TiptapBody (Phase 2.1)                       │
       │  onUpdate → 1.5s debounce →                              │
       │       ▼                                                  │
       │  ② sensitive-scanner.worker (Aho-Corasick)              │
       │       └─ JSON 词库 (worker 启动一次性注入)              │
       │       ▼                                                  │
       │  setWordViolations() → review-decoration plugin         │
       │       ▼                                                  │
       │  红波浪 + tooltip                                        │
       └─────────────────────────────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │           SectionStream (Phase 2.2)                      │
       │  onSectionEnd(idx) → fire-and-forget                     │
       │       ▼                                                  │
       │  ③ POST /reviews/section { draftId, sessionId, range }   │
       │       └─ review.service.reviewSection                    │
       │            └─ LLM 调 SECTION_REVIEW Prompt + 规则库       │
       │            └─ streamSession[draftId] 连续违规计数        │
       │       ▼                                                  │
       │  setSectionViolations() + 红框 + SectionReviewCard       │
       │  if abortStream → SectionStream.stop() + 弹"风险较高"    │
       └─────────────────────────────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │              ReviewService (Phase 2.3 扩)                │
       │  preflight (已 ship) + reviewPrompt + reviewSection      │
       │     └─ 共享 buildSafetyMessages(text, ruleHints)         │
       │     └─ 共享 parseSafety / parseQuality                   │
       │     └─ 写 Review 行,stage = PROMPT_INPUT|SECTION_INLINE  │
       └─────────────────────────────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │      packages/shared/rules/*.yaml + sensitive-words.json │
       │      apps/api/test/fixtures/safety-eval/*.jsonl          │
       │      apps/api/scripts/eval-safety.ts                     │
       └─────────────────────────────────────────────────────────┘
```

## 组件清单

### 后端(apps/api)

| 文件                                 | 职责                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/reviews/review.service.ts`      | 扩 `reviewPrompt(text, userSub)` / `reviewSection(draftId, range, text, sessionId)`;抽 `buildSafetyMessages` / `runReviewLLM` 共用                                |
| `src/reviews/reviews.controller.ts`  | 加 `POST /reviews/prompt`(body: `{text, hint?}`)/ `POST /reviews/section`(body: `{draftId, sessionId, range:{from,to}, text}`)                                    |
| `src/reviews/rule-loader.ts`         | 启动时加载 `packages/shared/rules/*.yaml`,内存缓存 `Map<category, RuleEntry[]>`                                                                                   |
| `src/reviews/stream-session.ts`      | 内存级 `Map<draftId, { violations: number; sessionId: string }>`,管连续违规计数                                                                                   |
| `prisma/schema.prisma`               | `ReviewStage` enum 加 `PROMPT_INPUT` / `SECTION_INLINE`;`DraftToolType` 加 `PROMPT_REVIEW` / `SECTION_REVIEW`;migration `phase25_review_stages`                   |
| `prisma/fixtures/index.ts`           | seed 加 2 条 PLATFORM Prompt 条目(PROMPT_REVIEW / SECTION_REVIEW)                                                                                                 |
| `scripts/eval-safety.ts`             | 跑 300 条标注集,生成 markdown 报告                                                                                                                                |
| `test/fixtures/safety-eval/*.jsonl`  | 7 类目 + allow.jsonl 共 ≥ 350 条                                                                                                                                  |
| `test/review-prompt.e2e-spec.ts`     | 4 用例:命中 high BLOCK / 命中 medium WARN / 全通过 ALLOW / 401(平铺在 `apps/api/test/`,与 Phase 2.3 `preflight.e2e-spec.ts` / `publish.e2e-spec.ts` 命名约定一致) |
| `test/review-section.e2e-spec.ts`    | 5 用例:命中 ALLOW 不写 review / 命中 medium 写 review + 段 violations / 连续 3 段 high → abortStream / 401 / 403 不属本人草稿                                     |
| `src/reviews/review.service.spec.ts` | 扩 4 单测:reviewPrompt happy / reviewPrompt 规则库 prompt_hint 拼装 / reviewSection 写 stage / streamSession 计数                                                 |

### 前端(apps/web)

| 文件                                                     | 职责                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `src/workers/sensitive-scanner.worker.ts`                | Aho-Corasick 主体 + postMessage handler                         |
| `src/workers/sensitive-scanner.test.ts`                  | vitest:词库 5 词、文本含命中、返 hits 区间正确                  |
| `src/lib/tiptap/review-decorations.ts`                   | ProseMirror Plugin + Extension + Violation 类型                 |
| `src/lib/tiptap/review-decorations.test.tsx`             | vitest + jsdom:setWordViolations / setSectionViolations / clear |
| `src/hooks/use-sensitive-scan.ts`                        | hook:封装 Worker 启动、debounce、postMessage、setWordViolations |
| `src/hooks/use-prompt-review.ts`                         | hook:topic/hint 失焦 → POST /reviews/prompt → 返结果            |
| `src/hooks/use-section-review.ts`                        | hook:onSectionEnd 触发 fire-and-forget                          |
| `src/app/drafts/[id]/_components/PromptReviewBanner.tsx` | 命中弹层组件                                                    |
| `src/app/drafts/[id]/_components/SectionReviewCard.tsx`  | 段落违规小卡(3 动作占位)                                        |
| `src/app/drafts/[id]/_components/FastModeDialog.tsx`     | 接 use-prompt-review + 失焦防抖 + 渲染 PromptReviewBanner       |
| `src/app/drafts/[id]/_components/SectionStream.tsx`      | 接 use-section-review + 接 stop 信号                            |
| `src/app/drafts/[id]/_components/TiptapBody.tsx`         | 加 ReviewDecorationsExt + 接 use-sensitive-scan                 |

### 共享(packages/shared)

| 文件                                                             | 职责                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/review.ts`                                                  | 扩 `ReviewDto.stage` 字面量到 4 个值;加 `PromptReviewResponse` / `SectionReviewResponse` |
| `src/sensitive-words.json`                                       | 静态词库                                                                                 |
| `src/sensitive-words.ts`                                         | 类型 + `loadSensitiveWords()` 工具                                                       |
| `rules/{politics,porn,gambling,drugs,vulgar,fraud,medical}.yaml` | 规则库 yaml                                                                              |

## 数据模型变更

```diff
 enum ReviewStage {
   PREFLIGHT
+  PROMPT_INPUT
+  SECTION_INLINE
   POST_PUBLISH
 }

 enum DraftToolType {
   ...
   SAFETY_REVIEW
   QUALITY_REVIEW
+  PROMPT_REVIEW
+  SECTION_REVIEW
 }
```

`Review` 表本身不变 —— 现有字段(stage / safety / quality / recommendation / modelMeta)够用。`PROMPT_INPUT` / `SECTION_INLINE` 阶段产生的 review:

- safety 维度按 6 个 SAFETY_KEYS 填(命中类目高分,其余 0)
- quality **不评**(prompt 阶段没正文,section 阶段段落太短),`quality.dimensions` 全 0 + `quality.note: "本阶段不评质量"`,展示侧据 stage 隐藏 quality 面板
- modelMeta.latencyMsQuality 为 0;truncated 字段沿用

migration:`apps/api/prisma/migrations/2026XXXXXXXX_phase25_review_stages/migration.sql`,只加 enum 值,无表结构变更。

## API 形态

```ts
// POST /reviews/prompt — 需登录(UserGuard);因为 LLM 资源消耗,防滥用
// Body
{ text: string }   // 前端拼接 (topic + '\n' + hint).trim();text.length 1~1000,空文本前端不发请求
// Response
PromptReviewResponse {
  recommendation: 'ALLOW' | 'WARN' | 'BLOCK';
  hitCategories: string[];     // 命中的 category
  message: string;             // 给作者看的解释
  reviewId: string;            // 落库 ID,审计追溯
}

// POST /reviews/section — 需登录,需是 draft 的 author
// Body
{
  draftId: string;
  sessionId: string;           // 一次流式生成会话 ID(前端生成 uuid),用于连续违规计数
  range: { from: number; to: number };
  text: string;
}
// Response
SectionReviewResponse {
  recommendation: 'ALLOW' | 'WARN' | 'BLOCK';
  hitCategories: string[];
  severity: 'low' | 'medium' | 'high';
  message: string;
  abortStream: boolean;          // sessionId 内连续 ≥ 3 段 high → true
  reviewId: string;
}
```

错误响应:401 / 403 / 400(text 超 1000 / range 非法)/ 500(LLM 失败)。

## 错误处理 / 边界

- LLM 失败:① 阶段 → 返 `{ recommendation: 'ALLOW', message: '审核服务暂时不可用,可继续' }`,不阻塞作者;③ 阶段同上,不阻塞流式;**不**像 Phase 2.3 preflight 那样 fallback 全 high BLOCK,因为 ① ③ 是非阻断式审核
- ② Worker 启动失败(浏览器不支持/被插件拦):降级为 silent no-op,console.warn,不弹错(避免打扰作者);telemetry:`window.__sensitiveScannerStatus`(devtools 可查)
- ② 词库 JSON 加载失败:Worker 启动失败的子情形,同上
- ③ range 越界(理论上不会,因为 SectionStream 不动旧段):review.service 收到响应 → 前端 add decoration 时校对 `editor.state.doc.content.size`,越界则 drop
- ③ sessionId 服务端缓存:30 分钟 TTL 内存级,无 Redis(YAGNI);进程重启清空可接受
- 规则库 yaml 加载失败:启动时报错 + abort startup(不允许带病运行)
- eval 脚本失败:exit 1 + stderr,但不进 CI 所以不会卡 PR

## 测试策略

### 单测

- `review.service.spec.ts` 4 条新测:reviewPrompt happy / 拼装 prompt_hint 包含规则库内容 / reviewSection 写正确 stage / streamSession 计数到 3 才返 abortStream
- `sensitive-scanner.test.ts` (web/vitest):5 词词库 + 文本含 3 处命中 → 返 3 个 hits,from/to/word/category 一致;不命中 → 空数组
- `review-decorations.test.tsx` (web/vitest+jsdom):setWordViolations 后 prosemirror 状态含对应 decoration;clear 清空
- `rule-loader.spec.ts` (api):加载 7 个 yaml,任一缺失抛错;structure 错误抛错

### e2e

- `review-prompt.e2e-spec.ts` 4 条:high 命中 BLOCK / medium WARN / ALLOW / 401
- `review-section.e2e-spec.ts` 5 条:ALLOW 不写 review / medium 写 review 含 range / sessionId 连续 3 段 high → abortStream true / 401 / 403

### eval 集

`pnpm --filter @bytedance-aigc/api eval:safety` 跑完,汇总 ≥ 90%,失败时 PE 调 Prompt 重跑。报告 commit 在 `docs/perf/safety-eval-2026-06-XX.md`。

## 指标定义(交付物 #3 报告引用)

| 指标                   | 算法                                         | 目标                                     |
| ---------------------- | -------------------------------------------- | ---------------------------------------- |
| 总体准确率(Accuracy)   | (TP+TN)/(TP+TN+FP+FN)                        | ≥ 90%                                    |
| 高危类目召回           | TP/(TP+FN) per high category                 | ≥ 95%                                    |
| 假阳性率(FPR)          | FP/(FP+TN)                                   | ≤ 5%                                     |
| 单次审核延迟 P50 / P99 | LLM round-trip + parse                       | P50 < 1.5s / P99 < 4s(LLM provider 决定) |
| ② 词库扫描延迟 P99     | postMessage round-trip(含 build trie 已摊销) | < 50ms                                   |

## 风险

| 风险                                      | 缓解                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 准确率达不到 ≥ 90%                        | PE 调 Prompt(数据库改 systemPrompt)+ 增加 examples_positive/negative 给 few-shot;若仍不达,在交付报告里诚实标注实际值,并给出"针对哪些类目欠收敛"的差距分析(交付物本身也有价值,不必硬卡 90%) |
| TipTap decoration 与 React 19 渲染时序    | 用 dispatch transaction with meta 而不是直接 setProps;在 update transaction 中应用,jsdom 单测覆盖核心路径                                                                                  |
| Worker 在 Next.js 16 App Router 的 bundle | 实施 T1 前先读 `node_modules/next/dist/docs/`(按 web/AGENTS.md 提示);若 standard `new Worker(new URL(...))` 不工作,fallback 到自写 Webpack worker-loader(下策)                             |
| Aho-Corasick 自写正确性                   | 单测覆盖:多模式重叠("中国共产党" vs "共产党")、跨字符边界、空文本、空词库;Worker 集成测                                                                                                    |
| 连续违规计数误伤                          | sessionId 隔离 + 30 分钟 TTL;false abort 不致命(作者点"重试"再生)。e2e 覆盖正/负样本                                                                                                       |
| LLM 流量与成本                            | 三阶段都触发 LLM;① 800ms 防抖减少调用;③ fire-and-forget 限制为段落级(不是 token 级);eval 脚本本地手动跑(每次 ~$1-3 LLM 费用)                                                               |
| ProseMirror range 在 streaming 中漂移     | SectionStream 用 `insertContent at focus("end")` 永远追加,旧段 from/to 不变;在 setSectionViolations 时校对 doc size,越界 drop                                                              |

## 实施顺序(为 plan 准备)

按 PRD §4.1 自然顺序 + 横切收尾:

1. **schema 扩** + ReviewStage enum + migration + DraftToolType 加 2 值 + fixtures seed 2 条 Prompt
2. **shared 类型扩** + Review.stage 字面量 + PromptReviewResponse / SectionReviewResponse
3. **rule-loader** + yaml 7 个文件骨架(每类 3-5 条占位规则)
4. **review.service 重构**:抽 buildSafetyMessages / runReviewLLM 共用 + 加 reviewPrompt 实现 + 单测
5. **review.service 加 reviewSection** + streamSession + 单测
6. **reviews.controller 加 2 端点** + e2e prompt + e2e section
7. **sensitive-words.json + sensitive-words.ts 类型** + 词库结构校验脚本
8. **Aho-Corasick 实现** + 单测
9. **sensitive-scanner.worker** + 单测(jsdom) + Next.js 16 Worker 加载方式踩点
10. **review-decorations.ts** + 单测
11. **use-sensitive-scan + 接入 TiptapBody**
12. **use-prompt-review + PromptReviewBanner + 接入 FastModeDialog**
13. **use-section-review + SectionReviewCard + 接入 SectionStream**
14. **rules yaml 完整填**(每类 ≥ 10 条规则,positive/negative 样本)
15. **300 条标注集**(每类 ≥ 30 条 + allow.jsonl ≥ 50 条)
16. **eval-safety 脚本** + 跑 + 调 Prompt 直到 ≥ 90% + commit 报告
17. **README 加 Phase 2.5 小节** + 收尾静态五连 + 全 e2e 跑过
18. **学习笔记追写**

预估 18 个 task,3-4 天。

## 待 plan 阶段细化

- T9 Worker 加载方式(read Next.js 16 docs 决定)
- T14 yaml 规则的具体词条目细分(运营性,不在 spec 决)
- T15 标注集的具体样本(运营性)
- T16 调 Prompt 的具体 systemPrompt 文本(PE 工作,不在 spec 决)
