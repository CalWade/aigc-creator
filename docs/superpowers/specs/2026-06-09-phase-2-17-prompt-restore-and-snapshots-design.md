# Phase 2.17 — §3.5 作者私人 Prompt「恢复默认」+ 3 快照版本管理 设计

> 关联 PRD §3.5.3 极简版本管理:
>
> > **极简版本管理**:每条作者私人 Prompt 保存即覆盖,只保留最近 3 个历史快照,可点击回滚 —— 这是 PDF 「PE 多次调教评估过程」在作者侧最朴素的表达,**不做沙盒、不做 A/B 对照**,把这些复杂能力留给平台保留 Prompt(§4.7.3)。

## 0. 背景与缺口

§3.5 主链路在 Phase 2.2 已落地(数据模型、API、PromptDrawer、运行时切换),但仍欠两项 PRD §3.5.3 显式条款:

1. 「**恢复默认**」UI 动作 —— 当前作者只能在「我的」tab 里手动改 active,无明确"切回平台默认款"的入口。
2. **3 快照版本管理 + 回滚** —— PATCH 当前直接覆盖,无历史记录,作者改坏了无路可退。

本 Phase 补齐这两项,使 §3.5 主体闭环。

## 1. 范围

### 1.1 In-scope

- 新增 Prisma 模型 `PromptSnapshot`,1:N 挂在 Prompt 下,作者私人 prompt 的 PATCH 自动产生快照。
- 后端两个新端点:`GET /prompts/:id/snapshots` 列最近 3 条;`POST /prompts/:id/snapshots/:snapId/restore` 回滚。
- 前端 `PromptDrawer` 我的 tab 加「恢复默认」按钮 + 「历史 ▾」可展开列表 + 单条「回滚」按钮。
- 单元 + e2e + vitest 全覆盖。

### 1.2 Out-of-scope(YAGNI / PRD 划线)

- 快照间 diff 对照(PRD 明文"不做沙盒、不做 A/B 对照")。
- 超过 3 条的上限可配置。
- 快照命名、标签、注释。
- 快照导出 / 下载。
- 跨工具的批量「全部恢复默认」。

## 2. 数据模型

### 2.1 新增 `PromptSnapshot`(`apps/api/prisma/schema.prisma`)

```prisma
model PromptSnapshot {
  id           String   @id @default(cuid())
  promptId     String
  systemPrompt String   @db.Text
  params       Json
  fewShots     Json
  designNote   String?  @db.Text
  createdAt    DateTime @default(now())

  prompt Prompt @relation(fields: [promptId], references: [id], onDelete: Cascade)

  @@index([promptId, createdAt])
  @@map("prompt_snapshots")
}
```

并在 `Prompt` 模型尾部加反向关系:

```prisma
model Prompt {
  // … 既有字段不动 …
  snapshots PromptSnapshot[]
}
```

### 2.2 不变量

- 仅 `Prompt.owner = PRIVATE` 才会有 snapshot 记录(由 service 层 update 路径保证;PLATFORM 走只读控制器,不进 update)。
- 单 promptId 的 snapshot 数量上限 = **3**(由 service 层在事务内裁剪)。
- onDelete Cascade:Prompt 删除时,所有 snapshot 自动删除,不留孤儿行。

## 3. 后端 API

挂载位置:**`PromptsPrivateController`**(`apps/api/src/prompts/prompts-private.controller.ts`),沿用 `UseGuards(UserGuard)`。

### 3.1 新端点

```
GET    /prompts/:id/snapshots
POST   /prompts/:id/snapshots/:snapId/restore
```

### 3.2 路由对照表

| 方法 | 路径                                     | 鉴权                  | 行为                                                | 错误码                                     |
| ---- | ---------------------------------------- | --------------------- | --------------------------------------------------- | ------------------------------------------ |
| GET  | `/prompts/:id/snapshots`                 | UserGuard + ownership | 返回 `PromptSnapshot[]`,desc by createdAt,最多 3 条 | 403 非作者 / 404 prompt 不存在             |
| POST | `/prompts/:id/snapshots/:snapId/restore` | UserGuard + ownership | 用快照内容走 update 路径(自然产生新快照)            | 403 / 404(snapshot 不属于该 prompt 也 404) |

### 3.3 `PromptsService` 改动

新增私有方法 `private async assertOwn(promptId: string, userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<Prompt>`:

- 查 Prompt(用传入的 db,默认 `this.prisma`,事务内调用时传 tx 保证一致性快照)
- 不存在 → `NotFoundException`
- `prompt.owner !== "PRIVATE"` 或 `prompt.authorId !== userId` → `ForbiddenException`
- 返回 prompt(已被现有 `update` / `deleteOne` 内联做的检查替换为调用此方法,DRY)

**抽取共享私有方法** `writeWithSnapshot(tx, current, data)` ——
读到的当前 prompt 入快照、裁剪、再 update。这样 `update` 和 `restoreSnapshot` 各自开事务都调它,**不嵌套事务**。

