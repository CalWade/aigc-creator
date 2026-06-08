# Phase 2.14 — 离线兜底自动保存与冲突解决 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/drafts/[id]` 接入 IndexedDB 本地兜底 + 30s 周期上传 + 版本号乐观锁冲突检测(冲突落 DraftVersion 表新行 OFFLINE_CONFLICT)+ BroadcastChannel 多 tab 只读提示,落地 PRD §3.3.1/§3.3.2 全部要求。

**Architecture:** 前端 `useAutosave` 改造为「本地 1s 防抖 → IndexedDB / 云端 30s 周期 PATCH」双轨;`navigator.onLine` 监听切换状态;PATCH 带 `baseVersion`,后端不匹配返 409 + payload(内嵌云端 body 免二次 GET);前端 fork 流:① POST `/drafts/:id/versions` `{kind:OFFLINE_CONFLICT, snapshot}` 落冲突备份 → ② 用云端覆盖编辑器 → ③ 重置 baseVersion;BroadcastChannel 多 tab 命中时双向都进只读。

**Tech Stack:** idb-keyval(前端 IndexedDB)、Prisma migration(枚举 add value)、NestJS 409 + payload、BroadcastChannel API、vitest fake timers、Playwright `setOffline`。

---

## 文件结构

### 后端

- 改:`apps/api/prisma/schema.prisma`(VersionKind 加 OFFLINE_CONFLICT)
- 新迁移:`apps/api/prisma/migrations/<ts>_add_offline_conflict_kind/migration.sql`
- 改:`apps/api/src/drafts/dto/update-draft.dto.ts`(加 `baseVersion?: number`)
- 改:`apps/api/src/drafts/dto/create-version.dto.ts`(加 `kind?` + `snapshot?`)
- 改:`apps/api/src/drafts/drafts.service.ts`(`update` 409 路径;`createVersion` 接 kind/snapshot)
- 改:`apps/api/src/drafts/drafts.controller.ts`(透传 kind)
- 新单测:`apps/api/src/drafts/drafts.service.version-conflict.spec.ts`
- 改:`apps/api/test/drafts.e2e-spec.ts`(+3 用例)

### 共享

- 改:`packages/shared/src/errors.ts`(加 `VERSION_CONFLICT` 常量)

### 前端

- 新:`apps/web/src/lib/idb-draft-cache.ts`
- 改:`apps/web/src/lib/use-autosave.ts`(30s 周期 + onLine + IDB + 409 fork)
- 新:`apps/web/src/lib/use-draft-presence.ts`(BroadcastChannel)
- 改:`apps/web/src/components/save-status.tsx`(三态 + 离线/冲突态)
- 新:`apps/web/src/components/offline-banner.tsx`
- 新:`apps/web/src/components/conflict-banner.tsx`
- 新:`apps/web/src/components/readonly-banner.tsx`
- 改:`apps/web/src/components/draft-editor.tsx`(串 banner + presence + 启动复活)
- 改:`apps/web/src/components/version-history-modal.tsx`(OFFLINE_CONFLICT 角标)
- 新单测:5 个 vitest spec
- 新 e2e:`apps/web/e2e/offline-autosave.spec.ts`

### 文档

- README 加 Phase 2.14 章节
- spec/plan 归档到 shipped/

---

## Task 1:DraftVersion enum 加 OFFLINE_CONFLICT + 迁移

**Files:**

- Modify: `apps/api/prisma/schema.prisma:139-143`(VersionKind enum)
- Create: `apps/api/prisma/migrations/<auto-ts>_add_offline_conflict_kind/migration.sql`
- Modify: `packages/shared/src/errors.ts`(加 `VERSION_CONFLICT`)

- [ ] **Step 1: 改 schema**

```prisma
enum VersionKind {
  AUTO
  NAMED
  PUBLISHED
  OFFLINE_CONFLICT
}
```

- [ ] **Step 2: 生成迁移**

```bash
cd apps/api && pnpm exec prisma migrate dev --name add_offline_conflict_kind
```

预期:生成 `migration.sql` 内容仅:

```sql
ALTER TYPE "VersionKind" ADD VALUE 'OFFLINE_CONFLICT';
```

如果 prisma 在事务里加 enum 报错,把 sql 改为单语句 `ALTER TYPE ... ADD VALUE ...`,不放事务。

- [ ] **Step 3: 加错误码常量**

`packages/shared/src/errors.ts` 末尾追加:

