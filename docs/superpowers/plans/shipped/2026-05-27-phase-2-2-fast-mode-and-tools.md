# Phase 2.2 FAST 模式 + 9 AI 工具卡 + Prompt 自定义 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 让登录用户在 `/drafts/[id]` 能 (a) 一键 FAST 模式生成正文(选题→大纲→分段流式),(b) 选中文本调 9 个 AI 工具卡得到候选并三态决策,(c) 在 Prompt 抽屉里复制/编辑/删除私人 Prompt 并指定"当前生效"。

**Spec:** `docs/superpowers/specs/2026-05-27-phase-2-2-fast-mode-and-tools-design.md` v2.2(commit `3192e72`)。

**Style:** 骨架版——只钉签名/接口/验收命令,实现代码留给写代码时发挥。决策点在下面的「§0 已拍板决策」一次性交代。

**Phase 2.1 上下文:** TipTap 编辑器、`useAutosave` 1.5s 防抖、`DraftEditor` 5-state 状态机、PATCH `/drafts/:id` 含作者校验与 version 递增已 ship 至 commit `e0b6c38`。本计划在此之上加 LLM 接入 + 流式 + 工具调用 + Prompt 写 API。

---

## 0. 已拍板决策(plan 阶段一次性钉死)

| #   | 决策点                        | 选择                                                                                                                           | Why                                                                                                                                                              |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | DTO 鉴别器实现                | **service 入口手写 narrow**                                                                                                    | NestJS 11 + class-transformer 0.5 链路上 `@Type` discriminator 文档稀薄、坑多;手写 5 行 switch 更清晰可调试                                                      |
| D2  | shared 包承担类型源           | **是**——`DraftToolType` enum / `Candidate` union / `ToolInvokeInput` union / `OutlineItem` 全放 `packages/shared/src/`         | spec §4.3 明确"plan 阶段把它落到 shared 包";Phase 2.2 是 shared 第一次真正发挥价值                                                                               |
| D3  | shared 包导出                 | **source-only**(前端 ts 直接 import,后端 NestJS 通过 monorepo workspace + tsconfig paths 别名解析)                             | 不引入 build 步骤;现有 `main: "./src/index.ts"` 已支持                                                                                                           |
| D4  | e2e 测 SSE 用的 HTTP 客户端   | **`node:http` 真起 server + 客户端读 response stream**                                                                         | supertest 不支持流式;`@nestjs/testing` 的 `httpAdapter` 内部 API 不稳。`node:http` 直白、无依赖、贴近真实链路                                                    |
| D5  | commit 节奏                   | **按 task 一 commit**(本计划 11 commits)                                                                                       | 与 Phase 2.1 节奏一致(memory `feedback_no_real_users_means_no_user_metrics_in_report.md` 与既往实践);最终用户可 `git rebase -i` squash 成 spec §10 写的 1 commit |
| D6  | outline endpoint LLM 失败响应 | **502 Bad Gateway**(走 NestJS 默认 ExceptionFilter)                                                                            | 同步 REST 路径,LLM 是上游服务,语义匹配 502;不需要自定义 Filter                                                                                                   |
| D7  | Prompt 抽屉入口位置           | **SaveStatus 左边的齿轮按钮**(Phase 2.1 SaveStatus 在 header 右侧)                                                             | 与既有布局协同,不抢 SaveStatus 视觉权重                                                                                                                          |
| D8  | Drawer 组件实现               | **headless 自写**(纯 React + Tailwind,fixed 定位 + transition + backdrop)                                                      | 项目当前未装 shadcn/ui 或 headlessui;Phase 2.2 引入新依赖收益与成本不匹配                                                                                        |
| D9  | prompts schema 兜底校验       | plan Task 1 加一步 `pnpm prisma migrate status` + `Prompt.isStarter` / `Prompt.tool` / `@@index([owner, tool])` 字段存在性核查 | spec §7 声称"无需 schema 迁移",但 plan 阶段不能信声称,要验                                                                                                       |

---

## 1. File Structure

**新增(后端)**:

- `apps/api/src/config/llm.config.ts` — LLM_BASE_URL/API_KEY/MODEL 校验
- `apps/api/src/llm/llm.client.ts` — OpenAI SDK 封装,`chat()` + `chatStream()`
- `apps/api/src/llm/llm.module.ts` — `@Global()`
- `apps/api/src/llm/dto/chat-message.dto.ts`
- `apps/api/src/drafts/dto/outline-request.dto.ts`
- `apps/api/src/drafts/dto/sections-stream.dto.ts`(POST body 携带 outline)
- `apps/api/src/drafts/dto/tool-invoke.dto.ts`
- `apps/api/src/drafts/outline.service.ts`
- `apps/api/src/drafts/sections.service.ts`
- `apps/api/src/drafts/tools.service.ts`
- `apps/api/src/prompts/prompts-private.controller.ts` — 4 个写端点,类级 `@UseGuards(UserGuard)`
- `apps/api/src/prompts/dto/copy-prompt.dto.ts`
- `apps/api/src/prompts/dto/update-prompt.dto.ts`
- `apps/api/test/fast-mode.e2e-spec.ts` — 10 用例
- `apps/api/test/prompts-write.e2e-spec.ts` — 8 用例
- `apps/api/test/helpers/sse-client.ts` — D4 的 `node:http` SSE 客户端 helper

**新增(shared)**:

- `packages/shared/src/draft-tools.ts` — `DraftToolType` / `ToolInvokeInput` / `Candidate` / `OutlineItem`

**新增(前端)**:

- `apps/web/src/app/drafts/[id]/_components/FastModeDialog.tsx`
- `apps/web/src/app/drafts/[id]/_components/OutlinePanel.tsx`
- `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx`
- `apps/web/src/app/drafts/[id]/_components/AiBubbleMenu.tsx`
- `apps/web/src/app/drafts/[id]/_components/ToolCandidateCard.tsx`
- `apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx`
- `apps/web/src/app/drafts/[id]/_components/Drawer.tsx` — D8 的 headless drawer
- `apps/web/src/lib/sse.ts` — `streamFetch()` 解析器
- `apps/web/src/hooks/use-streaming-generation.ts`
- `apps/web/src/hooks/use-active-prompt-id.ts`

