# Phase 2.14 — 离线兜底自动保存与冲突解决 设计稿

> **PRD 锚点**:§3.3.1 草稿自动保存策略(硬指标:30s)+ §3.3.2 断网与多设备冲突解决
>
> **设计原则**:本地 IndexedDB 兜底,云端 30s 周期上传,版本号驱动的乐观锁冲突检测,冲突落 DraftVersion 表新行,多端并发用 BroadcastChannel 同浏览器即时提示。
>
> **范围**:仅创作工作台 `/drafts/[id]` 路径,信息流/详情页/工作台列表不涉及。

## 0. 缺口诊断

当前 `apps/web/src/lib/use-autosave.ts` 仅做内存 + 1.5s 防抖云端 PATCH:

- 无 IndexedDB 镜像,刷页/断网期间内存数据完全丢失
- 无 30s 周期触发(PRD 硬指标)
- 无 `navigator.onLine` 监听,断网时仍发请求并报 toast 错
- 无版本号冲突检测,后端 `version: { increment: 1 }` 但前端不带 baseVersion,他端先改后本端覆盖
- 无多 tab 并发提示
- 状态 `idle/dirty/saving/saved/error` 与 PRD 要求的「已保存到云端 / 未保存(离线中)/ 同步中」三态不对齐

## 1. 总体数据流

```
用户编辑(TipTap onUpdate)
   │
   ├─→ valueRef 同步(无防抖)
   │
   ├─→ 1s 防抖 → IndexedDB 写本地快照 ────────────┐
   │   (key=`draft:${id}` value={title,body,baseVersion,localUpdatedAt})
   │                                              │
   └─→ 30s 周期(setInterval) 比对 lastUploadedSnapshot,变了才发 PATCH
                                                  │
                                                  ▼
                  ┌───── navigator.onLine === false ─────┐
                  │  跳过 PATCH,UI 切「未保存(离线中)」 │
                  └───────────────────────────────────────┘
                                                  │
                          PATCH /drafts/:id { title, body, baseVersion }
                                                  │
            ┌─────────────────────────────┬───────┴──────┬─────────────────────┐
            ▼                             ▼              ▼                     ▼
       200 OK                    409 VERSION_CONFLICT  401            网络异常 / 5xx
       version+1 + payload       payload={server}      回登录          状态切 error,
       UI「已保存到云端」          → fork 流              清 token       下个 30s tick 重试
                                  ① POST versions
                                     {kind:OFFLINE_CONFLICT,
                                      snapshot:client}
                                  ② setContent(server.body)
                                  ③ baseVersion=server.version
                                  ④ Banner「他端已修改,
                                     已为你保留冲突备份」

恢复网络:
   window.ononline → 立刻触发一次 30s tick(不等周期)
   离线期间堆积的 IndexedDB 快照 → 一次 PATCH 上传(带 baseVersion)
   若 baseVersion 失效走 409 fork

多 tab:
   editor mount → BroadcastChannel('draft-presence').postMessage({draftId, tabId, action:'open'})
   收到他 tab 同 draftId 'open' → Banner「该文章已在其他标签打开,是否进入只读」
   只读模式:editor.setEditable(false),停所有自动保存,UI 顶部红条
```

## 2. 模块边界

### 2.1 前端