```ts
private async writeWithSnapshot(
  tx: Prisma.TransactionClient,
  current: Prompt,
  data: UpdatePromptDto,
): Promise<Prompt> {
  await tx.promptSnapshot.create({
    data: {
      promptId: current.id,
      systemPrompt: current.systemPrompt,
      params: current.params,
      fewShots: current.fewShots,
      designNote: current.designNote,
    },
  });
  // 裁剪到 3:删第 4 旧及以后(update 前最多 3 条,新插入后最多 4 条,所以 overflow 至多 1 条)
  const overflow = await tx.promptSnapshot.findMany({
    where: { promptId: current.id },
    orderBy: { createdAt: "asc" },
    skip: 3,
  });
  if (overflow.length > 0) {
    await tx.promptSnapshot.deleteMany({
      where: { id: { in: overflow.map((s) => s.id) } },
    });
  }
  return tx.prompt.update({ where: { id: current.id }, data });
}

async update(id: string, userId: string, dto: UpdatePromptDto) {
  return this.prisma.$transaction(async (tx) => {
    const current = await this.assertOwn(id, userId, tx);
    return this.writeWithSnapshot(tx, current, dto);
  });
}

async restoreSnapshot(promptId: string, snapId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const current = await this.assertOwn(promptId, userId, tx);
    const snap = await tx.promptSnapshot.findFirst({
      where: { id: snapId, promptId },
    });
    if (!snap) throw new NotFoundException();
    return this.writeWithSnapshot(tx, current, {
      systemPrompt: snap.systemPrompt,
      params: snap.params,
      fewShots: snap.fewShots,
      designNote: snap.designNote ?? undefined,
    });
  });
}
```

新增方法:

- `listSnapshots(promptId, userId)` → assertOwn → `findMany({ where: { promptId }, orderBy: { createdAt: "desc" }, take: 3 })`

### 3.4 事务边界

snapshot 写入 + 裁剪 + Prompt update **必须同一事务**。任一失败整体回滚,前端收到 500;不出现"快照写入了 但 Prompt 没更新"。

### 3.5 DTO 不变

- 现有 `UpdatePromptDto`(systemPrompt? / params? / fewShots? / designNote?)直接复用。
- restore 端点无 body,语义上等同"用 snapshot 字段当成 PATCH body 发一次"。

## 4. 前端 UI

### 4.1 文件改动范围

仅:`apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx`

零新文件。子组件 `MyPromptItem` 内嵌一个新的 `<HistorySection>` JSX 片段(同文件内函数组件,YAGNI 不抽出)。

### 4.2 「恢复默认」按钮

放置:`MyPromptItem` 卡片底部,与「设为当前生效」并列。

逻辑:

```ts
const platformDefault = platform.find((p) => p.tool === tool && p.isStarter);
const onRestoreDefault = () => {
  if (platformDefault) setPromptId(platformDefault.id);
};
// disabled 当 !platformDefault
```

只动 `useActivePromptId(tool)` 的 promptId,**不删私人副本**,不调后端。

### 4.3 「历史 ▾」展开

UI 状态:`const [historyOpen, setHistoryOpen] = useState(false)` + `const [snapshots, setSnapshots] = useState<PromptSnapshot[]>([])`。

打开时按需 fetch:

```ts
const loadHistory = async () => {
  const res = await apiFetch(`/prompts/${prompt.id}/snapshots`);
  if (res.ok) setSnapshots(await res.json());
};
useEffect(() => {
  if (historyOpen) void loadHistory();
}, [historyOpen]);
```

每条渲染:

```
・[相对时间] / [systemPrompt 前 30 字 + …]   [回滚]
```

相对时间用 `Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" })`,当场计算,无 i18n 系统依赖。

「回滚」按钮:

```ts
const onRestore = async (snapId: string) => {
  const res = await apiFetch(`/prompts/${prompt.id}/snapshots/${snapId}/restore`, {
    method: "POST",
    body: "{}",
  });
  if (res.ok) {
    await reloadPromptList(); // 父级 reload(刷新 prompt 内容)
    await loadHistory(); // 重拉快照列表
  }
};
```

无 confirm 弹窗。回滚本身可被再次回滚,误操作可恢复。

### 4.4 数据流图

```
作者 PATCH 私人 prompt
  ↓
service.update 事务内:INSERT snapshot → 裁剪 → UPDATE prompt
  ↓
返回新 prompt → drawer reload
  ↓ (若历史展开)
loadHistory()

作者点「恢复默认」
  ↓
useActivePromptId.setPromptId(platformDefault.id)  纯前端

作者点单条「回滚」
  ↓
POST /prompts/:id/snapshots/:snapId/restore
  ↓
service.restoreSnapshot → 复用 update 路径
  (当前状态自动入快照;若已 3 条则最旧裁剪)
  ↓
返回新 prompt → drawer reload + loadHistory
```

## 5. 错误处理与边界

