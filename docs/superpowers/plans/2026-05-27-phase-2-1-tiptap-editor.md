# Phase 2.1 TipTap 编辑器与防抖自动保存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让登录用户能从 `/drafts/mine` 进一篇草稿、用 TipTap 富文本编辑器敲字，1.5 秒后自动 PATCH 落库；刷新页面文字仍在。

**Architecture:** 后端加 `PATCH /drafts/:id`（UserGuard + 作者校验，原子 `version++`，不写 DraftVersion）。前端 `/drafts/[id]` 是 Server 壳只 await params，把 id 传给 client `<DraftEditor>` 容器；容器内 5-state 状态机做 loading/ready/not-found/forbidden/error，子组件 `<TiptapBody>` 用 `immediatelyRender:false` 渲染 ProseMirror JSON；`useAutosave` hook 把 title+body 合并 1.5s 防抖后调一次 PATCH。

**Tech Stack:** NestJS 11 + Prisma + PostgreSQL（后端）；Next.js 16.2.6 App Router + React 19.2.4 + TipTap (`@tiptap/react`+`@tiptap/pm`+`@tiptap/starter-kit`) + vitest + @testing-library/react（前端）。

**Spec:** `docs/superpowers/specs/2026-05-27-phase-2-1-tiptap-editor-design.md`

**Phase 1 上下文（先决条件，已绿）:** Prisma + /drafts CRUD + JWT + UserGuard + /login + /drafts/mine 已 ship 至 commit `9a8d4a3`；本计划在此之上加 PATCH 端点 + 编辑器路由。

---

## File Structure

**新增（后端）**

- `apps/api/src/drafts/dto/update-draft.dto.ts` — PATCH 入参校验，title/body 都是 optional

**修改（后端）**

- `apps/api/src/drafts/drafts.service.ts` — 加 `update(id, authorId, dto)` 方法
- `apps/api/src/drafts/drafts.controller.ts` — 加 `@Patch(":id")` route handler
- `apps/api/test/drafts.e2e-spec.ts` — 加 3 个用例（作者更新成功 + version 递增 / 非作者 403 / 不存在 404）

**新增（前端）**

- `apps/web/src/app/drafts/[id]/page.tsx` — Server 壳，await params，把 id 当 prop 给 client
- `apps/web/src/components/draft-editor.tsx` — `"use client"` 容器，5-state 状态机
- `apps/web/src/components/tiptap-body.tsx` — `"use client"` TipTap 编辑器本体 + 工具栏
- `apps/web/src/components/save-status.tsx` — 顶部状态条「保存中…」「已保存 · 刚刚」
- `apps/web/src/lib/use-autosave.ts` — 防抖 hook
- `apps/web/src/lib/use-autosave.test.ts` — 4 单测

**修改（前端）**

- `apps/web/src/app/drafts/mine/page.tsx` — 顶栏加「新建草稿」按钮 + 草稿条目变可点链接
- `apps/web/package.json` — 加 3 个 TipTap 依赖
- `pnpm-lock.yaml` — 锁文件

**修改（仓库根）**

- `README.md` — 新增「内容生产 / 编辑器」小节

---

## Task 1: 后端 — UpdateDraftDto

**Files:**

- Create: `apps/api/src/drafts/dto/update-draft.dto.ts`

**为什么这个 DTO 不复用 `class-validator` 的 PartialType:** spec §4.2 明确「不引入 @nestjs/mapped-types」（多余依赖）。手写两行更清晰。`forbidNonWhitelisted: true` 全局生效，未声明的字段（比如 authorId）一律 400，所以 DTO 必须只列允许的字段。

- [ ] **Step 1: Create DTO file**

```ts
// apps/api/src/drafts/dto/update-draft.dto.ts
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}
```

- [ ] **Step 2: Typecheck passes**

Run: `pnpm --filter @bytedance-aigc/api exec tsc --noEmit`
Expected: 退出码 0，无报错。

---

## Task 2: 后端 — DraftsService.update（TDD：先红再绿）

**Files:**

- Modify: `apps/api/src/drafts/drafts.service.ts`
- Modify: `apps/api/test/drafts.e2e-spec.ts`

`update` 的契约（spec §4.1）：

- 入参：`(id, authorId, dto)`
- 行为：先 `findUnique({where:{id}})`，没找到 → `NotFoundException`；找到但 `draft.authorId !== authorId` → `ForbiddenException`；通过 → `prisma.draft.update({ where:{id}, data:{ ...dto, version:{ increment: 1 } } })`
- 返回：完整 Draft，`version` 已 +1