| 文件                                              | 职责                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/web/src/lib/idb-draft-cache.ts`             | idb-keyval 包装层,纯函数 `getSnapshot/putSnapshot/clearSnapshot`,KV 单 store |
| `apps/web/src/lib/use-autosave.ts`(改造)          | 30s 周期 + onLine 监听 + IndexedDB 镜像 + 409 fork                           |
| `apps/web/src/lib/use-draft-presence.ts`(新)      | BroadcastChannel 多 tab 探测,返 `{isPrimary, otherTabExists}`                |
| `apps/web/src/components/save-status.tsx`(改)     | 三态显示 + 离线小图标                                                        |
| `apps/web/src/components/offline-banner.tsx`(新)  | 顶部信息条,`navigator.onLine === false` 时显示                               |
| `apps/web/src/components/conflict-banner.tsx`(新) | 409 fork 后显示「已保留冲突备份,可在版本历史里恢复」+ 跳转按钮               |
| `apps/web/src/components/readonly-banner.tsx`(新) | 多 tab 探测命中时显示「只读模式,该文章已在其他标签打开」                     |
| `apps/web/src/components/draft-editor.tsx`(改)    | 串这些 banner,接 hook 返的状态                                               |

### 2.2 后端

| 文件                                            | 职责                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                 | `VersionKind` 加 `OFFLINE_CONFLICT` enum 项                                            |
| `apps/api/src/drafts/dto/update-draft.dto.ts`   | `baseVersion?: number`,可选                                                            |
| `apps/api/src/drafts/drafts.service.ts`         | `update()` 内若带 baseVersion 且不匹配 → 409 + payload `{currentVersion, body, title}` |
| `apps/api/src/drafts/dto/create-version.dto.ts` | `kind?: VersionKind`,默认 `NAMED`,允许 `OFFLINE_CONFLICT`                              |
| `apps/api/src/drafts/drafts.controller.ts`      | `POST /drafts/:id/versions` 透传 kind                                                  |
| `apps/api/test/drafts.e2e-spec.ts`              | +3 用例(baseVersion 冲突 409、同 baseVersion 通过、OFFLINE_CONFLICT 落表)              |

### 2.3 共享

| 文件                            | 职责                             |
| ------------------------------- | -------------------------------- |
| `packages/shared/src/errors.ts` | 加 `VERSION_CONFLICT` 错误码常量 |

## 3. API 契约变更

### 3.1 `PATCH /drafts/:id`

**请求体**:

```ts
{
  title?: string;
  body?: JSONContent;
  baseVersion?: number;  // 新增,可选(向后兼容老前端)
}
```

**行为**:

- `baseVersion` 不传:沿用旧逻辑,`version: { increment: 1 }`(老前端、preflight 内部调用都走这条)
- `baseVersion` 传且 === currentVersion:正常 update,`version: { increment: 1 }`,返 200
- `baseVersion` 传且 !== currentVersion:返 409

**409 响应**:

```ts
{
  statusCode: 409,
  message: "VERSION_CONFLICT",
  payload: {
    currentVersion: number,
    title: string,
    body: JSONContent,
    updatedAt: string  // ISO
  }
}
```

WHY 把 server payload 内嵌:前端拿到 409 后立刻有数据可用,不必再发一次 GET。

### 3.2 `POST /drafts/:id/versions`

**请求体**:

```ts
{
  note?: string;
  kind?: "NAMED" | "OFFLINE_CONFLICT";  // 新增,默认 NAMED
  snapshot?: JSONContent;  // 仅 OFFLINE_CONFLICT 时必填,否则取当前 body
}
```

**WHY 改造而非新端点**:OFFLINE_CONFLICT 本质是「为这一刻的 body 留个版本节点」,与 NAMED 同构;前端调用方式也都是「我现在主动创建一个版本」。复用比新建端点更省接口。

**约束**:

- `kind=OFFLINE_CONFLICT` 时 `snapshot` 必填(本地 IndexedDB 拿来的客户端 body),否则 BadRequest
- `kind=NAMED` 时 `snapshot` 必须不传(避免误用),否则 BadRequest;由 service 取 `draft.body`

### 3.3 错误码

| code               | http | 含义                     |
| ------------------ | ---- | ------------------------ |
| `VERSION_CONFLICT` | 409  | baseVersion 与当前不一致 |

加入 `packages/shared/src/errors.ts`,前端 fetch 拦截器识别。

## 4. 前端状态机

### 4.1 useAutosave 状态

```ts
type AutosaveStatus =
  | "idle" // 未发生编辑
  | "dirty" // 有未上云端的本地改动(可能在 IndexedDB 已存)
  | "saving" // 30s tick 触发的 PATCH 正在飞
  | "saved" // 已上云端
  | "offline" // navigator.onLine === false,跳过 PATCH
  | "conflict" // 收到 409,已 fork
  | "error"; // 5xx / 网络异常,30s 后重试
```

UI 映射:

| status       | 文案(SaveStatus 组件)           |
| ------------ | ------------------------------- |
| idle / saved | 「已保存到云端 · HH:MM:SS」     |
| dirty        | 「未保存」                      |
| saving       | 「同步中…」                     |
| offline      | 「未保存(离线中)」+ 离线 Banner |
| conflict     | 临时 Banner,2s 后回 saved       |
| error        | 「保存失败,30s 后重试」         |

### 4.2 useAutosave 流程

```ts
useEffect(() => {
  // mount:启 30s 周期 + onLine 监听
  const interval = setInterval(maybePush, 30_000);
  const onlineHandler = () => maybePush(); // 立刻补一次
  window.addEventListener("online", onlineHandler);
  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onlineHandler);
  };
}, []);