| 场景                                      | 行为                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| PATCH 时 snapshot insert 失败             | 事务回滚,Prompt 不更新,500 to client                        |
| restore 时 snapId 不存在或不属于该 prompt | 404                                                         |
| restore 时 prompt 已被删                  | 404(assertOwn 先发)                                         |
| 非作者 GET / POST snapshot                | 403                                                         |
| PLATFORM prompt 试 GET / restore          | 403(owner !== PRIVATE 在 assertOwn)                         |
| 平台无 isStarter 默认款(seed 异常)        | 「恢复默认」按钮 disabled + tooltip「该工具暂无平台默认款」 |
| 历史 fetch 失败                           | drawer 内 toast「历史加载失败」,展开区域显示空              |

## 6. 测试矩阵

### 6.1 api 单测(`apps/api/src/prompts/prompts.service.spec.ts`)

新增用例:

- `update` 写一条 snapshot(快照内容 = update 前的 prompt)
- `update` 第 4 次后 snapshot 表只剩 3 条(最旧被裁剪)
- `update` 失败时 snapshot 不留(事务回滚)—— 通过 mock prisma update 抛错验证
- `listSnapshots` 仅返回最多 3 条 desc by createdAt
- `listSnapshots` 非作者 → Forbidden
- `restoreSnapshot` 把 prompt 内容覆盖为 snapshot
- `restoreSnapshot` 后,snapshot 列表第 1 条是"被回滚前"的状态
- `restoreSnapshot` snapId 不属于该 prompt → NotFound
- `assertOwn` PLATFORM owner → Forbidden

### 6.2 api e2e(新文件 `apps/api/test/prompts-snapshots.e2e-spec.ts`)

完整场景:作者 register → copy 平台 prompt → PATCH x4 → GET snapshots 仅 3 条 → restore 第 2 条 → GET prompt 验证内容已变 → GET snapshots 验证最新一条是"被回滚前"。

### 6.3 web vitest(新文件 `PromptDrawer.test.tsx` 扩展或新建)

- 渲染「我的」tab,点「恢复默认」→ setPromptId 被调,参数 = platformDefault.id
- 平台无 isStarter → 按钮 disabled
- 点「历史 ▾」→ fetch `/prompts/:id/snapshots` 被调
- 历史展开后渲染 3 条
- 点单条「回滚」→ POST `/prompts/:id/snapshots/:snapId/restore` 被调,reload + loadHistory 各调一次

## 7. 迁移

新增 prisma migration `add_prompt_snapshots`:

```sql
CREATE TABLE "prompt_snapshots" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "params" JSONB NOT NULL,
  "fewShots" JSONB NOT NULL,
  "designNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prompt_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prompt_snapshots_promptId_createdAt_idx" ON "prompt_snapshots"("promptId", "createdAt");
ALTER TABLE "prompt_snapshots" ADD CONSTRAINT "prompt_snapshots_promptId_fkey"
  FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

无 data backfill —— 旧的私人 prompt 不补历史快照,从此 Phase 开始向前生效。

## 8. 验收标准

1. Prisma schema 含 `PromptSnapshot` 模型 + Prompt 反向关系。
2. 新 migration 可在干净数据库上 `prisma migrate deploy` 通过。
3. `PromptsPrivateController` 暴露 `GET .../snapshots` + `POST .../snapshots/:snapId/restore` 两个端点。
4. PATCH 路径在事务内做 INSERT snapshot + 裁剪到 3 + UPDATE prompt。
5. PromptDrawer 我的 tab 显示「恢复默认」+「历史 ▾」+ 单条「回滚」。
6. 「恢复默认」disabled 状态正确触发(平台无 isStarter 时)。
7. api 单测全绿,新增用例覆盖第 6.1 节列出的 9 项。
8. api e2e `prompts-snapshots.e2e-spec.ts` 全绿。
9. web vitest 新增 5 个用例全绿。
10. 全量回归 api typecheck/lint + web typecheck/lint + 全测试矩阵全 PASS。
11. README 加「Phase 2.17」段落,链接 spec/plan。
12. spec/plan 完成后归档到 `docs/superpowers/{specs,plans}/shipped/`。

## 9. 风险与降级

| 风险                                         | 应对                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 事务嵌套(`update` 内调 `update`)导致 PG 死锁 | 抽 `writeWithSnapshot(tx, ...)` 共享方法,update 和 restoreSnapshot 各自开事务后都调它,不嵌套事务(见 §3.3) |
| 大并发 PATCH 同一 prompt 导致快照 > 3        | 单作者改自己 prompt,实际并发极低;裁剪在事务内是 best-effort,>3 条不影响功能,只浪费 1 行存储               |
| 旧 e2e 因 schema 多一表而 fixture 重置变慢   | PromptSnapshot 无种子数据,不影响 reset 时长                                                               |

## 10. 实施顺序提示(给 plan 阶段)

1. Prisma schema + migration
2. service.assertOwn 抽取(纯重构,先跑测验回归)
3. service.update 改造为事务 + snapshot
4. service.listSnapshots / restoreSnapshot
5. 控制器端点
6. e2e
7. 前端 PromptDrawer UI
8. web vitest
9. README + 归档