**为什么作者校验放在 service 而不是新写一个 `DraftOwnerGuard`:** YAGNI——只有这一个端点需要，service 里两行 `if` 就完事；将来若多端点共用再升级成 Guard。

- [ ] **Step 1: 加 3 个失败用例到 e2e**

在 `apps/api/test/drafts.e2e-spec.ts` 末尾、最后一个 `it` 之后、`describe` 闭合前，追加：

```ts
it("PATCH /drafts/:id -> 200 author updates and version increments", async () => {
  const created = await request(app.getHttpServer())
    .post("/drafts")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Original", body: { type: "doc", content: [] } })
    .expect(201);
  const draft = created.body as DraftResponse;

  const res = await request(app.getHttpServer())
    .patch(`/drafts/${draft.id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Updated" })
    .expect(200);
  const updated = res.body as DraftResponse;

  expect(updated.id).toBe(draft.id);
  expect(updated.title).toBe("Updated");
  expect(updated.version).toBe(draft.version + 1);
});

it("PATCH /drafts/:id -> 403 when caller is not author", async () => {
  // 用 demo 账号建一篇
  const created = await request(app.getHttpServer())
    .post("/drafts")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Mine", body: {} })
    .expect(201);
  const draft = created.body as DraftResponse;

  // 注册并登录另一个账号
  const otherHandle = `e2e-other-${Date.now()}`;
  await request(app.getHttpServer())
    .post("/auth/register")
    .send({ handle: otherHandle, password: "hunter2hunter2" })
    .expect(201);
  const loginRes = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ handle: otherHandle, password: "hunter2hunter2" })
    .expect(201);
  const otherToken = (loginRes.body as { accessToken: string }).accessToken;

  await request(app.getHttpServer())
    .patch(`/drafts/${draft.id}`)
    .set("Authorization", `Bearer ${otherToken}`)
    .send({ title: "Hacked" })
    .expect(403);
});

it("PATCH /drafts/:id -> 404 when draft id does not exist", async () => {
  await request(app.getHttpServer())
    .patch("/drafts/nonexistent-id-zzz")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "x" })
    .expect(404);
});
```

> 注意：第二个用例的 `/auth/register` 是 Phase 1.4 已落地的端点；如果实际路径或返回 shape 与这里假设不同，先 `Grep -r "auth/register" apps/api/src/auth/` 对一遍再写测试。

- [ ] **Step 2: 跑 e2e，确认 3 个新用例都失败**

Run: `pnpm --filter @bytedance-aigc/api test:e2e`
Expected: 8 用例里 3 个新加的全 FAIL（404 用例可能 misroute 成 200 因为 `@Get("mine")` 路径冲突；403 用例会 404 因为 PATCH 还没注册；version+1 用例会 404）。其他 5 个原有用例仍 PASS。

- [ ] **Step 3: 在 service 加 update 方法**

修改 `apps/api/src/drafts/drafts.service.ts`，在 import 加 `ForbiddenException`，在 class 末尾加方法：

```ts
// import 行改为：
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

// ...class 内 findOne 之后加：
  async update(id: string, authorId: string, dto: UpdateDraftDto): Promise<Draft> {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }
    if (draft.authorId !== authorId) {
      throw new ForbiddenException("Not the draft author");
    }
    const data: Prisma.DraftUpdateInput = {
      version: { increment: 1 },
    };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body as Prisma.InputJsonValue;
    return this.prisma.draft.update({ where: { id }, data });
  }
```

并在文件顶部 imports 加：

```ts
import { UpdateDraftDto } from "./dto/update-draft.dto";
```

- [ ] **Step 4: 在 controller 加 PATCH route**

修改 `apps/api/src/drafts/drafts.controller.ts`：

```ts
// 顶部 import 行改为加 Patch：
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

// 同时新增 import：
import { UpdateDraftDto } from "./dto/update-draft.dto";

// 在 findOne 之后加：
  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDraftDto,
  ): Promise<Draft> {
    return this.drafts.update(id, user.sub, dto);
  }