useEffect(() => {
  // value 变:1s 防抖 → IndexedDB.put
  const t = setTimeout(() => putSnapshot(draftId, value, baseVersion), 1000);
  return () => clearTimeout(t);
}, [value]);

async function maybePush() {
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }
  const local = valueRef.current;
  if (deepEqual(local, lastUploadedRef.current)) return; // 没变化跳过
  setStatus("saving");
  try {
    const res = await apiFetch(`/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...local, baseVersion: baseVersionRef.current }),
    });
    if (res.status === 409) {
      const { payload } = await res.json();
      // ① 落冲突备份
      await apiFetch(`/drafts/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ kind: "OFFLINE_CONFLICT", snapshot: local.body }),
      });
      // ② 用云端覆盖编辑器
      onConflict({ title: payload.title, body: payload.body });
      baseVersionRef.current = payload.currentVersion;
      lastUploadedRef.current = { title: payload.title, body: payload.body };
      setStatus("conflict");
      // 2s 后回 saved
      setTimeout(() => setStatus("saved"), 2000);
      return;
    }
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const updated = await res.json();
    baseVersionRef.current = updated.version;
    lastUploadedRef.current = local;
    await clearSnapshot(draftId); // 已上云端,清本地
    setStatus("saved");
  } catch {
    setStatus("error");
  }
}
```

### 4.3 启动时 IndexedDB 复活

`DraftEditor` mount 时优先级:

1. fetch GET /drafts/:id → 拿云端 body + version
2. getSnapshot(draftId) → 拿本地快照
3. 比较:
   - 无快照 → 用云端
   - 快照 baseVersion === 云端 version 且本地 localUpdatedAt > 云端 updatedAt → 复活本地(用户上次断网编辑过,网未通就关页了)
   - 快照 baseVersion < 云端 version → 走冲突 fork(他端先改了),云端覆盖 + 本地落 OFFLINE_CONFLICT 版本
   - 快照 baseVersion > 云端 version:理论不可能(云端只增不减),日志告警 + 用云端

### 4.4 useDraftPresence(BroadcastChannel)

```ts
const channel = new BroadcastChannel("draft-presence");
const tabId = crypto.randomUUID();

// mount:广播 open
channel.postMessage({ draftId, tabId, action: "open", ts: Date.now() });

// 收到他 tab 同 draftId open:进入只读
channel.onmessage = (e) => {
  if (e.data.draftId !== draftId || e.data.tabId === tabId) return;
  if (e.data.action === "open") {
    setOtherTabExists(true);
    // 反向回应:让对方知道我也在(供对方决定谁优先)
    channel.postMessage({ draftId, tabId, action: "ack", ts: Date.now() });
  }
};