**修改(后端)**:

- `apps/api/src/drafts/drafts.service.ts` — 抽 `assertAuthor(id, userSub): Promise<Draft>`(原 49-51 行)
- `apps/api/src/drafts/drafts.controller.ts` — 挂 3 个新路由,类级 UserGuard 复用
- `apps/api/src/drafts/drafts.module.ts` — 注册新 service,imports LlmModule
- `apps/api/src/prompts/prompts.controller.ts` — **保持 `@Public()` 不动**
- `apps/api/src/prompts/prompts.module.ts` — 注册 PromptsPrivateController
- `apps/api/src/prompts/prompts.service.ts` — copy/update/delete + 越权检查 + 默认款用 `isStarter`
- `apps/api/src/app.module.ts` — 注册 LlmModule
- `apps/api/.env.example`、根 `.env.example`、`.env`(本地) — `LLM_*` 三项 + 多厂商示例
- `apps/api/package.json` — 加 `openai`

**修改(前端)**:

- `apps/web/src/lib/use-autosave.ts` — 扩签名 `AutosaveControl<T>` 含 `setStreaming` / `flush`
- `apps/web/src/lib/use-autosave.test.ts` — 加 setStreaming/flush 4 用例
- `apps/web/src/components/draft-editor.tsx` — 消费新 API,向 SectionStream 透传
- `apps/web/src/app/drafts/[id]/page.tsx` — 仍是 server,沿用 Phase 2.1 写法

**修改(根)**:

- `README.md` — "本地开发 → LLM 接入"小节,3 种 baseURL 示例

---

## Task 索引

1. 装 `openai` SDK + 加 `LLM_*` 环境变量 + `llm.config.ts`(D9 schema 兜底校验)
2. shared 包落 `DraftToolType` / `ToolInvokeInput` / `Candidate` / `OutlineItem`
3. LlmClient + LlmModule(单测 mock OpenAI SDK)
4. drafts.service 抽 `assertAuthor`(纯重构,e2e 全绿守门)
5. outline.service + POST /drafts/:id/outline(同步 REST)
6. sections.service + POST /drafts/:id/sections/stream(SSE,D4 客户端)
7. tools.service + POST /drafts/:id/tools/invoke(D1 手写 narrow)
8. prompts.service 扩展 + PromptsPrivateController(4 个写端点 + 默认款 isStarter)
9. useAutosave 扩签名 setStreaming/flush + 4 单测
10. 前端组件树:FastModeDialog / OutlinePanel / SectionStream / AiBubbleMenu / ToolCandidateCard / PromptDrawer / Drawer / 2 hooks
11. README "LLM 接入" + 静态五连 + 手测脚本

---

## Task 1: 装 openai SDK + LLM 环境变量 + 配置校验 + Schema 兜底

**Files:**

- Create: `apps/api/src/config/llm.config.ts`
- Modify: `apps/api/.env.example`, 根 `.env.example`, `.env`(本地,不入库)
- Modify: `apps/api/package.json`(deps 加 `openai`)
- Modify: `pnpm-lock.yaml`

**关键契约:**

- `llm.config.ts` 导出 `getLlmConfig(cs: ConfigService): { baseURL: string; apiKey: string; model: string }`,用 `cs.getOrThrow()`,缺失抛(沿用 Phase 1.4 `JWT_SECRET` 风格)。
- `.env.example` 三项 + 注释列 OpenAI / 火山 ARK / DeepSeek / 自建网关 4 种填法。

**Steps:**

- [ ] **Step 1: 装 openai**
      Run: `pnpm --filter @bytedance-aigc/api add openai`
      Expected: 命令成功,lock 更新。
- [ ] **Step 2: D9 — schema 兜底校验**
      Run: `pnpm --filter @bytedance-aigc/api exec prisma migrate status`
      Run: `Grep -n "isStarter\|@@index\(\[owner, tool\]\)" apps/api/prisma/schema.prisma`
      Expected: migrate 状态 up-to-date;`isStarter` 与 `@@index([owner, tool])` 都在 Prompt 模型里。
      若任一不在 → **STOP**,补 schema 迁移再继续(spec §7 声称会被打脸)。
- [ ] **Step 3: 写 llm.config.ts + 注册到 AuthModule 已经 forRoot 的 ConfigModule(全局可用,无需重复 forRoot)**
- [ ] **Step 4: .env.example 加三项 + 多厂商注释;本地 .env 由用户填**
- [ ] **Step 5: typecheck**
      Run: `pnpm --filter @bytedance-aigc/api exec tsc --noEmit`
      Expected: 退出码 0。
- [ ] **Step 6: 验 postinstall 不被拦(S2)**
      Run: `pnpm install`
      Expected: 不出现 `ignored build scripts` 警告涉及 openai。
- [ ] **Step 7: Commit**
  ```
  chore(api): 装 openai SDK + LLM_* 环境变量与 llm.config 校验
  ```

---

## Task 2: shared 包落类型源

**Files:**

- Create: `packages/shared/src/draft-tools.ts`
- Modify: `packages/shared/src/index.ts`(re-export)

**关键契约:**

```ts
// packages/shared/src/draft-tools.ts
export const DRAFT_TOOL_TYPES = [
  "REWRITE_FLUENT",
  "EXPAND",
  "TRANSFORM_STYLE",
  "REWRITE_OPENING",
  "HEADLINE_SUB",
  "HEADLINE_NEW",
  "ADD_FACTS",
  "ADD_TOPIC",
  "IMAGE_SUGGEST",
] as const;
export type DraftToolType = (typeof DRAFT_TOOL_TYPES)[number];

export interface OutlineItem {
  heading: string;
  summary: string;
  hint?: string;
}

export type Candidate =
  | { kind: "text"; text: string }
  | { kind: "image"; alt: string; reason: string };

export type ToolInvokeInput =
  | {
      tool: "REWRITE_FLUENT" | "EXPAND" | "TRANSFORM_STYLE" | "REWRITE_OPENING";
      input: { selectedText: string };
    }
  | { tool: "HEADLINE_SUB"; input: { selectedText: string } }
  | { tool: "HEADLINE_NEW"; input: { fullText: string } }
  | { tool: "ADD_TOPIC"; input: { fullText: string } }
  | { tool: "ADD_FACTS"; input: { selectedText: string; fullText: string } }
  | { tool: "IMAGE_SUGGEST"; input: { fullText: string } };
```

