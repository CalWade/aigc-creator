# Phase 1.4 鉴权骨架 — JWT 真签真校 + Demo 登录 设计文档

**日期**:2026-05-27
**作者**:CalvinWade(评委 + 自用)
**关联**:Phase 1 路线图、`project_bytedance_aigc_creator_platform.md` 记忆中"1.4 鉴权骨架(最小可用 JWT/session,把 authorId 从 hardcode 拔出来)"

---

## 1. 目标

把 `apps/api` 当前"客户端在 body 里随便填 `authorId` 就能写"的玩具状态,升级成"必须先登录拿 token、token 由服务端签名校验、`authorId` 从 token payload 派生"的最小可用鉴权骨架。

**做**:JWT 签发与校验 / 全局 `JwtAuthGuard` / `@CurrentUser()` 装饰器 / `POST /auth/login`(只输 handle 即发 token)/ 现有 `/drafts` 端点改造为从 token 取 `authorId`。

**不做**:用户注册、密码哈希、refresh token、登出黑名单、第三方 OAuth、权限分级(role/scope)。

## 2. 决策记录

### 2.1 选 JWT 真签真校而不是 mock-only header

权衡过三档:

- **A**:全局 Guard 直接从 dev header 读 `DEMO_AUTHOR_ID`——最薄,但前端联调时还得换一次方案
- **B**(选):`@nestjs/jwt` + 真签真校 + demo 登录端点(只输 handle 不验密码)——教学价值高、前端可以走完整 Bearer token 闭环、不背 bcrypt 包袱
- **C**:passport-local + bcrypt + access/refresh 双轨——3 周交付期 over-engineering

选 B 的核心理由:**把"鉴权语义"和"用户管理"解耦**。鉴权语义(token 签名/校验/派生 authorId)走完整流程,用户管理(谁能登录)简化到极致(handle 在 User 表存在即可登录)。这两条独立演进——后续 1.5 / 1.6 想加密码 / OAuth,只动用户管理那一侧,鉴权管道不变。

### 2.2 不用 `@nestjs/passport`,只用 `@nestjs/jwt`

`@nestjs/passport` 是个 strategy 适配框架,价值在于"我同时支持 local + JWT + Google + GitHub 五种登录"。本项目只有一种(JWT),引入 passport 反而多一层 strategy 抽象。

直接用 `@nestjs/jwt` 的 `JwtService.signAsync` / `verifyAsync` + 自定义 `CanActivate` Guard,30 行代码搞定,可读性更高。

> 副产品:文档里少一个"什么是 passport strategy"要解释的概念。Phase 1.4 之后真要扩三方登录,再迁 passport 不晚。

### 2.3 token 体积:只塞 `sub`(userId)和 `handle`,不塞 `role` / `email`

`role` Phase 1 没设计;`email` User 表都没字段。塞了就要在 schema / DTO / token 三处保持同步,YAGNI。

token payload 形状:

```ts
interface JwtPayload {
  sub: string; // User.id (cuid)
  handle: string; // User.handle (展示用,前端不查库就能知道当前用户名)
  iat: number; // jwt 标准
  exp: number; // jwt 标准
}
```

### 2.4 token 过期时间:7d

dev / e2e 场景过期不是关注点;7d 是常见默认,不需要 refresh token 也能撑住一次产品演示。生产真要上,Phase 2 加 refresh 流程时再调短到 15min + refresh 7d。

### 2.5 secret 来源:`.env` 的 `JWT_SECRET`,无默认值

启动时 `ConfigService.getOrThrow('JWT_SECRET')`——secret 缺失直接拒绝起服务,不偷偷退化到默认值。这是典型的 "fail loudly" 反模式规避。

`.env.example` 加示例值 + 注释要求"生产换强随机";`.env`(已 gitignored)用户本地填。

## 3. 架构

### 3.1 模块划分

```
apps/api/src/
├── auth/                          ← 新增,本里程碑核心
│   ├── auth.module.ts             ← JwtModule.registerAsync + 暴露 AuthService + JwtAuthGuard
│   ├── auth.controller.ts         ← POST /auth/login
│   ├── auth.service.ts            ← validateAndIssue(handle) 业务逻辑
│   ├── jwt-auth.guard.ts          ← CanActivate,挂全局
│   ├── current-user.decorator.ts  ← @CurrentUser() 从 req.user 取
│   ├── public.decorator.ts        ← @Public() 标记免鉴权端点(健康检查、登录端点用)
│   ├── jwt-payload.interface.ts   ← JwtPayload TS 接口
│   └── dto/
│       └── login.dto.ts           ← LoginDto: { handle: string }
├── drafts/  (改造)
├── prompts/ (改造)
├── prisma/
└── app.module.ts                  ← imports: AuthModule + 全局 APP_GUARD: JwtAuthGuard
```