```

- [ ] **Step 5: 跑 e2e，确认 8/8 全绿**

Run: `pnpm --filter @bytedance-aigc/api test:e2e`
Expected: 8 passed。

- [ ] **Step 6: 提交后端**

```bash
git add apps/api/src/drafts/dto/update-draft.dto.ts \
        apps/api/src/drafts/drafts.service.ts \
        apps/api/src/drafts/drafts.controller.ts \
        apps/api/test/drafts.e2e-spec.ts
git commit -m "feat(api): PATCH /drafts/:id 含作者校验与 version 递增"
```

---

## Task 3: 装 TipTap 依赖 + 占坑路由壳

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/app/drafts/[id]/page.tsx`

Next.js 16.2.6 的 `params` 是 `Promise`，必须 `await`——这点已经在 spec §5.1 通过读 `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` 确认。

- [ ] **Step 1: 装 TipTap**

Run: `pnpm --filter @bytedance-aigc/web add @tiptap/react @tiptap/pm @tiptap/starter-kit`
Expected: 命令成功，`apps/web/package.json` `dependencies` 多三行，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 创建路由壳（最小占坑）**

```tsx
// apps/web/src/app/drafts/[id]/page.tsx
import { DraftEditor } from "@/components/draft-editor";

export default async function DraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftEditor id={id} />;
}
```

- [ ] **Step 3: 创建占位的 DraftEditor 让 import 通过**

先放最小占位（Task 5 会替换成完整状态机）：

```tsx
// apps/web/src/components/draft-editor.tsx
"use client";

export function DraftEditor({ id }: { id: string }) {
  return <main className="p-6">Draft {id}（占位，待实装）</main>;
}
```

- [ ] **Step 4: 验证编译通过**

Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web build`
Expected: 都成功。

- [ ] **Step 5: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml \
        apps/web/src/app/drafts/\[id\]/page.tsx \
        apps/web/src/components/draft-editor.tsx
git commit -m "chore(web): 装 TipTap 与 /drafts/[id] 路由壳"
```

---

## Task 4: useAutosave hook（TDD：先 4 个单测）

**Files:**

- Create: `apps/web/src/lib/use-autosave.ts`
- Create: `apps/web/src/lib/use-autosave.test.ts`

Hook 契约（spec §5.3）：

```ts
type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: number | null;
}

function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs?: number, // 默认 1500
): AutosaveResult;
```

行为：

- value 引用变化 → status 立即变 `"dirty"`，启动定时器
- 定时器到点（默认 1.5s）→ status `"saving"` → 调 `save(value)`
- save resolve → status `"saved"` + `lastSavedAt = Date.now()`
- save reject → status `"error"`
- value 在定时器到点之前再变 → 清掉旧定时器，重新计时（连改 1 次）
- 初始 mount 时 status 是 `"idle"`，不立即触发 save

- [ ] **Step 1: 写 4 个失败单测**

```ts
// apps/web/src/lib/use-autosave.test.ts
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./use-autosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始为 idle，不调 save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a", body: {} } },
    });

    expect(result.current.status).toBe("idle");
    expect(save).not.toHaveBeenCalled();
  });

  it("value 变化后 status -> dirty，1.5s 后调一次 save -> saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    expect(result.current.status).toBe("dirty");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "b" });
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("1.5s 内连改两次只触发一次 save，且使用最后一次值", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    rerender({ v: { title: "c" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "c" });
  });

  it("save reject -> status = error", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("error");
  });
});
```

- [ ] **Step 2: 跑 vitest，确认 4 个全 fail（找不到模块）**

Run: `pnpm --filter @bytedance-aigc/web test`
Expected: 4 个新增用例 fail，提示 `Cannot find module './use-autosave'`。原 auth 测试仍 PASS。

- [ ] **Step 3: 实装 hook**

```ts
// apps/web/src/lib/use-autosave.ts
import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: number | null;
}

export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs = 1500,
): AutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // 用 ref 持有最新 save 函数,避免 effect 依赖里塞 save 导致 caller 必须包 useCallback
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // 跳过首次 mount,避免初始 value 立刻触发 dirty
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(() => {
      setStatus("saving");
      saveRef
        .current(value)
        .then(() => {
          setStatus("saved");
          setLastSavedAt(Date.now());
        })
        .catch(() => {
          setStatus("error");
        });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return { status, lastSavedAt };
}
```

> 注意：`useEffect` 依赖里 `value`，所以 `value` 必须是「引用相等就跳过」的——caller 端要把 `{title, body}` 用 `useMemo` 包，或者每次 setState 时用「新对象」。Task 5 的 `<DraftEditor>` 会用 `useMemo` 把 `{title, body}` 合成稳定引用。