**Steps:**

- [ ] **Step 1: 写 draft-tools.ts**
- [ ] **Step 2: index.ts 用 `export *` 重导**
- [ ] **Step 3: 前端 + 后端各 import 一次验联通**(临时 import 在任意 .ts 顶部,typecheck 后撤掉)
      Run: `pnpm typecheck`
      Expected: 全绿;workspace 解析 `@bytedance-aigc/shared` 不报错。
- [ ] **Step 4: Commit**
  ```
  feat(shared): DraftToolType / ToolInvokeInput / Candidate / OutlineItem 类型源
  ```

---

## Task 3: LlmClient + LlmModule

**Files:**

- Create: `apps/api/src/llm/llm.client.ts`
- Create: `apps/api/src/llm/llm.module.ts`
- Create: `apps/api/src/llm/dto/chat-message.dto.ts`
- Create: `apps/api/src/llm/llm.client.spec.ts`(单测)
- Modify: `apps/api/src/app.module.ts`(imports 加 LlmModule)

**关键契约:**

```ts
// llm.client.ts
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ChatStreamFrame {
  delta?: string;
  done?: true;
  error?: string;
}

@Injectable()
export class LlmClient {
  constructor(private readonly cs: ConfigService) {
    /* new OpenAI({...}) 单例 */
  }
  async chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>;
  chatStream(messages: ChatMessage[], opts?: { temperature?: number }): Observable<ChatStreamFrame>;
}
```

**Adapter 层职责**(spec §4.2 + N5):

- finish_reason 归一:OpenAI `"stop"` / 部分厂商 `null` / 自定义 → `{ done: true }`
- 错误归一:SDK 抛错 → catch → `{ error: <message> }` emit 而非 throw
- 不暴露任何厂商专属字段到 service 层

**Steps:**

- [ ] **Step 1: 写 LlmClient + LlmModule(`@Global()` exports `LlmClient`)**
- [ ] **Step 2: 写 4 个单测(mock `openai` SDK constructor)**
  - chat 返回完整 string
  - chatStream emit token 序列 + done
  - chat 限流错误 → throw(同步路径让 Filter 转 502,即 D6)
  - baseURL 自定义注入透传(`new OpenAI({ baseURL })` 被 spy 到正确的值)
- [ ] **Step 3: app.module.ts 注册 LlmModule**
- [ ] **Step 4: 跑 vitest**
      Run: `pnpm --filter @bytedance-aigc/api test`
      Expected: 4 新 + 已有全绿。
- [ ] **Step 5: typecheck + build**
      Run: `pnpm --filter @bytedance-aigc/api typecheck && pnpm --filter @bytedance-aigc/api build`
- [ ] **Step 6: Commit**
  ```
  feat(api): LlmClient(OpenAI SDK + 自定义 baseURL,薄 adapter 归一)
  ```

---

## Task 4: drafts.service 抽 assertAuthor(纯重构,e2e 守门)

**Files:**

- Modify: `apps/api/src/drafts/drafts.service.ts`

**关键契约:**

- 抽出 `private async assertAuthor(id: string, userSub: string): Promise<Draft>` —— 复用现有 49-51 行 `findUnique` + 不存在 404 + authorId 不匹配 403 三件事。
- `update()` 改为先 `await this.assertAuthor(id, authorId)` 再 update,数据流不变。
- 暴露给同模块新 service 用:**改 private → 改 public**(or 同 module 内通过依赖注入复用)。拍 **public**(YAGNI,改两个字符比写 helper 类轻)。

**Steps:**

- [ ] **Step 1: 抽 assertAuthor 为 public method**
- [ ] **Step 2: update() 改用 assertAuthor**
- [ ] **Step 3: 跑现有 e2e 守门**
      Run: `pnpm --filter @bytedance-aigc/api test:e2e`
      Expected: 现有 20 用例全绿(纯重构,行为不变)。
- [ ] **Step 4: Commit**
  ```
  refactor(api): drafts.service 抽 assertAuthor 供新 service 复用
  ```

---

## Task 5: outline.service + POST /drafts/:id/outline(同步 REST)

**Files:**

- Create: `apps/api/src/drafts/outline.service.ts`
- Create: `apps/api/src/drafts/dto/outline-request.dto.ts`
- Create: `apps/api/src/drafts/outline.service.spec.ts`
- Modify: `apps/api/src/drafts/drafts.controller.ts`(挂 POST /:id/outline)
- Modify: `apps/api/src/drafts/drafts.module.ts`(注册 outline.service)
- Modify: `apps/api/test/fast-mode.e2e-spec.ts`(用例 1 + 5)

**关键契约:**

```ts
// outline-request.dto.ts
export class OutlineRequestDto {
  @IsString() @MinLength(1) @MaxLength(500) topic!: string;
  @IsOptional() @IsString() @MaxLength(500) hint?: string;
}

// outline.service.ts
@Injectable()
export class OutlineService {
  constructor(
    private readonly drafts: DraftsService,
    private readonly llm: LlmClient,
  ) {}
  async generate(
    draftId: string,
    userSub: string,
    dto: OutlineRequestDto,
  ): Promise<{ sections: OutlineItem[] }>;
}
```

**实现要点(留给写代码时):**