```ts
export const VERSION_CONFLICT = "VERSION_CONFLICT";
```

如果文件用 const enum / object,跟现有风格一致即可(读现有内容再决定写法)。

- [ ] **Step 4: 验证**

```bash
pnpm prisma:generate
pnpm --filter @bytedance-aigc/api typecheck
pnpm --filter @bytedance-aigc/shared typecheck
```

预期:typecheck PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/prisma packages/shared/src/errors.ts
git commit -m "feat(api): Phase 2.14 DraftVersion 加 OFFLINE_CONFLICT enum + VERSION_CONFLICT 错误码"
```

---

## Task 2:DTO 扩展(baseVersion + version kind/snapshot)

**Files:**

- Modify: `apps/api/src/drafts/dto/update-draft.dto.ts`
- Modify: `apps/api/src/drafts/dto/create-version.dto.ts`(若不存在则 Create)

- [ ] **Step 1: 读现有 DTO**

```bash
ls apps/api/src/drafts/dto/
```

确认两个 DTO 文件名;若 `create-version.dto.ts` 不存在,看 controller 当前怎么校验 versions POST 的请求体。

- [ ] **Step 2: 改 update-draft.dto.ts**

加可选字段:

```ts
@IsOptional()
@IsInt()
@Min(1)
baseVersion?: number;
```

- [ ] **Step 3: 改 create-version.dto.ts**

```ts
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export enum CreateVersionKind {
  NAMED = "NAMED",
  OFFLINE_CONFLICT = "OFFLINE_CONFLICT",
}

export class CreateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsEnum(CreateVersionKind)
  kind?: CreateVersionKind;

  // OFFLINE_CONFLICT 时必填,NAMED 时必须不传(service 层 narrow)
  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
```

- [ ] **Step 4: 验证**

```bash
pnpm --filter @bytedance-aigc/api typecheck
```

PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/drafts/dto/
git commit -m "feat(api): Phase 2.14 PATCH 加 baseVersion / 版本端点加 kind+snapshot"
```

---

## Task 3:DraftsService.update 409 路径 + createVersion 接 kind

**Files:**

- Modify: `apps/api/src/drafts/drafts.service.ts`
- Test: `apps/api/src/drafts/drafts.service.version-conflict.spec.ts`(新)

- [ ] **Step 1: 写失败测试**

新建 `drafts.service.version-conflict.spec.ts`:

```ts
import { ConflictException, BadRequestException } from "@nestjs/common";
import { DraftsService } from "./drafts.service";

function makePrisma(currentVersion: number, currentBody: object, currentTitle: string) {
  return {
    draft: {
      findUnique: jest.fn().mockResolvedValue({
        id: "d1",
        authorId: "u1",
        version: currentVersion,
        title: currentTitle,
        body: currentBody,
        updatedAt: new Date("2026-06-08T10:00:00Z"),
      }),
      update: jest.fn().mockResolvedValue({ id: "d1", version: currentVersion + 1 }),
    },
    draftVersion: {
      create: jest.fn().mockResolvedValue({ id: "v1" }),
    },
  };
}

describe("DraftsService.update with baseVersion", () => {
  it("baseVersion === currentVersion → 正常 update,version+1", async () => {
    const prisma = makePrisma(3, { type: "doc" }, "T");
    const svc = new DraftsService(prisma as any);
    await svc.update("d1", "u1", { title: "T2", baseVersion: 3 });
    expect(prisma.draft.update).toHaveBeenCalled();
  });

  it("baseVersion !== currentVersion → 409 + payload", async () => {
    const prisma = makePrisma(5, { type: "doc", c: [{ t: "云端" }] }, "云端标题");
    const svc = new DraftsService(prisma as any);
    await expect(svc.update("d1", "u1", { title: "client", baseVersion: 3 })).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          message: "VERSION_CONFLICT",
          payload: expect.objectContaining({
            currentVersion: 5,
            title: "云端标题",
            body: { type: "doc", c: [{ t: "云端" }] },
          }),
        }),
      },
    );
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  it("baseVersion 不传 → 旧路径,version+1 不校验", async () => {
    const prisma = makePrisma(7, {}, "");
    const svc = new DraftsService(prisma as any);
    await svc.update("d1", "u1", { title: "T" });
    expect(prisma.draft.update).toHaveBeenCalled();
  });
});

describe("DraftsService.createVersion with kind/snapshot", () => {
  it("kind=OFFLINE_CONFLICT 必带 snapshot,否则 400", async () => {
    const prisma = makePrisma(1, { type: "doc" }, "T");
    const svc = new DraftsService(prisma as any);
    await expect(
      svc.createVersion("d1", "u1", { kind: "OFFLINE_CONFLICT" } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("kind=NAMED 时传 snapshot → 400", async () => {
    const prisma = makePrisma(1, { type: "doc" }, "T");
    const svc = new DraftsService(prisma as any);
    await expect(
      svc.createVersion("d1", "u1", { kind: "NAMED", snapshot: { type: "doc" } } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("kind=OFFLINE_CONFLICT + snapshot → 落 DraftVersion 行,kind=OFFLINE_CONFLICT,snapshot=参数", async () => {
    const prisma = makePrisma(1, { type: "doc", server: 1 }, "T");
    const svc = new DraftsService(prisma as any);
    await svc.createVersion("d1", "u1", {
      kind: "OFFLINE_CONFLICT",
      snapshot: { type: "doc", client: 1 },
    });
    expect(prisma.draftVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        draftId: "d1",
        kind: "OFFLINE_CONFLICT",
        snapshot: { type: "doc", client: 1 },
      }),
    });
  });
});
```