### 3.2 请求时序

```
登录:
client → POST /auth/login { handle: "demo-author" }
       ↓
       AuthController.login()  (@Public)
       ↓
       AuthService.validateAndIssue(handle)
         ├─ prisma.user.findUnique({ where: { handle } })
         ├─ 不存在 → throw UnauthorizedException("user not found")
         └─ 存在 → JwtService.signAsync({ sub: user.id, handle: user.handle }, { expiresIn: '7d' })
       ↓
client ← 200 { accessToken: "<jwt>", user: { id, handle } }


鉴权:
client → GET /drafts  Authorization: Bearer <jwt>
       ↓
       JwtAuthGuard (全局)
         ├─ 检查 controller / handler 上有无 @Public() → 有就放行
         ├─ 从 Authorization header 提取 token
         ├─ JwtService.verifyAsync(token)
         │    ├─ 失败 → throw UnauthorizedException("invalid token")
         │    └─ 成功 → req.user = payload
         └─ return true
       ↓
       DraftsController.list(@CurrentUser() user: JwtPayload)
       ↓
       drafts.service.list(user.sub)  ← 此处可按 authorId 过滤(本里程碑只在 POST 用)
       ↓
client ← 200 [...]
```

### 3.3 端点改造清单

| 端点                      | 1.4 之前                    | 1.4 之后                                                       |
| ------------------------- | --------------------------- | -------------------------------------------------------------- |
| `POST /auth/login`        | ❌ 不存在                   | ✅ 新增,`@Public`                                              |
| `POST /drafts`            | body 含 `authorId`,DTO 校验 | body 移除 `authorId`,从 `@CurrentUser` 取                      |
| `GET /drafts`             | 全局可见                    | 需 token(保持返回所有,不按 user 过滤——`/drafts/mine` 留给 1.5) |
| `GET /drafts/:id`         | 全局可见                    | 需 token                                                       |
| `GET /prompts`            | 全局可见                    | `@Public`(平台 prompt 是公开资源)                              |
| `GET /prompts/:id`        | 全局可见                    | `@Public`                                                      |
| `GET /` (`AppController`) | 全局可见                    | `@Public`(健康检查)                                            |

> **设计选择**:`GET /drafts` 不在本里程碑加"只看自己的"过滤——这是业务能力(我的草稿列表),归 1.5。1.4 只做"鉴权语义",不做"按 user 过滤数据"。

### 3.4 全局 Guard 注册方式

用 `APP_GUARD` provider 而非 `app.useGlobalGuards(new JwtAuthGuard())`:

```ts
providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }];
```

理由和 1.2 的 `APP_FILTER` 完全一样:走 NestJS DI 容器,Guard 内部能 `@Inject(JwtService)` / `@Inject(Reflector)`;静态 `useGlobalGuards` 拿不到注入。

### 3.5 `@Public()` 装饰器的工作机制