- `await this.drafts.assertAuthor(draftId, userSub)`(404/403)
- 构造 system + user prompt(模板里要求 LLM 返回 JSON `{ sections: [{heading, summary, hint?}] }`,3-8 项)
- `this.llm.chat(...)` → 解析 JSON → 校验 `OutlineItem[]` 长度 3-8(否则抛 BadGateway)
- LLM 抛错 → 透出(D6 让默认 Filter 转 502)

**Controller(只列方法,不展开):**

```ts
@Post(":id/outline")
@HttpCode(HttpStatus.OK)
generateOutline(
  @Param("id") id: string,
  @CurrentUser() user: JwtPayload,
  @Body() dto: OutlineRequestDto,
): Promise<{ sections: OutlineItem[] }>
```

**Steps:**

- [ ] **Step 1: DTO + service + controller 路由(类级 UserGuard 复用)**
- [ ] **Step 2: 单测 outline.service.spec.ts**
  - happy: mock LlmClient.chat 返 valid JSON,得 sections 长度 3-8
  - LLM 返回非法 JSON → 抛 BadGatewayException
  - LLM 返回 sections 长度 < 3 或 > 8 → 抛 BadGatewayException
  - assertAuthor 被调一次(spy 验)
- [ ] **Step 3: e2e 用例 1(200 sections 3-8) + 用例 5(别人 draftId → 403)**
- [ ] **Step 4: 跑 vitest + e2e**
      Run: `pnpm --filter @bytedance-aigc/api test && pnpm --filter @bytedance-aigc/api test:e2e`
      Expected: 全绿。
- [ ] **Step 5: Commit**
  ```
  feat(api): POST /drafts/:id/outline + outline.service(无副作用,同步 REST)
  ```

---

## Task 6: sections.service + POST /drafts/:id/sections/stream(SSE)

**Files:**

- Create: `apps/api/src/drafts/sections.service.ts`
- Create: `apps/api/src/drafts/dto/sections-stream.dto.ts`
- Create: `apps/api/src/drafts/sections.service.spec.ts`
- Create: `apps/api/test/helpers/sse-client.ts` — D4 的 `node:http` 客户端
- Modify: `apps/api/src/drafts/drafts.controller.ts`(挂 POST /:id/sections/stream)
- Modify: `apps/api/src/drafts/drafts.module.ts`(注册 sections.service)
- Modify: `apps/api/test/fast-mode.e2e-spec.ts`(用例 2 + 9)

**关键契约:**

```ts
// sections-stream.dto.ts
class OutlineItemDto {
  @IsString() heading!: string;
  @IsString() summary!: string;
  @IsOptional() @IsString() hint?: string;
}
export class SectionsStreamDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OutlineItemDto)
  sections!: OutlineItemDto[];
  @IsOptional() @IsInt() @Min(0) cursor?: number;
}

// sections.service.ts
@Injectable()
export class SectionsService {
  constructor(
    private readonly drafts: DraftsService,
    private readonly llm: LlmClient,
  ) {}
  stream(draftId: string, userSub: string, dto: SectionsStreamDto): Observable<MessageEvent>;
  // MessageEvent.type: "section.start" | "token" | "section.end" | "done" | "error"
}
```

**实现要点(留给写代码时):**

- service 内部 try/catch **所有**可能抛错的代码(prisma / LLM / JSON)→ Observable.next 一帧 `{ type: "error", data: { message } }` + observer.complete()(spec §4.6)
- 不要让异常 bubble 出 Observable(全局 PrismaKnownRequestFilter 会截胡)
- 顺序:`assertAuthor` → 对每个 section 拼 prompt → `chatStream()` → 把 frame 包成 `{ type: "token", data: { index, delta } }` 推给 outer Observable
- 流末 emit `{ type: "done", data: {} }` + complete()

**Controller:**

```ts
@Sse(":id/sections/stream")
@HttpCode(HttpStatus.OK)
streamSections(
  @Param("id") id: string,
  @CurrentUser() user: JwtPayload,
  @Body() dto: SectionsStreamDto,
): Observable<MessageEvent>
// 注意:类级已挂 @UseGuards(UserGuard),不重复挂方法级
```

> **未现场验证(spec §4.6 标注)**:`@Sse()` 装饰器在 NestJS 11 上是否接受 POST + Body。如果实际跑下来发现 `@Sse()` 只挂 GET,fallback 到 `@Post(":id/sections/stream")` + 手动设 `Content-Type: text/event-stream` + 用 `Response.write` 写帧(NestJS 允许 controller 拿 `@Res({ passthrough: false })`)。Step 1 跑下来再决定。

**SSE 客户端 helper(D4):**

```ts
// apps/api/test/helpers/sse-client.ts
export interface SseFrame {
  event: string;
  data: unknown;
}
export async function readSse(opts: {
  url: string;
  method: "POST";
  body: unknown;
  token: string;
}): Promise<SseFrame[]>;
```

实现思路:`http.request` → 读 `data` 事件 → 按 `\n\n` 切帧 → 解析 `event:` / `data:` 行 → JSON.parse data。等响应自然 close 时 resolve。

**Steps:**

- [ ] **Step 1: 先 spike `@Sse()` + POST + Body 是否兼容**
      写 1 个 demo 路由,启 dev server,curl 一发——若 `@Sse()` 拒 POST,改走 fallback。