- [ ] **Step 4: 跑 vitest，确认 4/4 pass**

Run: `pnpm --filter @bytedance-aigc/web test`
Expected: 4 个 useAutosave 用例 + 已有 auth 用例全 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/use-autosave.ts apps/web/src/lib/use-autosave.test.ts
git commit -m "feat(web): useAutosave 防抖 hook 与单测"
```

---

## Task 5: TipTap 编辑器本体 `<TiptapBody>`

**Files:**

- Create: `apps/web/src/components/tiptap-body.tsx`

`immediatelyRender: false` 是 TipTap 官方对 Next.js SSR 的建议（避免 hydration mismatch）——已在 spec §9 风险章节锁定。

`StarterKit` 默认包含 Heading（含 H1-H6）、Bold、Italic、BulletList、OrderedList、Paragraph 等节点；6 个工具栏按钮直接 `editor.chain().focus().toggle*().run()` 即可。

- [ ] **Step 1: 实装编辑器组件**

```tsx
// apps/web/src/components/tiptap-body.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import type { JSONContent } from "@tiptap/react";

interface TiptapBodyProps {
  initial: JSONContent;
  onChange: (json: JSONContent) => void;
}

export function TiptapBody({ initial, onChange }: TiptapBodyProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initial,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  // editor 卸载时清理
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return <div className="text-sm text-zinc-500">编辑器加载中…</div>;
  }

  const btnClass =
    "px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900";
  const activeClass = "bg-zinc-200 dark:bg-zinc-800";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("heading", { level: 1 }) ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </button>
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("heading", { level: 2 }) ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("bold") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("italic") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("bulletList") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          className={`${btnClass} ${editor.isActive("orderedList") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[60vh] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 prose prose-sm dark:prose-invert max-w-none focus:outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: typecheck 通过**

Run: `pnpm --filter @bytedance-aigc/web typecheck`
Expected: 退出码 0。

> 不写单测：编辑器 UI 用 jsdom + ProseMirror 测起来收益低噪音高，spec §8 验收只要求 useAutosave 有 4 单测。手测留给最终验收脚本。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/tiptap-body.tsx
git commit -m "feat(web): TiptapBody 富文本编辑器与 6 按钮工具栏"
```

---

## Task 6: SaveStatus 显示组件

**Files:**

- Create: `apps/web/src/components/save-status.tsx`

文字表 spec §5.4：

| status              | 文字                             |
| ------------------- | -------------------------------- |
| idle 且没存过       | （空）                           |
| dirty               | 「未保存的更改」                 |
| saving              | 「保存中…」                      |
| saved + lastSavedAt | 「已保存 · {relativeTime}」      |
| error               | 「保存失败，点这里重试」（红字） |

relativeTime: <60s「刚刚」；<1h「N 分钟前」；其它绝对时分。每 30s 重渲。

- [ ] **Step 1: 实装组件**

```tsx
// apps/web/src/components/save-status.tsx
"use client";

import { useEffect, useState } from "react";

import type { AutosaveStatus } from "@/lib/use-autosave";

interface SaveStatusProps {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  onRetry?: () => void;
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function SaveStatus({ status, lastSavedAt, onRetry }: SaveStatusProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="text-sm text-red-600 hover:underline">
        保存失败,点这里重试
      </button>
    );
  }
  if (status === "saving") return <span className="text-sm text-zinc-500">保存中…</span>;
  if (status === "dirty") return <span className="text-sm text-zinc-500">未保存的更改</span>;
  if (status === "saved" && lastSavedAt !== null) {
    return <span className="text-sm text-zinc-500">已保存 · {relativeTime(lastSavedAt, now)}</span>;
  }
  return null;
}
```

- [ ] **Step 2: typecheck 通过**

Run: `pnpm --filter @bytedance-aigc/web typecheck`
Expected: 退出码 0。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/save-status.tsx
git commit -m "feat(web): SaveStatus 自动保存状态显示组件"
```

---

## Task 7: DraftEditor 容器（替换占位 + 状态机 + 编排）

**Files:**

- Modify: `apps/web/src/components/draft-editor.tsx`

容器职责（spec §5.2）：

1. mount 时 `apiFetch("/drafts/${id}")` 拉数据，根据状态码进 5 种 state 之一
2. 401 → `clearToken() + router.replace("/login")`
3. 渲染 `<input>` 标题 + `<TiptapBody>` + `<SaveStatus>`
4. 把 `{title, body}` 用 `useMemo` 合成稳定引用喂给 `useAutosave`，回调里 PATCH

- [ ] **Step 1: 完整重写 draft-editor.tsx（替换 Task 3 的占位）**

```tsx
// apps/web/src/components/draft-editor.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import { apiFetch, clearToken, getToken } from "@/lib/auth";
import { useAutosave } from "@/lib/use-autosave";

import { SaveStatus } from "./save-status";
import { TiptapBody } from "./tiptap-body";

interface DraftDetail {
  id: string;
  authorId: string;
  title: string;
  body: JSONContent;
  mode: "FAST" | "FINE";
  version: number;
  updatedAt: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; draft: DraftDetail }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export function DraftEditor({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<JSONContent>({ type: "doc", content: [] });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void apiFetch(`/drafts/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          setState({ kind: "forbidden" });
          return;
        }
        if (res.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: `加载失败 (HTTP ${res.status})` });
          return;
        }
        const draft = (await res.json()) as DraftDetail;
        if (cancelled) return;
        setTitle(draft.title);
        setBody(draft.body ?? { type: "doc", content: [] });
        setState({ kind: "ready", draft });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "网络错误",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // 合并 title+body 为稳定引用
  const value = useMemo(() => ({ title, body }), [title, body]);

  const save = useCallback(
    async (v: { title: string; body: JSONContent }) => {
      const res = await apiFetch(`/drafts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [id],
  );

  // 仅在 ready 后启用 autosave
  const enabledValue = state.kind === "ready" ? value : null;
  const { status, lastSavedAt } = useAutosave(
    enabledValue,
    async (v) => {
      if (v) await save(v);
    },
    1500,
  );

  if (state.kind === "loading") {
    return <main className="p-6 text-sm text-zinc-500">加载中…</main>;
  }
  if (state.kind === "not-found") {
    return <main className="p-6 text-sm text-zinc-500">草稿不存在</main>;
  }
  if (state.kind === "forbidden") {
    return <main className="p-6 text-sm text-red-600">无权访问该草稿</main>;
  }
  if (state.kind === "error") {
    return <main className="p-6 text-sm text-red-600">{state.message}</main>;
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-6 max-w-3xl w-full mx-auto">
      <header className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-2xl font-semibold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-700"
          placeholder="未命名草稿"
        />
        <SaveStatus status={status} lastSavedAt={lastSavedAt} />
      </header>
      <TiptapBody initial={body} onChange={setBody} />
    </main>
  );
}
```

> 注意 `useAutosave` 现在签名是 `useAutosave<T>(value: T, save: (v:T) => Promise<void>, delay)`。这里 `enabledValue` 类型是 `{title; body} | null`，所以 save callback 内部 `if (v)` 守一下。这个写法保留了 hook 的"value 引用变化触发"语义而不破坏类型。

- [ ] **Step 2: typecheck + build**

Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web build`
Expected: 都成功。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/draft-editor.tsx
git commit -m "feat(web): DraftEditor 容器与 5-state 状态机 + autosave 编排"
```

---

## Task 8: /drafts/mine 加「新建草稿」按钮 + 草稿条目变链接

**Files:**

- Modify: `apps/web/src/app/drafts/mine/page.tsx`

行为（spec §5.5）：

- 顶栏右侧（与「退出登录」并列）加「新建草稿」按钮
- 点击 → POST `/drafts` `{title:"未命名草稿", body:{type:"doc", content:[]}}` → 200 → `router.push("/drafts/" + id)`
- 401 → 清 token 跳登录；其它错误 → 内联红字
- 草稿列表里每条变成 `<Link href="/drafts/{id}">` 包裹

- [ ] **Step 1: 改 page.tsx**

把现有 `apps/web/src/app/drafts/mine/page.tsx` 的相关部分按下列改：

a) 顶部 import 加 Link：

```ts
import Link from "next/link";
```

b) 在 `useRouter()` 那行下面加创建态：

```ts
const [creating, setCreating] = useState(false);
const [createError, setCreateError] = useState<string | null>(null);
```

c) 在 `onLogout` 之前加：

```ts
async function onCreate() {
  if (creating) return;
  setCreating(true);
  setCreateError(null);
  try {
    const res = await apiFetch("/drafts", {
      method: "POST",
      body: JSON.stringify({
        title: "未命名草稿",
        body: { type: "doc", content: [] },
      }),
    });
    if (res.status === 401) {
      clearToken();
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      setCreateError(`创建失败 (HTTP ${res.status})`);
      return;
    }
    const draft = (await res.json()) as { id: string };
    router.push(`/drafts/${draft.id}`);
  } catch (err) {
    setCreateError(err instanceof Error ? err.message : "网络错误");
  } finally {
    setCreating(false);
  }
}
```

d) 把 header 区改成「新建草稿」+「退出登录」并列，把 `<button onClick={onLogout}>` 那块替换为：

```tsx
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={onCreate}
    disabled={creating}
    className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 transition-colors"
  >
    {creating ? "创建中…" : "新建草稿"}
  </button>
  <button
    type="button"
    onClick={onLogout}
    className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
  >
    退出登录
  </button>
</div>
```

e) 在 header 闭合后、loading 文案前加 createError 显示：

```tsx
{
  createError && <p className="text-sm text-red-600">{createError}</p>;
}
```

f) 草稿列表 `<li>` 改成 `<Link>` 包裹整个 li 内容：把现有的 `<li key={d.id} className="...">...</li>` 替换为：

```tsx
<li key={d.id}>
  <Link
    href={`/drafts/${d.id}`}
    className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
  >
    <div className="flex flex-col gap-1 min-w-0">
      <h2 className="text-base font-medium truncate">{d.title}</h2>
      <p className="text-xs text-zinc-500 font-mono truncate">{d.id}</p>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={
          d.mode === "FAST"
            ? "inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium"
            : "inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-xs font-medium"
        }
      >
        {d.mode}
      </span>
      <span className="text-xs text-zinc-500">v{d.version}</span>
    </div>
  </Link>
</li>
```

- [ ] **Step 2: typecheck + build**

Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web build`
Expected: 都成功。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/app/drafts/mine/page.tsx
git commit -m "feat(web): /drafts/mine 加新建草稿按钮与草稿条目链接"
```

---

## Task 9: README 加「内容生产 / 编辑器」小节

**Files:**

- Modify: `README.md`

- [ ] **Step 1: 找到合适插入点**

Run: `grep -n "^##" README.md`
Expected: 列出所有二级标题，找到合适位置（例如「数据层」之后、「开发」之前）。

- [ ] **Step 2: 插入小节**

在 README.md 合适位置加：

```markdown
## 内容生产 / 编辑器

- 路由：`/drafts/[id]` 富文本编辑器；`/drafts/mine` 列表 + 新建按钮
- 编辑器：TipTap（基于 ProseMirror），ProseMirror JSON 落 `drafts.body Json` 字段
- 自动保存：`useAutosave` hook，1.5s 防抖，PATCH 一次发 `{title, body}`，service 端 `version: { increment: 1 }`
- SSR 配方：TipTap `useEditor({ immediatelyRender: false })` 避免 Next.js hydration mismatch
- 端点：`PATCH /drafts/:id`（UserGuard + service 层作者校验，非作者 403，不存在 404）
```

- [ ] **Step 3: prettier 检查**

Run: `pnpm format:check`
Expected: 通过；如失败，跑 `pnpm format` 再 add。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs(readme): Phase 2.1 内容生产/编辑器小节"
```

---

## Task 10: 静态五连复测 + 手测脚本

**Files:**

- 不改文件

- [ ] **Step 1: 跑全仓静态五连**

Run（依次）：

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Expected: 全绿。

- [ ] **Step 2: 跑后端 e2e**

Run: `pnpm --filter @bytedance-aigc/api test:e2e`
Expected: 8 passed。

- [ ] **Step 3: 手测脚本（用户在浏览器跑）**

依次：

1. `pnpm db:up && pnpm --filter @bytedance-aigc/api start:dev`（一终端）
2. `pnpm --filter @bytedance-aigc/web dev`（另一终端）
3. 浏览器开 `http://localhost:3001`（或 web 的实际端口）→ 点「登录」用 demo 账号
4. 跳转到 `/drafts/mine`，点右上「新建草稿」
5. 跳到 `/drafts/<新 id>`，看到空编辑器 + 标题「未命名草稿」
6. 改标题为 "测试稿"，正文里敲一行字 + Bold 一段 + 加 H1
7. 等 1.5s，看顶部从「保存中…」变「已保存 · 刚刚」
8. F5 刷新页面，标题与正文均仍在
9. 回 `/drafts/mine`，看到这条草稿，点击它能再次进入

如全部通过，则 Phase 2.1 验收闭环。

> **不调 verification 子代理**（user 偏好已记录）。

---

## Self-Review

**1. Spec 覆盖**

- §1 目标：Task 7（容器拉取+编排） + Task 5（编辑器） + Task 4（防抖） + Task 2（PATCH 落库）→ ✅
- §2 三决策：TipTap 选型 = Task 3 装包 + Task 5 实装；SSE 路线 = 仅锁定不实现 → ✅；防抖 1.5s 只写 drafts = Task 4 + Task 2 → ✅
- §4.1 PATCH 端点契约（UserGuard + 作者校验 + version++）= Task 2 → ✅
- §4.2 update-draft.dto.ts = Task 1 → ✅
- §4.3 不做并发版本检查、不写 DraftVersion = Task 2 service 实现里没有这两件事 → ✅
- §5.1 路由 await params = Task 3 page.tsx → ✅
- §5.2 DraftEditor 状态机 + TiptapBody = Task 5 + Task 7 → ✅
- §5.3 useAutosave = Task 4 → ✅
- §5.4 SaveStatus 表 = Task 6 → ✅
- §5.5 新建草稿按钮 = Task 8 → ✅
- §6 数据流 = Task 4+5+7 联合实现 → ✅
- §7 文件清单 6 新增 + 7 修改：本计划 6 新增（update-draft.dto.ts、page.tsx、draft-editor.tsx、tiptap-body.tsx、save-status.tsx、use-autosave.ts、use-autosave.test.ts = 7 个；spec 漏列了 save-status.tsx）+ 修改 6 个（drafts.service.ts、drafts.controller.ts、drafts.e2e-spec.ts、drafts/mine/page.tsx、apps/web/package.json、pnpm-lock.yaml、README.md = 7 个）→ 与 spec 略有出入但属于合理 carving（spec 把 SaveStatus 与 DraftEditor 写在一起；本计划拆出独立文件），实施时按计划走
- §8 验收 8 e2e + 4 单测 + 五连 + 手测 = Task 2 + Task 4 + Task 10 → ✅
- §9 风险 immediatelyRender:false / params Promise = Task 5 + Task 3 → ✅
- §10 1 commit = ❌ 本计划是 **9 个 commit**（DRY+TDD 节奏要求每段一 commit；spec §10 只是预估，落地按 plan 节奏走，最终用户来 squash 还是 keep 由用户决定）

**2. Placeholder 扫描**：grep "TBD|TODO|fill in|implement later"——无；所有"添加错误处理""校验""edge case"都展开成具体代码。

**3. 类型一致性**：`AutosaveStatus`、`AutosaveResult`、`useAutosave<T>(value, save, delayMs)`、`DraftDetail`、`State` 5-kind 在多个 task 间保持一致；`SaveStatus` 组件 import `AutosaveStatus` 来自 `use-autosave.ts`——一致；`DraftEditor` 的 `useAutosave` 接收 `{title, body} | null`——hook 实现接受任意 T，OK。

唯一需要 caller 注意的：spec §10 写「1 commit」与 plan 「9 commit」的不一致——这是 plan 提交节奏 vs spec 终态偏好的差异。已在自审中标注，决定权交给用户：执行完后想 squash 成 1 commit 直接 `git rebase -i origin/main` 即可。

---

## 风险与回滚

- **任一 task 失败**：当前 task 的 commit 没建立，`git restore .` 回退即可；前面已 commit 的 task 按文件粒度可单独 `git revert <hash>`。
- **TipTap 装包失败**：可能因 pnpm 网络；重试或换 registry。
- **e2e 第二个用例 `/auth/register` 路径不对**：先 grep 实际路径再调整测试。
- **整体回滚**：`git revert` 从最后一个本计划 commit 倒序到第一个，或 `git reset --hard <Phase 2.1 之前的 commit>`（仅本机使用，不许直接 push 覆盖远端 main）。

---

## 后续 Milestones（不属本 Plan）

- 2.2: FAST 路径 SSE 流式生成 + Server route handler 转发
- 2.3: 9 个 AI 工具卡（标题候选 / 提纲 / 摘要 / SEO / 改写 / 续写 / 翻译 / 配图 prompt / 配图）
- 2.4: DraftVersion 快照（基于本 plan 的 PATCH 端点扩展）