```ts
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`JwtAuthGuard.canActivate` 用 `Reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, class])` 检查:

- handler 上有 `@Public` → 跳过校验
- class(整个 controller)上有 `@Public` → 整个 controller 免鉴权
- 都没有 → 走 JWT 校验

`getAllAndOverride` 比 `getAll` 多一层"handler 优先于 class"的合并语义,后续想做"controller 全免鉴权但某一个端点要鉴权"也支持。

## 4. DTO / 数据契约

### 4.1 LoginDto(新)

```ts
export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  handle!: string;
}
```

### 4.2 LoginResponse(类型,不是 class)

```ts
export interface LoginResponse {
  accessToken: string;
  user: { id: string; handle: string };
}
```

### 4.3 CreateDraftDto(改)

`authorId` 字段删除。其余不变。

### 4.4 JwtPayload(类型)

```ts
export interface JwtPayload {
  sub: string;
  handle: string;
  iat?: number;
  exp?: number;
}
```

## 5. 错误处理

| 场景                                     | HTTP         | 消息                                              |
| ---------------------------------------- | ------------ | ------------------------------------------------- |
| `/auth/login` handle 不存在              | 401          | `"user not found"`                                |
| `/auth/login` body 缺 handle             | 400          | DTO 校验自动                                      |
| 无 Authorization header                  | 401          | `"missing token"`                                 |
| token 格式错(非 Bearer)                  | 401          | `"invalid authorization header"`                  |
| token 过期                               | 401          | `"token expired"`(JWT lib 抛 `TokenExpiredError`) |
| token 签名错                             | 401          | `"invalid token"`                                 |
| `@CurrentUser()` 拿到的 sub 在 DB 不存在 | 不在本层校验 | (留给 1.5 加 `UserGuard`,本里程碑相信 token)      |

> 注:第七行的"token 通过校验但用户已被删"在生产是真问题,但 demo / e2e 不会出现——`User.deleteMany` 只在 fixture 工厂里跑。1.5 加 user 维护时再补 `UserGuard` 做"token sub 实在 DB 还在"的兜底。

## 6. e2e 改造策略

### 6.1 fixtures 不动

`DEMO_AUTHOR_ID = "demoauthor000000000000001"` + handle `"demo-author"` 已经在 1.3 落地。1.4 的 e2e 直接用现有 fixture 登录。

### 6.2 公用 helper:`loginAsDemo(app)`

`apps/api/test/helpers/auth.ts`(新):

```ts
export async function loginAsDemo(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ handle: "demo-author" })
    .expect(201);
  return (res.body as { accessToken: string }).accessToken;
}
```

`drafts.e2e-spec.ts` / `prompts.e2e-spec.ts` 在 `beforeAll` 里调一次拿到 token,后续所有 request `.set('Authorization', 'Bearer ' + token)`。

### 6.3 新增 `auth.e2e-spec.ts`

5 个用例:

1. POST /auth/login `{ handle: "demo-author" }` → 201,body 有 accessToken + user.{id,handle}
2. POST /auth/login `{ handle: "ghost" }` → 401(用户不存在)
3. POST /auth/login `{}` → 400(DTO 校验)
4. GET /drafts(无 token)→ 401
5. GET /drafts(伪造 token `Bearer foo.bar.baz`)→ 401

### 6.4 现有 e2e 调整

- `drafts.e2e-spec.ts` POST body 不再发 `authorId`(从 token 派生)
- 所有受保护端点 request 加 `Authorization` header
- `prompts.e2e-spec.ts` 不需要 token(Prompts 端点是 `@Public`)

## 7. 配置 / 依赖

### 7.1 新增依赖(apps/api)

- `@nestjs/jwt` ^10
- `jsonwebtoken` 是 transitive,不直接装

### 7.2 .env.example 增

```env
# JWT secret · 生产环境必须替换为强随机串(>= 32 字符)
JWT_SECRET=dev-secret-change-me-please
JWT_EXPIRES_IN=7d
```

### 7.3 AuthModule 配置示例

```ts
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow('JWT_SECRET'),
    signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
  }),
}),
```

## 8. 风险与回滚

| 风险                                                                   | 缓解                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Guard 全局注册后,忘加 `@Public` 的端点会一律 401(包括健康检查 `GET /`) | 实施时第一步就在 `AppController` 标 `@Public`;e2e 兜底:`auth.e2e` 第 4 用例若错过白名单会立刻红 |
| `JWT_SECRET` 没设导致启动失败                                          | `getOrThrow` 失败信息明确;README 同步更新启动指引                                               |
| 现有手动调过 `/drafts` 的脚本/curl 失败                                | 仅有作者一人本地用;不算回归                                                                     |
| token 拼写错误(`Bearer ` 漏空格)401 但调试困难                         | Guard 抛具体错误消息(missing/invalid format/expired/invalid)                                    |

回滚:本里程碑全部改动落在一个 commit,`git revert <hash>` 即可。fixture / schema 不动,数据无影响。

## 9. 成功标准

实施完成时下面六项全绿:

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 五连过(prettier 算第五连)
2. `pnpm --filter @bytedance-aigc/api test:e2e` 三个 spec(auth + drafts + prompts)全过,共 14 个用例
3. 手动 curl `POST /auth/login { handle: "demo-author" }` 返回 200 + token
4. 手动 curl `GET /drafts`(无 token)返回 401
5. 手动 curl `GET /drafts` Authorization: Bearer 上一步 token 返回 200
6. `apps/api/src/drafts/dto/create-draft.dto.ts` 中 `authorId` 字段已删除

## 10. 不在本里程碑做(1.5+)

- `GET /drafts/mine` 按当前用户过滤
- 用户管理(注册 / 改 handle / 删除)
- `UserGuard`:token sub 在 DB 实存校验
- 密码哈希 / 多种登录方式
- 前端登录页与 token 持久化(`apps/web` 的事)
- token 撤销 / 黑名单 / 单点登录踢人