- [ ] **Step 2: SectionsService + DTO + controller 路由**
- [ ] **Step 3: 单测 sections.service.spec.ts**
  - happy: mock LlmClient.chatStream 推 3 帧 + done,outer Observable 收齐 section.start/token×3/section.end/done
  - LLM 抛错 → outer Observable 收到 error 帧而非 throw
  - assertAuthor 不通过 → 立即 emit error(403 这种"还没开流就拒"的也要走 error 帧?— **改为**:assertAuthor 失败时 throw(让全局 guard / Filter 转 403 JSON,因为响应头还没切 SSE)。文档里钉一下。
- [ ] **Step 4: SSE 客户端 helper + e2e 用例 2 + 9**
  - 用例 2: 真实 JWT 走 SSE,收齐帧序列;**不 mock JwtAuthGuard**(M3 回归)
  - 用例 9: service 主动注入 throw,验客户端收到 `event: error`(防全局 Filter 截胡)
- [ ] **Step 5: 跑 vitest + e2e**
- [ ] **Step 6: Commit**
  ```
  feat(api): POST /drafts/:id/sections/stream + sections.service(SSE)
  ```

---

## Task 7: tools.service + POST /drafts/:id/tools/invoke

**Files:**

- Create: `apps/api/src/drafts/tools.service.ts`
- Create: `apps/api/src/drafts/dto/tool-invoke.dto.ts`
- Create: `apps/api/src/drafts/tools.service.spec.ts`
- Modify: `apps/api/src/drafts/drafts.controller.ts`(挂 POST /:id/tools/invoke)
- Modify: `apps/api/src/drafts/drafts.module.ts`(注册 tools.service + imports PromptsModule 用其 service)
- Modify: `apps/api/test/fast-mode.e2e-spec.ts`(用例 3/4/6/7/8/10)

**关键契约:**

```ts
// tool-invoke.dto.ts — D1 决策:DTO 层只校验外壳,内层 input 在 service 入口手写 narrow
export class ToolInvokeDto {
  @IsIn(DRAFT_TOOL_TYPES as readonly string[])
  tool!: DraftToolType;

  @IsObject()
  input!: Record<string, unknown>; // service 入口按 tool 字段 narrow 后再校字段类型

  @IsOptional()
  @IsString()
  promptId?: string;
}

// tools.service.ts
@Injectable()
export class ToolsService {
  constructor(
    private readonly drafts: DraftsService,
    private readonly llm: LlmClient,
    private readonly prompts: PromptsService,
  ) {}
  async invoke(
    draftId: string,
    userSub: string,
    dto: ToolInvokeDto,
  ): Promise<{ candidates: Candidate[] }>;
}
```

**实现要点(留给写代码时):**

- 入口按 `dto.tool` 走 switch,对应 narrow `dto.input`(D1):
  - REWRITE_FLUENT/EXPAND/TRANSFORM_STYLE/REWRITE_OPENING/HEADLINE_SUB:必须 `input.selectedText: string`,长度 1-2000
  - HEADLINE_NEW/ADD_TOPIC/IMAGE_SUGGEST:必须 `input.fullText: string`,长度 1-50000
  - ADD_FACTS:必须同时有 selectedText + fullText
  - 任一不满足 → BadRequestException
- `await this.drafts.assertAuthor(draftId, userSub)`(404/403)
- 解析 `dto.promptId`:
  - 无 → `prompts.findDefault(tool)`(Task 8 会落实,走 `isStarter:true` 唯一命中,缺失则回退首条)
  - 有 → `prompts.findOneOwnedOrPlatform(promptId, userSub, tool)`(必须 PLATFORM 或 (PRIVATE && authorId=userSub) 且 prompt.tool === dto.tool;否则 403)
- 拼 messages → `this.llm.chat(...)` →
  - 8 个文本工具:`return { candidates: [{ kind: "text", text: result }] }`(HEADLINE_NEW 可后处理 split 成 N 项)
  - IMAGE_SUGGEST:LLM 提示返回 JSON `[{ alt, reason }, ...]`,解析后 `kind: "image"` 包装

**Controller:**

```ts
@Post(":id/tools/invoke")
@HttpCode(HttpStatus.OK)
invokeTool(
  @Param("id") id: string,
  @CurrentUser() user: JwtPayload,
  @Body() dto: ToolInvokeDto,
): Promise<{ candidates: Candidate[] }>
```

**Steps:**

- [ ] **Step 1: DTO + service + controller 路由**
- [ ] **Step 2: 单测 tools.service.spec.ts**
  - 9 个 case 各 1 条 happy(mock LlmClient + PromptsService)
  - REWRITE_FLUENT 输入只给 fullText 不给 selectedText → BadRequest
  - promptId 指别人的 PRIVATE → 403
  - IMAGE_SUGGEST happy 验 candidates[0].kind === "image"
- [ ] **Step 3: e2e 用例 3/4/6/7/8/10**
  - 3:REWRITE_FLUENT 200 + candidates[0].kind === "text"
  - 4:HEADLINE_NEW 200 + candidates[0].kind === "text"
  - 6:不存在的 draftId → 404
  - 7:别人的 draftId → 403(N2 新增,assertAuthor 在新端点回归)
  - 8:promptId 指别人的 PRIVATE → 403
  - 10:IMAGE_SUGGEST 200 + candidates[0].kind === "image" + alt + reason
- [ ] **Step 4: 跑 vitest + e2e**
- [ ] **Step 5: Commit**
  ```
  feat(api): POST /drafts/:id/tools/invoke + tools.service(9 工具 + DraftToolType union)
  ```

---

## Task 8: prompts.service 扩展 + PromptsPrivateController

**Files:**

- Create: `apps/api/src/prompts/prompts-private.controller.ts`
- Create: `apps/api/src/prompts/dto/copy-prompt.dto.ts`(可空,用 platformId 即足)
- Create: `apps/api/src/prompts/dto/update-prompt.dto.ts`
- Modify: `apps/api/src/prompts/prompts.service.ts`
- Modify: `apps/api/src/prompts/prompts.module.ts`(注册新 controller + 导出 service 给 DraftsModule 用)
- Create: `apps/api/test/prompts-write.e2e-spec.ts`(8 用例)
- Create: `apps/api/src/prompts/prompts.service.spec.ts`(若现有未覆盖)

**关键契约(prompts.service 新增方法):**

```ts
async copyToPrivate(platformId: string, userSub: string): Promise<Prompt>
async update(id: string, userSub: string, dto: UpdatePromptDto): Promise<Prompt>
async deleteOne(id: string, userSub: string): Promise<void>
async listPrivate(userSub: string): Promise<Prompt[]>
async findDefault(tool: DraftToolType): Promise<Prompt>            // isStarter:true 唯一命中,缺失回退首条
async findOneOwnedOrPlatform(id: string, userSub: string, tool: DraftToolType): Promise<Prompt>
```

**校验规则:**

- `copyToPrivate`:source 必须 `owner: PLATFORM`,否则 BadRequest;新建 PRIVATE,`sourcePromptId = platformId`,`authorId = userSub`,其他字段拷贝
- `update` / `deleteOne`:必须 `owner: PRIVATE` && `authorId === userSub`,否则 PLATFORM 抛 403、别人的 PRIVATE 抛 403、不存在抛 404
- `findDefault`:先 `findFirst({ where: { owner:"PLATFORM", tool, isStarter:true } })`,null 则 `findFirst({ where:{owner:"PLATFORM",tool}, orderBy:{createdAt:"asc"} })`,仍 null 抛 NotFound

**PromptsPrivateController:**

```ts
@Controller("prompts")
@UseGuards(UserGuard)   // 不挂 @Public()
export class PromptsPrivateController {
  constructor(private readonly prompts: PromptsService) {}

  @Get("private")
  listPrivate(@CurrentUser() user: JwtPayload): Promise<Prompt[]>

  @Post(":platformId/copy")
  @HttpCode(HttpStatus.CREATED)
  copy(@Param("platformId") platformId: string, @CurrentUser() user: JwtPayload): Promise<Prompt>

  @Patch(":id")
  update(@Param("id") id: string, @CurrentUser() user: JwtPayload, @Body() dto: UpdatePromptDto): Promise<Prompt>

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id") id: string, @CurrentUser() user: JwtPayload): Promise<void>
}
```

**update-prompt.dto.ts:**

```ts
export class UpdatePromptDto {
  @IsOptional() @IsString() systemPrompt?: string;
  @IsOptional() @IsObject() params?: Record<string, unknown>;
  @IsOptional() @IsArray() fewShots?: Array<{ user: string; assistant: string }>;
  @IsOptional() @IsString() designNote?: string;
}
```

**关键坑(N3):**

- `GET /prompts/private` 与原 `PromptsController.findOne(":id")` 都是 `@Get(":id")` 形式 → **静态 segment "private" 必须在 PromptsPrivateController 上**,Nest 路由匹配按 controller 注册 + 静态优先,验证一下;若有歧义,把 PromptsPrivateController 在 module 数组里写在 PromptsController 之前。
- 原 PromptsController 保持 `@Public()` 不动(向后兼容 Phase 1.4 5 个 e2e)。

**Steps:**

- [ ] **Step 1: DTOs + service 新方法**
- [ ] **Step 2: PromptsPrivateController + module 注册**
- [ ] **Step 3: 单测 prompts.service.spec.ts**(若已有就追加)
  - copyToPrivate happy + source 是 PRIVATE → BadRequest
  - update PLATFORM → 403
  - update 别人 PRIVATE → 403
  - delete 同上两条
  - findDefault:isStarter 命中 → 返该条;无 isStarter 但有 PLATFORM → 返首条;都无 → NotFound
- [ ] **Step 4: 写 prompts-write.e2e-spec.ts 8 用例**(spec §8.2)
- [ ] **Step 5: 跑全后端**
      Run: `pnpm --filter @bytedance-aigc/api test && pnpm --filter @bytedance-aigc/api test:e2e`
      Expected: e2e 总数 20 → 38(20 旧 + 10 fast-mode + 8 prompts-write)。
- [ ] **Step 6: Commit**
  ```
  feat(api): PromptsPrivateController(copy/update/delete/listPrivate)+ 默认款 isStarter 选取
  ```

---

## Task 9: useAutosave 扩签名 setStreaming/flush + 4 单测

**Files:**

- Modify: `apps/web/src/lib/use-autosave.ts`
- Modify: `apps/web/src/lib/use-autosave.test.ts`

**关键契约(spec §5.3 v2.2):**

```ts
type AutosaveControl<T> = {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  setStreaming: (on: boolean) => void;
  flush: () => Promise<void>;
};
function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs?: number,
): AutosaveControl<T>;
```

**行为合约:**

- `setStreaming(true)`:value 引用变化时**不**触发 setStatus("dirty") 也**不**启动 setTimeout;saveRef + valueRef 仍同步更新最新值
- `setStreaming(false)`:**不自动**触发 PATCH;调用方需要落库就显式调 flush()
- `flush()`:无视当前 status,call 一次 `save(latestValueRef.current)`;status saving→saved/error;返回的 Promise 在 settle 时 settle

**实现要点(留给写代码时):**

- 内部加 `streamingRef = useRef(false)` 和 `valueRef = useRef(value)`(每次 effect 同步)
- 主 effect 在 streamingRef.current 时 early-return,跳过 setTimeout;但仍要 update valueRef
- `flush` 用 useCallback,内部 clearTimeout 旧防抖 + 立即调 save

**Steps:**

- [ ] **Step 1: 扩 hook 实现**
- [ ] **Step 2: 加 4 个单测**
  - setStreaming(true) 后 value 变化不触发 save(advanceTimers 完仍 0 调用)
  - setStreaming(false) 后再变 value 恢复正常防抖
  - flush() 无视 status 立即 save 且 await 到 settle
  - flush() 期间内部 status 走 saving → saved
- [ ] **Step 3: 跑 vitest**
      Run: `pnpm --filter @bytedance-aigc/web test`
      Expected: 旧 4 + 新 4 全绿。
- [ ] **Step 4: Commit**
  ```
  feat(web): useAutosave 扩签名 setStreaming/flush 与流式协调
  ```

---

## Task 10: 前端组件树(7 组件 + 2 hooks + sse 解析器)

**Files:**

新增(全部 `"use client"` 除 sse.ts):

- `apps/web/src/lib/sse.ts` — `streamFetch()` 解析器(纯函数)
- `apps/web/src/hooks/use-streaming-generation.ts`
- `apps/web/src/hooks/use-active-prompt-id.ts`
- `apps/web/src/app/drafts/[id]/_components/Drawer.tsx` — D8 headless drawer
- `apps/web/src/app/drafts/[id]/_components/FastModeDialog.tsx`
- `apps/web/src/app/drafts/[id]/_components/OutlinePanel.tsx`
- `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx`
- `apps/web/src/app/drafts/[id]/_components/AiBubbleMenu.tsx`
- `apps/web/src/app/drafts/[id]/_components/ToolCandidateCard.tsx`
- `apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx`

修改:

- `apps/web/src/components/draft-editor.tsx` — 接入 setStreaming/flush,持有 FastMode/Drawer 入口
- `apps/web/src/app/drafts/[id]/page.tsx` — 仅确认仍是 server,无需改动

**关键契约(挑骨架,实现留给写代码):**

```ts
// lib/sse.ts
export interface SseEvent { event: string; data: unknown }
export async function* streamFetch(opts: {
  url: string; method: "POST"; body: unknown; token: string; signal?: AbortSignal;
}): AsyncGenerator<SseEvent>;
// 内部:fetch + ReadableStream + TextDecoder + 按 \n\n 分帧 + 解析 event:/data: + JSON.parse data

// hooks/use-streaming-generation.ts
export interface StreamingHandlers {
  onSectionStart: (e: { index: number; heading: string }) => void;
  onToken: (e: { index: number; delta: string }) => void;
  onSectionEnd: (e: { index: number }) => void;
  onDone: () => void;
  onError: (e: { message: string }) => void;
}
export function useStreamingGeneration(): {
  status: "idle" | "streaming" | "done" | "error";
  start: (draftId: string, sections: OutlineItem[], handlers: StreamingHandlers) => Promise<void>;
  stop: () => void;
};

// hooks/use-active-prompt-id.ts(SSR 安全:typeof window 守卫)
export function useActivePromptId(tool: DraftToolType): {
  promptId: string | null;
  setPromptId: (id: string | null) => void;
};
// localStorage key: `bytedance-aigc:active-prompt:<tool>`
```

**组件职责(每个一段话):**

- `Drawer.tsx`:headless,props `{ open, onClose, title, children }`;fixed 右侧滑入,backdrop 点击关。无依赖,纯 Tailwind transition。
- `FastModeDialog.tsx`:模态,topic + hint 两输入,提交后调 `POST /drafts/:id/outline`,得 sections 后 onAccept 回调透传给父组件,关闭自身。
- `OutlinePanel.tsx`:展示 + 编辑 sections 列表,本地 state(增/删/改 heading/summary,简单上下移代替拖拽——D8 同样原则不引依赖);"开始生成"按钮调父组件回调。
- `SectionStream.tsx`:接收 sections + draftId,调用 `useStreamingGeneration`;onSectionStart 时通过 TipTap editor `chain().insertContentAt` 在文末写 heading + 空 paragraph;onToken 追加 delta 到对应段落末尾;**流前 flush() + setStreaming(true);流末 setStreaming(false) + flush()**;期间 `editor.options.editable = false`。
- `AiBubbleMenu.tsx`:封装 `@tiptap/extension-bubble-menu`(若 `@tiptap/starter-kit` 未带,Task 10 装一次),3 组按钮按 spec §5.4 `TOOL_GROUPS` 渲染;点按钮 → 父组件回调带 (tool, selectedText, fullText) 上送。
- `ToolCandidateCard.tsx`:绝对定位浮在选区下方,接 candidates 数组按 kind 分支渲染;3 按钮(采用/修改/关闭)。修改进 textarea。采用调 `editor.chain().focus().deleteSelection().insertContent(text).run()`(text 类)或 `insertContent(`![${alt}](${reason})`)` 等约定(image 类先按 reason 文字插入,详细图片选择留 Phase 后续)。
- `PromptDrawer.tsx`:用 Drawer 包裹;两 tab "平台 / 我的";"我的"的每条带"复制/编辑/删除/设为当前生效"操作;PLATFORM 的每条带"复制到我的"。调 GET /prompts、GET /prompts/private、POST /:id/copy、PATCH /:id、DELETE /:id。"当前生效"调 useActivePromptId。
- `draft-editor.tsx`:消费 useAutosave 新返回的 setStreaming/flush;header 加 FAST 入口按钮 + 齿轮按钮(D7);把 setStreaming/flush + editor 实例 通过 props 传给 SectionStream;持有 fastModeOpen/promptDrawerOpen state。

**Steps:**

- [ ] **Step 1: 装 @tiptap/extension-bubble-menu(若需要)**
      Run: `pnpm --filter @bytedance-aigc/web add @tiptap/extension-bubble-menu`
- [ ] **Step 2: 落 sse.ts + 2 hooks(纯逻辑)**
- [ ] **Step 3: 落 Drawer + FastModeDialog + OutlinePanel + AiBubbleMenu + ToolCandidateCard + PromptDrawer + SectionStream**
- [ ] **Step 4: 改 draft-editor.tsx 接入**
- [ ] **Step 5: typecheck + build + 现有测试守门**
      Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web build && pnpm --filter @bytedance-aigc/web test`
      Expected: 全绿。
- [ ] **Step 6: Commit**
  ```
  feat(web): FAST 模式弹窗 + 大纲面板 + SSE 接入 + 9 工具 BubbleMenu + Prompt 抽屉
  ```

---

## Task 11: README LLM 接入小节 + 静态五连 + 手测脚本

**Files:**

- Modify: `README.md`

**关键内容:**

README 加"## LLM 接入"小节,列三种典型 baseURL 填法(spec §4.1):

- OpenAI 官方
- 火山方舟 ARK
- DeepSeek
- 自建/中转网关一般规则

加一行说明:本地 `.env` 必须填 LLM_BASE_URL/API_KEY/MODEL,缺失 api 拒启动。

**Steps:**

- [ ] **Step 1: 改 README**
- [ ] **Step 2: prettier**
      Run: `pnpm format:check`
      Expected: 通过;失败则 `pnpm format` 再 add。
- [ ] **Step 3: 全仓静态五连**
  ```
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm format:check
  ```
  Expected: 全绿。
- [ ] **Step 4: 后端 e2e 全跑**
      Run: `pnpm --filter @bytedance-aigc/api test:e2e`
      Expected: 38 用例全绿。
- [ ] **Step 5: 手测脚本**(用户在浏览器跑;参考 spec §8.4)
  1. 填 .env 三项 LLM\_\*(任选一家)
  2. `pnpm db:up` + api dev + web dev
  3. 登录 demo 账号 → 新建草稿 → 点 FAST 模式按钮 → 输入选题"秋天的咖啡馆" → 看到 5 段大纲
  4. 改大纲第 2 段 heading → 点"开始生成正文" → devtools Network 看到 `/sections/stream` POST + chunked,无中段 PATCH
  5. 流末看到一次 PATCH;刷新页面正文仍在,version+N
  6. 选中一段 → BubbleMenu 弹 → 点"改写 → 通顺改写" → 候选浮卡 → 采用 → 选区被替换
  7. 齿轮按钮打开 Prompt 抽屉 → 复制一条 PLATFORM → 改 systemPrompt → 设为当前生效 → 再调工具看请求 query/body 带 promptId
  8. 切 LLM_BASE_URL 到另一家厂商 → 重启 api → 重跑流程仍通(D5 厂商解绑回归)
- [ ] **Step 6: Commit**
  ```
  docs(readme): Phase 2.2 LLM 接入与多厂商 baseURL 示例
  ```

> **不调 verification 子代理**(用户偏好已记录)。

---

## Self-Review

**1. Spec 覆盖**

- §1 三大目标:Task 5+6(FAST 主链路)、Task 7(9 工具)、Task 8(Prompt 自定义)→ ✅
- §2 锁定决策表 11 条:Task 1(LLM 客户端 + baseURL)、Task 6(SSE + fetch+ReadableStream + 流式 × autosave)、Task 5+6(FAST 节奏 POST+POST)、Task 7(9 工具 + DTO union narrow)、Task 7(同步 POST 返候选)、Task 8(Prompt 后端 CRUD + 默认 isStarter)、Task 10(BubbleMenu 3 组)、Task 9(useAutosave 流式 × autosave 三段控制)→ ✅
- §3.1 outline 不写库 + SSE POST + body:Task 5 + Task 6 → ✅
- §3.2 9 工具 + 三态 + promptId 透传:Task 7 + Task 10 → ✅
- §3.3 PromptsPrivateController + 4 端点 + GET /private:Task 8 → ✅
- §4.1 LLM\_\* env + 多厂商示例:Task 1 + Task 11 → ✅
- §4.2 LlmClient + adapter:Task 3 → ✅
- §4.3 路由表 + Candidate union + ToolInvokeInput union:Task 5/6/7 + Task 2 → ✅
- §4.4 PromptsPrivateController + 校验规则表:Task 8 → ✅
- §4.5 文件改动清单:Task 1-11 全覆盖 → ✅
- §4.6 SSE 实现要点 + 全局 guard 交互声明 + e2e 不 mock:Task 6 → ✅
- §5.1-5.4 前端组件 + hooks + 修改:Task 10 + Task 9 → ✅
- §6 数据流细节:Task 10(SectionStream + ToolCandidateCard 实现)→ ✅
- §7 文件清单:Task 1-11 全覆盖 → ✅(注意 schema 兜底校验由 D9 落到 Task 1 Step 2)
- §8 验收 18 e2e + 12+ 单测 + 五连 + 手测:Task 1-11 → ✅
- §9 风险与回滚:每个 Task 的 commit 粒度即回滚单元 → ✅
- §10 单 commit 偏好:本计划 11 commits(D5),实施后用户决定是否 squash → ✅(但与 spec 字面"1 commit"差异已在 D5 标注)

**2. Placeholder 扫描**:无 TBD/TODO/fill in/implement later;9 决策点都在 §0 表里钉死。

**3. 类型一致性**:`DraftToolType` / `Candidate` / `ToolInvokeInput` / `OutlineItem` 来自 `@bytedance-aigc/shared`(Task 2 落地),前后端共用,Task 5/6/7/10 都从这里 import 同一份。`AutosaveControl<T>` 在 Task 9 定义,Task 10 的 draft-editor.tsx 消费——一致。

**4. 顺序依赖**:

- Task 1 → Task 3(LlmClient 需要 config)
- Task 2 → Task 5/6/7/10(类型源)
- Task 3 → Task 5/6/7(service 注入 LlmClient)
- Task 4 → Task 5/6/7(assertAuthor 抽出后被复用)
- Task 8 → Task 7(tools.service 调 prompts.service.findDefault / findOneOwnedOrPlatform)
- Task 9 → Task 10(SectionStream 用新 setStreaming/flush)

写代码时严格按 1→2→3→4→5→6→7→8→9→10→11 走。Task 5 与 Task 6 实现独立,但 Task 6 内部 spike(@Sse + POST 兼容性)若失败,fallback 方案不影响 Task 5。

---

## 风险与回滚

- **任一 task 失败**:当前 task 没 commit,`git restore .` 回退;前面已 commit 的按 hash `git revert` 单独回。
- **Task 6 spike 失败(@Sse 不接 POST)**:fallback 到手动 `Response.write` SSE 帧,重排 Step 顺序但不影响其他 Task。
- **e2e 跑不动 SSE**:D4 的 `node:http` helper 跑不通时,fallback 用 `eventsource` npm 包(只在 test 用)+ 改单测覆盖率验证。
- **LLM 厂商在测试中真调用**:**所有单测必须 mock LlmClient**,e2e 也要 mock(用 `app.overrideProvider(LlmClient).useValue(...)` ),不能让 CI 真调 OpenAI 烧 key。
- **整体回滚**:`git reset --hard 3192e72`(Phase 2.2 plan 之前的 spec v2.2 commit;仅本机)。

---

## 后续 Milestones(不属本 Plan)

- 2.3:FINE 模式(人主导编辑器 + AI 工具栏更密集)
- 2.4:5 阶段审核链路 + DraftVersion 快照
- 2.5:4 维质量评分 + 加权榜单