- [ ] **Step 2: 跑测试看红**

```bash
pnpm --filter @bytedance-aigc/api test drafts.service.version-conflict
```

预期:5 个 case fail。

- [ ] **Step 3: 改 drafts.service.ts**

读现有 `update` 方法和 `createVersion` 方法。改 update:

```ts
async update(draftId: string, userSub: string, dto: UpdateDraftDto) {
  await this.assertAuthor(draftId, userSub);
  const cur = await this.prisma.draft.findUnique({ where: { id: draftId } });
  if (!cur) throw new NotFoundException(...);

  if (dto.baseVersion !== undefined && dto.baseVersion !== cur.version) {
    throw new ConflictException({
      message: "VERSION_CONFLICT",
      payload: {
        currentVersion: cur.version,
        title: cur.title,
        body: cur.body,
        updatedAt: cur.updatedAt.toISOString(),
      },
    });
  }
  // 旧路径
  return this.prisma.draft.update({
    where: { id: draftId },
    data: {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.body !== undefined && { body: dto.body }),
      version: { increment: 1 },
    },
  });
}
```

WHY 用 ConflictException 而不是手抛 HttpException(409):Nest 已有现成,filter 链已识别。

改 createVersion:

```ts
async createVersion(draftId: string, userSub: string, dto: CreateVersionDto) {
  await this.assertAuthor(draftId, userSub);
  const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) throw new NotFoundException(...);

  const kind = dto.kind ?? "NAMED";
  if (kind === "OFFLINE_CONFLICT" && !dto.snapshot) {
    throw new BadRequestException("kind=OFFLINE_CONFLICT requires snapshot");
  }
  if (kind === "NAMED" && dto.snapshot !== undefined) {
    throw new BadRequestException("kind=NAMED must not include snapshot");
  }
  const snapshot = dto.snapshot ?? draft.body;

  return this.prisma.draftVersion.create({
    data: {
      draftId,
      kind,
      snapshot: snapshot as any,
      note: dto.note,
      wordCount: extractWordCount(snapshot),
    },
  });
}
```

如有现成 wordCount 计算函数复用之,无则取 0(版本历史 UI 此字段非关键路径)。

- [ ] **Step 4: 跑测试看绿**

```bash
pnpm --filter @bytedance-aigc/api test drafts.service
```

5 个 case PASS,既有用例不破。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/drafts/
git commit -m "feat(api): Phase 2.14 update baseVersion 冲突 409 + version kind/snapshot 路由"
```

---

## Task 4:e2e 用例

**Files:**

- Modify: `apps/api/test/drafts.e2e-spec.ts`

- [ ] **Step 1: 加 3 个用例**

读现有 `drafts.e2e-spec.ts` 风格,在末尾或合适位置加:

```ts
describe("PATCH /drafts/:id with baseVersion", () => {
  it("baseVersion === current → 200, version+1", async () => {
    // 创建 draft → version=1
    // PATCH baseVersion=1, title="T2" → 200 → GET 看 version=2
  });

  it("baseVersion stale → 409 + payload", async () => {
    // 创建 → version=1
    // PATCH baseVersion=1 改一次 → version=2
    // 再 PATCH baseVersion=1, body=xxx → 409
    // 检查 res.body.message === "VERSION_CONFLICT"
    // res.body.payload.currentVersion === 2
    // res.body.payload.body 是云端最新
  });
});