// unmount:广播 close
useEffect(
  () => () => {
    channel.postMessage({ draftId, tabId, action: "close" });
    channel.close();
  },
  [],
);
```

策略:**两 tab 都进入只读**(简单,避免「谁先 open 谁主导」的时间戳竞争)。Banner 文案「该文章在其他标签打开,均已切到只读模式;关闭其他标签后刷新本页继续编辑」。

WHY 不做时钟优先:demo 场景,作者关一个 tab 就行;复杂的 leader election 没必要。

## 5. DraftVersion 表改动

### 5.1 schema

```prisma
enum VersionKind {
  AUTO
  NAMED
  PUBLISHED
  OFFLINE_CONFLICT  // 新增
}
```

迁移:`pnpm prisma:migrate` 生成 `20260608_add_offline_conflict_kind/migration.sql`,内容仅 `ALTER TYPE "VersionKind" ADD VALUE 'OFFLINE_CONFLICT';`。

### 5.2 fixtures / seed 不动

OFFLINE_CONFLICT 由用户行为产生,seed 不需要预填。

### 5.3 版本历史 UI

`apps/web/src/components/version-history-modal.tsx` 已有时间轴。改动:

- 角标:`OFFLINE_CONFLICT` 行显示橙色「冲突备份」标
- diff 视图:点击 OFFLINE_CONFLICT 行右侧「与当前对比」按钮 → 沿用现有 diff 组件
- 「设为当前」按钮:OFFLINE_CONFLICT 与 NAMED/AUTO 一样可恢复

## 6. UI 三 Banner 优先级

页面顶部最多同时只显示一条,优先级高 → 低:

1. ReadonlyBanner(多 tab 命中,红底)
2. OfflineBanner(`navigator.onLine === false`,黄底)
3. ConflictBanner(刚 fork 完,2s 自动消失,蓝底)

实现:`DraftEditor` 顶部一个 `<BannerStack>` 组件,内部按上述顺序 short-circuit。

## 7. 测试矩阵

### 7.1 后端单测

- `drafts.service` `update` 收到匹配 baseVersion → 正常 + version+1
- 收到不匹配 baseVersion → 抛 409 + payload 字段齐全
- `update` 不带 baseVersion(老前端) → 沿用旧路径,绿
- `createVersion` kind=OFFLINE_CONFLICT 必带 snapshot,否则 400
- `createVersion` kind=NAMED 带 snapshot 报 400

### 7.2 后端 e2e

- 鉴权后 PATCH 同 baseVersion → 200,version+1
- 改完再用旧 baseVersion → 409,payload.currentVersion === 实际,payload.body 是云端最新
- POST /versions kind=OFFLINE_CONFLICT 落 DraftVersion 一行,kind=OFFLINE_CONFLICT
- GET /drafts/:id/versions 返出 OFFLINE_CONFLICT 行(版本历史能看到)

### 7.3 前端 vitest

- `idb-draft-cache`:put → get 圆 round-trip,clear 后 get null
- `useAutosave`:
  - 30s 周期触发(`vi.useFakeTimers`)
  - `navigator.onLine = false` 时跳过 PATCH,status=offline
  - 收到 409 → fork(调 POST versions OFFLINE_CONFLICT + onConflict 回调)
  - 编辑后 1s 防抖 → idb-keyval put 被调
- `useDraftPresence`:模拟 BroadcastChannel 收他 tab open → otherTabExists = true
- `<SaveStatus>` 五态文案断言

### 7.4 Playwright e2e(新增 1 文件)

- `apps/web/e2e/offline-autosave.spec.ts`:
  - 打开草稿编辑,断网(`page.context().setOffline(true)`),编辑 → 看到离线 Banner
  - 恢复网,看 `[data-testid=save-status]` 切回「已保存」
  - 同 storageState 开第二 tab 同草稿,两 tab 都进入只读模式
  - **不测**:多浏览器并发(超出 BroadcastChannel 能力),冲突 fork 的真实 LLM 流程

## 8. 不做什么

- ServiceWorker / PWA(PRD 没要求,IndexedDB + onLine 监听足够)
- 离线期间 AI 工具调用(本来也只能在线 LLM,断网没意义)
- 跨浏览器/跨设备并发(BroadcastChannel 局限,留 Phase 后续做后端心跳)
- IndexedDB 加密(demo 项目不存敏感数据)
- 复杂的「合并三方版本」CRDT(版本号乐观锁 + 冲突备份足够 PRD §3.3.2 语义)

## 9. 切换/回滚

- 后端 schema 变更只加 enum 项,旧记录无影响,迁移可前向兼容
- PATCH 不带 baseVersion 走旧路径 → 老前端 cache、preflight 内部调用、e2e 老用例都不破
- 前端 useAutosave 改造保留 `setStreaming` / `flush` 既有 API 形状,DraftEditor 调用点不变
- 关闭离线兜底:删 idb-keyval 调用 + 30s setInterval → 退回 1.5s 防抖纯内存模式

## 10. 验收清单(对齐 PRD §3.3.1/§3.3.2)

- [ ] 1s 防抖写 IndexedDB(本地兜底)
- [ ] 30s 周期触发云端 PATCH(硬指标)
- [ ] 顶部三态显示:已保存到云端 · HH:MM:SS / 未保存(离线中)/ 同步中
- [ ] 断网时 UI 顶部出现「当前离线,内容已保存在本设备」信息条
- [ ] 网络恢复 → 自动补一次 PATCH
- [ ] 云端较新触发 409 → 冲突备份落版本历史 + 用云端覆盖编辑器
- [ ] 多 tab 打开 → 弹「该文章在其他设备打开,是否进入只读模式」并切只读
- [ ] 网络中断时无报错弹窗、无编辑中断
- [ ] 验证脚本:断网 1 分钟编辑 → 恢复后内容已同步

测试基线目标:api 单测 +5 / e2e +3 / web vitest +9 / playwright +1 文件 ~3 用例。