describe("POST /drafts/:id/versions kind=OFFLINE_CONFLICT", () => {
  it("OFFLINE_CONFLICT + snapshot 落 DraftVersion 一行", async () => {
    // 创建 draft → POST versions {kind:OFFLINE_CONFLICT, snapshot:{type:'doc',client:1}} → 201
    // GET versions → 含一行 kind=OFFLINE_CONFLICT,snapshot 等于 client
  });
});
```

- [ ] **Step 2: 跑 e2e**

```bash
pnpm db:up
pnpm --filter @bytedance-aigc/api test:e2e drafts
```

3 个新用例 PASS,既有不破。

- [ ] **Step 3: 提交**

```bash
git add apps/api/test/drafts.e2e-spec.ts
git commit -m "test(api): Phase 2.14 baseVersion 冲突 + OFFLINE_CONFLICT 版本 e2e"
```

---

## Task 5:idb-draft-cache 工具层

**Files:**

- Create: `apps/web/src/lib/idb-draft-cache.ts`
- Test: `apps/web/src/lib/idb-draft-cache.test.ts`
- Modify: `apps/web/package.json`(加 idb-keyval)

- [ ] **Step 1: 装依赖**

```bash
pnpm --filter @bytedance-aigc/web add idb-keyval
```

- [ ] **Step 2: 写测试**

`idb-draft-cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSnapshot, putSnapshot, clearSnapshot } from "./idb-draft-cache";

vi.mock("idb-keyval", () => {
  const store = new Map<string, unknown>();
  return {
    createStore: vi.fn(() => "store"),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    get: vi.fn(async (k: string) => store.get(k)),
    del: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

describe("idb-draft-cache", () => {
  it("put → get round-trip", async () => {
    await putSnapshot("d1", {
      title: "T",
      body: { type: "doc" },
      baseVersion: 3,
      localUpdatedAt: 100,
    });
    const got = await getSnapshot("d1");
    expect(got).toEqual({
      title: "T",
      body: { type: "doc" },
      baseVersion: 3,
      localUpdatedAt: 100,
    });
  });

  it("clear → get 返 undefined", async () => {
    await putSnapshot("d1", { title: "", body: {}, baseVersion: 1, localUpdatedAt: 0 });
    await clearSnapshot("d1");
    const got = await getSnapshot("d1");
    expect(got).toBeUndefined();
  });
});
```

- [ ] **Step 3: 实现**

`idb-draft-cache.ts`:

```ts
import { createStore, get, set, del } from "idb-keyval";
import type { JSONContent } from "@tiptap/react";

export interface DraftSnapshot {
  title: string;
  body: JSONContent;
  baseVersion: number;
  localUpdatedAt: number;
}

const STORE = createStore("bytedance-aigc-drafts", "snapshots");

const k = (id: string) => `draft:${id}`;

export async function getSnapshot(id: string): Promise<DraftSnapshot | undefined> {
  return get<DraftSnapshot>(k(id), STORE);
}

export async function putSnapshot(id: string, snap: DraftSnapshot): Promise<void> {
  await set(k(id), snap, STORE);
}

export async function clearSnapshot(id: string): Promise<void> {
  await del(k(id), STORE);
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm --filter @bytedance-aigc/web test idb-draft-cache
```

PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/idb-draft-cache.ts apps/web/src/lib/idb-draft-cache.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): Phase 2.14 idb-draft-cache 本地快照 KV 工具层"
```

---

## Task 6:useAutosave 改造(30s 周期 + onLine + IDB + 409 fork)

**Files:**

- Modify: `apps/web/src/lib/use-autosave.ts`
- Test: `apps/web/src/lib/use-autosave.test.ts`(新或扩)
- Modify: `apps/web/src/components/save-status.tsx`(扩 status 类型)

- [ ] **Step 1: 写测试**

读现有 `use-autosave.ts` 既有测试若有,在其基础上加。新建/扩 `use-autosave.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave } from "./use-autosave";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAutosave 30s 周期", () => {
  it("初始 → 30s 后触发一次 save", async () => {
    const save = vi.fn().mockResolvedValue({ version: 2 });
    const { result, rerender } = renderHook(
      ({ v }) => useAutosave(v, save, { draftId: "d1", baseVersion: 1, onConflict: vi.fn() }),
      { initialProps: { v: { title: "a", body: {} } } },
    );
    rerender({ v: { title: "b", body: {} } });
    expect(save).not.toHaveBeenCalled();
    await act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("offline → status=offline,不调 save", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const save = vi.fn();
    const { result } = renderHook(() =>
      useAutosave({ title: "a", body: {} }, save, {
        draftId: "d1",
        baseVersion: 1,
        onConflict: vi.fn(),
      }),
    );
    await act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("offline");
  });

  it("online 事件 → 立刻补一次 save", async () => {
    const save = vi.fn().mockResolvedValue({ version: 2 });
    renderHook(() =>
      useAutosave({ title: "a", body: {} }, save, {
        draftId: "d1",
        baseVersion: 1,
        onConflict: vi.fn(),
      }),
    );
    await act(() => {
      window.dispatchEvent(new Event("online"));
      // microtask flush
    });
    expect(save).toHaveBeenCalled();
  });

  it("收 409 → 调 onConflict + status=conflict + 落冲突备份", async () => {
    const onConflict = vi.fn();
    const save = vi.fn().mockRejectedValueOnce({
      status: 409,
      payload: { currentVersion: 5, title: "云端", body: { type: "doc" } },
    });
    const { result, rerender } = renderHook(
      ({ v }) => useAutosave(v, save, { draftId: "d1", baseVersion: 1, onConflict }),
      { initialProps: { v: { title: "a", body: {} } } },
    );
    rerender({ v: { title: "b", body: {} } });
    await act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onConflict).toHaveBeenCalledWith({ title: "云端", body: { type: "doc" } });
    expect(result.current.status).toBe("conflict");
  });
});
```

测试用例命名跟踪 spec §4.2 流程。`save` 改造为「保存器」回调,内部决定是否带 baseVersion 等;hook 不直接 fetch,保持单测可控。

- [ ] **Step 2: 改 use-autosave.ts**

新签名:

```ts
export interface AutosaveOptions {
  draftId: string;
  baseVersion: number;
  onConflict: (server: { title: string; body: JSONContent }) => void;
  intervalMs?: number; // 默认 30000,测试可调
  localDebounceMs?: number; // 默认 1000
}

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "offline"
  | "conflict"
  | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  setStreaming: (on: boolean) => void;
  flush: () => Promise<void>;
}
```

`save: (v, baseVersion) => Promise<{ version: number } | { conflict: payload }>` — 保存器自己判断 409,把 conflict payload 上抛给 hook 处理。

实现要点:

1. `useEffect` 上 mount:启 `setInterval(maybePush, intervalMs)` + `addEventListener("online", onOnline)` + `addEventListener("offline", onOffline)`
2. `useEffect` 上 value 变:1s 防抖调 `putSnapshot(draftId, {title,body,baseVersion,localUpdatedAt:Date.now()})`
3. `maybePush`:`!navigator.onLine` → status=offline 跳出;deepEqual(value, lastUploaded) → 跳出;调 save → 解 200/409
4. 409:调 onConflict + 触发副作用(POST /versions OFFLINE_CONFLICT);hook 内部不发 fetch — 调用方传 `onConflictBackup` 回调?或者内嵌一个 fetch hook?

**简化决策**:hook 接受 `save` 一个回调,409 fork 的两步(POST versions + 状态切换)由调用方在 save 内部完成,hook 只看 save 返回的"已 fork"信号:

```ts
type SaveResult =
  | { ok: true; newVersion: number }
  | { ok: false; conflict: { currentVersion: number; title: string; body: JSONContent } };
```

hook 拿到 conflict 后:调 onConflict 回调通知 UI、status=conflict、baseVersion 重置为 currentVersion、lastUploaded 重置为云端、2s 后 status=saved。

调用方(DraftEditor 里 build save fn):

- 发 PATCH 带 baseVersion
- 收 409 → 立刻发 POST versions OFFLINE_CONFLICT(用本地 body)→ 返 `{ok:false, conflict:server}`
- 收 200 → 返 `{ok:true, newVersion}`

WHY:hook 不耦合具体 fetch,纯状态机,单测干净。fork 的两步副作用在 DraftEditor 集成层做。

- [ ] **Step 3: 跑测试**

```bash
pnpm --filter @bytedance-aigc/web test use-autosave
```

PASS。

- [ ] **Step 4: 改 SaveStatus 组件**

读 `save-status.tsx`,给 `status` 加映射:

```ts
const TEXT: Record<AutosaveStatus, string> = {
  idle: "已保存到云端",
  dirty: "未保存",
  saving: "同步中…",
  saved: "已保存到云端",
  offline: "未保存(离线中)",
  conflict: "他端已修改,已为你保留冲突备份",
  error: "保存失败,30s 后重试",
};
```

`saved` / `idle` 后接 `· HH:MM:SS`(若 lastSavedAt 非 null)。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/use-autosave.ts apps/web/src/lib/use-autosave.test.ts apps/web/src/components/save-status.tsx
git commit -m "feat(web): Phase 2.14 useAutosave 30s 周期 + onLine + 409 fork 状态机"
```

---

## Task 7:三 Banner 组件 + 启动复活逻辑

**Files:**

- Create: `apps/web/src/components/offline-banner.tsx`
- Create: `apps/web/src/components/conflict-banner.tsx`
- Create: `apps/web/src/components/readonly-banner.tsx`
- Test: 各 1 vitest spec
- Modify: `apps/web/src/components/draft-editor.tsx`

- [ ] **Step 1: 写 OfflineBanner**

```tsx
"use client";
export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      data-testid="offline-banner"
      className="rounded border border-amber-400 bg-amber-50 px-3 py-2 mb-4 text-sm"
    >
      当前离线,内容已保存在本设备。网络恢复后将自动同步。
    </div>
  );
}
```

类似实现 ConflictBanner(蓝底)、ReadonlyBanner(红底,带"该文章已在其他标签打开,均切只读" + 关闭其他标签按钮)。

- [ ] **Step 2: 各 1 vitest spec**

mount + 断言 testid + visible/!visible 切换。

- [ ] **Step 3: DraftEditor 集成**

读现有 `draft-editor.tsx`,加:

1. `useDraftPresence(id)` 拿 `otherTabExists`,true 时整个编辑区 `editor.setEditable(false)` 且不调 save
2. 启动时:`fetch GET /drafts/:id` + `getSnapshot(id)`,按 spec §4.3 比对决定用哪个 body
3. 顶部 banner stack:Readonly > Offline > Conflict 短路
4. `useAutosave` 第二个参数(`save` fn)实现:
   - PATCH 带 `baseVersion`
   - 收 401 → 清 token + 跳登录
   - 收 409 → fork:POST `/drafts/:id/versions` `{kind:OFFLINE_CONFLICT, snapshot: localBody}` → 解析 payload → 返 `{ok:false, conflict}`
   - 收 200 → 返 `{ok:true, newVersion}`

WHY 复活策略:用户上次断网编辑后关闭页面,IndexedDB 留了快照;下次打开时:

- 快照不存在 → 用云端
- 快照 baseVersion === 云端 version → 复活快照(本地是上次离线的脏数据,云端没人动过)
- 快照 baseVersion < 云端 version → fork:落 OFFLINE_CONFLICT 备份 + 用云端覆盖
- 快照 baseVersion > 云端 version → 异常状态,清快照用云端,console.warn

- [ ] **Step 4: 跑测试**

```bash
pnpm --filter @bytedance-aigc/web test
```

新加测试 PASS,既有不破。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/{offline,conflict,readonly}-banner.tsx apps/web/src/components/draft-editor.tsx apps/web/src/components/{offline,conflict,readonly}-banner.test.tsx
git commit -m "feat(web): Phase 2.14 三 Banner + DraftEditor 启动复活 + 409 fork 集成"
```

---

## Task 8:useDraftPresence(BroadcastChannel)

**Files:**

- Create: `apps/web/src/lib/use-draft-presence.ts`
- Test: `apps/web/src/lib/use-draft-presence.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftPresence } from "./use-draft-presence";

class FakeBroadcastChannel extends EventTarget {
  static channels = new Map<string, FakeBroadcastChannel[]>();
  constructor(public name: string) {
    super();
    const list = FakeBroadcastChannel.channels.get(name) ?? [];
    list.push(this);
    FakeBroadcastChannel.channels.set(name, list);
  }
  postMessage(data: any) {
    const list = FakeBroadcastChannel.channels.get(this.name) ?? [];
    for (const ch of list) {
      if (ch === this) continue;
      ch.dispatchEvent(new MessageEvent("message", { data }));
    }
  }
  close() {
    const list = FakeBroadcastChannel.channels.get(this.name) ?? [];
    FakeBroadcastChannel.channels.set(
      this.name,
      list.filter((c) => c !== this),
    );
  }
}
(globalThis as any).BroadcastChannel = FakeBroadcastChannel;

describe("useDraftPresence", () => {
  it("单 tab → otherTabExists=false", () => {
    const { result } = renderHook(() => useDraftPresence("d1"));
    expect(result.current.otherTabExists).toBe(false);
  });

  it("两个 hook 实例同 draftId → 双方都 otherTabExists=true", () => {
    const a = renderHook(() => useDraftPresence("d1"));
    const b = renderHook(() => useDraftPresence("d1"));
    expect(a.result.current.otherTabExists).toBe(true);
    expect(b.result.current.otherTabExists).toBe(true);
  });

  it("不同 draftId 不互相影响", () => {
    const a = renderHook(() => useDraftPresence("d1"));
    const b = renderHook(() => useDraftPresence("d2"));
    expect(a.result.current.otherTabExists).toBe(false);
  });
});
```

- [ ] **Step 2: 实现**

```ts
"use client";
import { useEffect, useState, useRef } from "react";

export function useDraftPresence(draftId: string) {
  const [otherTabExists, setOtherTabExists] = useState(false);
  const tabIdRef = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    const ch = new BroadcastChannel("draft-presence");
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { draftId: string; tabId: string; action: "open" | "ack" | "close" };
      if (d.draftId !== draftId || d.tabId === tabIdRef.current) return;
      if (d.action === "open" || d.action === "ack") {
        setOtherTabExists(true);
        if (d.action === "open") {
          ch.postMessage({ draftId, tabId: tabIdRef.current, action: "ack" });
        }
      } else if (d.action === "close") {
        setOtherTabExists(false);
      }
    };
    ch.addEventListener("message", onMsg);
    ch.postMessage({ draftId, tabId: tabIdRef.current, action: "open" });
    return () => {
      ch.postMessage({ draftId, tabId: tabIdRef.current, action: "close" });
      ch.removeEventListener("message", onMsg);
      ch.close();
    };
  }, [draftId]);
  return { otherTabExists };
}
```

- [ ] **Step 3: 跑测试**

```bash
pnpm --filter @bytedance-aigc/web test use-draft-presence
```

PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/lib/use-draft-presence.ts apps/web/src/lib/use-draft-presence.test.ts
git commit -m "feat(web): Phase 2.14 useDraftPresence BroadcastChannel 多 tab 探测"
```

---

## Task 9:VersionHistoryModal OFFLINE_CONFLICT 角标

**Files:**

- Modify: `apps/web/src/components/version-history-modal.tsx`

- [ ] **Step 1: 读现有组件**

定位渲染版本节点的位置,看怎么显示 kind。

- [ ] **Step 2: 加角标**

在已有 NAMED/PUBLISHED/AUTO 角标旁边加:

```tsx
{
  v.kind === "OFFLINE_CONFLICT" && (
    <span className="rounded bg-orange-100 text-orange-800 text-xs px-1.5 py-0.5">冲突备份</span>
  );
}
```

「设为当前」按钮已对所有 kind 通用,不动。

- [ ] **Step 3: 跑既有 vitest**

```bash
pnpm --filter @bytedance-aigc/web test version-history
```

不破。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/version-history-modal.tsx
git commit -m "feat(web): Phase 2.14 版本历史 OFFLINE_CONFLICT 冲突备份角标"
```

---

## Task 10:Playwright e2e

**Files:**

- Create: `apps/web/e2e/offline-autosave.spec.ts`

- [ ] **Step 1: 写 e2e**

读现有 e2e 风格(`apps/web/e2e/*.spec.ts`),复用 storageState fixture。

```ts
import { test, expect } from "@playwright/test";

test("断网编辑 → 显示离线 banner → 恢复后自动同步", async ({ page, context }) => {
  await page.goto("/drafts/<seed-draft-id>");
  await expect(page.getByTestId("save-status")).toContainText("已保存");
  await context.setOffline(true);
  await page.locator('[contenteditable="true"]').first().fill("断网期间编辑");
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await context.setOffline(false);
  // 等 30s 周期或 online 事件触发的 save
  await expect(page.getByTestId("save-status")).toContainText("已保存", { timeout: 5_000 });
});

test("两 tab 同草稿 → 双方都进入只读模式", async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await tabA.goto("/drafts/<seed-draft-id>");
  await tabB.goto("/drafts/<seed-draft-id>");
  await expect(tabA.getByTestId("readonly-banner")).toBeVisible();
  await expect(tabB.getByTestId("readonly-banner")).toBeVisible();
});
```

「online 事件 → 立即 push」hook 已实现,e2e 不必等 30s。seed-draft-id 用现有 fixture 草稿 id。

- [ ] **Step 2: 跑 e2e**

```bash
pnpm --filter @bytedance-aigc/web exec playwright test offline-autosave
```

PASS。如果 BroadcastChannel 在 Playwright 同 context 多 page 间不通,降级方案:用 `localStorage` 事件做后备(改 useDraftPresence 内部)。

- [ ] **Step 3: 提交**

```bash
git add apps/web/e2e/offline-autosave.spec.ts
git commit -m "test(web): Phase 2.14 offline + 多 tab 只读 Playwright e2e"
```

---

## Task 11:README + 归档

**Files:**

- Modify: `README.md`(根)
- Move: `docs/superpowers/specs/2026-06-08-phase-2-14-offline-autosave-design.md` → `shipped/`
- Move: `docs/superpowers/plans/2026-06-08-phase-2-14-offline-autosave.md` → `shipped/`

- [ ] **Step 1: 加 README 章节**

在 `## Phase 2.13` 之后插入:

```markdown
## Phase 2.14 — 离线兜底自动保存与冲突解决

PRD §3.3.1 / §3.3.2 落地。

- **本地 1s 防抖**:`apps/web/src/lib/idb-draft-cache.ts`(idb-keyval),写 IndexedDB 快照 `{title,body,baseVersion,localUpdatedAt}`
- **云端 30s 周期**:`useAutosave` setInterval + `online` 事件即时补push,断网时 `navigator.onLine === false` 跳过
- **版本号乐观锁**:PATCH `/drafts/:id` 带 `baseVersion`,后端不匹配返 409 + `payload:{currentVersion,title,body}`,前端 fork 走 POST `/drafts/:id/versions` `{kind:OFFLINE_CONFLICT, snapshot}` 落冲突备份后用云端覆盖编辑器
- **多 tab 探测**:`useDraftPresence` BroadcastChannel,同 draftId 双方都进入只读
- **三 Banner 优先级**:Readonly(红) > Offline(黄) > Conflict(蓝,2s 自消)
- **启动复活**:打开草稿时比对本地 IndexedDB 快照与云端 version,等同则复活,小于则走冲突 fork
- **状态文案**:已保存到云端 · HH:MM:SS / 未保存(离线中) / 同步中… / 他端已修改,已为你保留冲突备份 / 保存失败,30s 后重试

测试基线:api 单测 +5 / e2e +3 / web vitest +9 / playwright +1 文件 ~3 用例。
```

- [ ] **Step 2: 归档**

```bash
git mv docs/superpowers/specs/2026-06-08-phase-2-14-offline-autosave-design.md docs/superpowers/specs/shipped/
git mv docs/superpowers/plans/2026-06-08-phase-2-14-offline-autosave.md docs/superpowers/plans/shipped/
```

- [ ] **Step 3: lint / typecheck / 全测试 final pass**

```bash
pnpm typecheck
pnpm lint
pnpm db:up
pnpm --filter @bytedance-aigc/api test
pnpm --filter @bytedance-aigc/api test:e2e
pnpm --filter @bytedance-aigc/web test
pnpm --filter @bytedance-aigc/web exec playwright test
```

全绿。如有 lint 红,修掉。

- [ ] **Step 4: 提交**

```bash
git add README.md docs/superpowers/
git commit -m "chore(docs): 归档 Phase 2.14 spec/plan + README 章节"
```

---

## 自检

- [x] 所有 task 都有具体 file:line 锚点
- [x] 后端 schema 改动可前向兼容(enum 加项,旧记录无影响,baseVersion 可选)
- [x] 前端 hook 单测可独立(save 回调注入,无 fetch 副作用)
- [x] 三 Banner 优先级有明文(stack short-circuit)
- [x] 启动复活四种 case 都覆盖(空快照 / 等同 / 落后 / 异常)
- [x] BroadcastChannel 失败降级方案(localStorage 事件)在 Task 10 备注
- [x] PRD 验收清单 9 条全有任务对应

## Out-of-scope(留下个 phase)

- ServiceWorker / PWA(PRD 没要求)
- 跨设备(非同浏览器)的 presence,需后端心跳 + Redis
- IndexedDB 加密
