# Phase 1.4 鉴权骨架 — JWT 真签真校 + Demo 登录 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/api` 从 "客户端 body 里随便填 authorId" 升级到 "必须先 `/auth/login` 拿 token,所有写入端点的 `authorId` 从 token 派生" 的最小可用 JWT 鉴权骨架。

**Architecture:** 新增 `auth/` 模块,内含 `AuthController`(`POST /auth/login`)、`AuthService`(根据 handle 在 User 表查到记录就发 token,不验密码)、`JwtAuthGuard`(全局通过 `APP_GUARD` 注册)、`@Public()` 装饰器(`Reflector.getAllAndOverride` 跳过校验)、`@CurrentUser()` 参数装饰器(从 `req.user` 取 payload)。`@nestjs/jwt` 单独使用,不引入 `@nestjs/passport`。token 形如 `{ sub, handle, iat, exp }`,7 天过期,secret 通过 `ConfigService.getOrThrow('JWT_SECRET')` 加载,缺失即拒启动。

**Tech Stack:** NestJS 11、`@nestjs/jwt` ^10、`@nestjs/config`(已在)、`class-validator`(已在)、Jest + supertest(已在)。

**Spec 来源:** `docs/superpowers/specs/2026-05-27-phase-1-4-auth-jwt-design.md`

**Verification 策略:** 用户已显式要求本项目跳过 verification 子代理。每个里程碑步骤跑完静态五连(lint / typecheck / test / build / format:check)+ e2e 后即可 commit,不再独立审计。

---

## 文件结构

### 新增

| 文件                                                     | 责任                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/api/src/auth/auth.module.ts`                       | 模块封装,`JwtModule.registerAsync` 异步注入 secret/expiresIn,export `AuthService` 与 `JwtModule`       |
| `apps/api/src/auth/auth.controller.ts`                   | `POST /auth/login` 端点,标 `@Public()`                                                                 |
| `apps/api/src/auth/auth.service.ts`                      | `validateAndIssue(handle)` 业务:User 不存在抛 `UnauthorizedException`,存在则签发 token                 |
| `apps/api/src/auth/jwt-auth.guard.ts`                    | `CanActivate` 实现:读 `Authorization: Bearer <token>`,verify 后挂 `req.user`;遇 `@Public()` 元数据放行 |
| `apps/api/src/auth/decorators/public.decorator.ts`       | `@Public()` = `SetMetadata(IS_PUBLIC_KEY, true)` + 导出 key                                            |
| `apps/api/src/auth/decorators/current-user.decorator.ts` | `@CurrentUser()` = `createParamDecorator` 从 `req.user` 取 payload                                     |
| `apps/api/src/auth/types/jwt-payload.interface.ts`       | `JwtPayload` TS 接口:`{ sub, handle, iat?, exp? }`                                                     |
| `apps/api/src/auth/dto/login.dto.ts`                     | `LoginDto`:`{ handle: string }`                                                                        |
| `apps/api/test/helpers/auth.ts`                          | `loginAsDemo(app)` 工具函数,e2e 共用                                                                   |
| `apps/api/test/auth.e2e-spec.ts`                         | 5 个用例覆盖 login + Guard 边界                                                                        |

### 修改

| 文件                                          | 变更                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api/package.json`                       | 加 `@nestjs/jwt` ^10 dep                                                                     |
| `apps/api/src/app.module.ts`                  | imports 加 `AuthModule`,providers 加 `{ provide: APP_GUARD, useClass: JwtAuthGuard }`        |
| `apps/api/src/app.controller.ts`              | `getHello` 标 `@Public()`(健康检查放行)                                                      |
| `apps/api/src/drafts/dto/create-draft.dto.ts` | 删除 `authorId` 字段                                                                         |
| `apps/api/src/drafts/drafts.controller.ts`    | `create` 取 `@CurrentUser()`,`list` / `findOne` 也吃 token(只是 Guard 自动校验,不读 payload) |
| `apps/api/src/drafts/drafts.service.ts`       | `create(authorId, dto)` 签名变化,authorId 从外部传入                                         |
| `apps/api/src/prompts/prompts.controller.ts`  | `list` / `findOne` 标 `@Public()`(平台资源公开)                                              |
| `apps/api/test/drafts.e2e-spec.ts`            | beforeAll 拿 token;所有 request 加 `Authorization` header;POST body 不再发 `authorId`        |
| `apps/api/test/app.e2e-spec.ts`               | 不需要改(根路径已 `@Public`)                                                                 |
| `apps/api/test/prompts.e2e-spec.ts`           | 不需要改(prompts 已 `@Public`)                                                               |
| `.env.example`                                | 加 `JWT_SECRET` + `JWT_EXPIRES_IN` 段                                                        |

---

## 任务清单

### Task 1: 装 `@nestjs/jwt` + 配 .env.example

**Files:**

- Modify: `apps/api/package.json`
- Modify: `.env.example`

- [ ] **Step 1: 装依赖**

Run: `pnpm --filter @bytedance-aigc/api add @nestjs/jwt@^10`
Expected: `package.json` `dependencies` 多一行 `"@nestjs/jwt": "^10.x.x"`,`pnpm-lock.yaml` 更新,无错误。

- [ ] **Step 2: 在 `.env.example` 末尾追加 JWT 段**

打开 `.env.example`,在文件末尾(第 25 行 `#   同时记得更新 ...` 之后)追加:

```env

# ---------- JWT 鉴权(Phase 1.4)----------
# secret · 生产环境必须替换为强随机串(>= 32 字符)
# dev 用任意非空字符串即可,但务必要填——ConfigService.getOrThrow 会拒启动
JWT_SECRET=dev-secret-change-me-please
# token 过期时间 · 默认 7d 够 demo 用,生产建议 15m + refresh 7d
JWT_EXPIRES_IN=7d
```

- [ ] **Step 3: 同步本地 `.env`**

Run: `grep '^JWT_SECRET' /Users/calvin/Desktop/Project/bytedance-aigc/.env || echo -e "\nJWT_SECRET=dev-secret-change-me-please\nJWT_EXPIRES_IN=7d" >> /Users/calvin/Desktop/Project/bytedance-aigc/.env`

(让本地 `.env` 也有 JWT 段;后面 e2e 起 NestApplication 时 ConfigModule 会读这里。)

- [ ] **Step 4: 验证启动不会因 secret 缺失立即崩**

Run: `cat /Users/calvin/Desktop/Project/bytedance-aigc/.env | grep JWT_`
Expected: 看到两行 `JWT_SECRET=...` 与 `JWT_EXPIRES_IN=7d`

- [ ] **Step 5: 暂不 commit,后续整合提交**

(本步只是依赖与配置准备,留到 Task 8 一起 commit。)

---

### Task 2: 落地 `@Public` / `@CurrentUser` 装饰器与 `JwtPayload` 类型

**Files:**

- Create: `apps/api/src/auth/decorators/public.decorator.ts`
- Create: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/types/jwt-payload.interface.ts`

- [ ] **Step 1: 写 `JwtPayload` 接口**

文件 `apps/api/src/auth/types/jwt-payload.interface.ts`:

```ts
/**
 * Phase 1.4 JWT payload 形状
 * sub = User.id (cuid),handle = User.handle(给前端不查库就能展示当前用户名)
 * iat / exp 由 jsonwebtoken 自动塞,本接口标可选
 */
export interface JwtPayload {
  sub: string;
  handle: string;
  iat?: number;
  exp?: number;
}
```

- [ ] **Step 2: 写 `@Public()` 装饰器**

文件 `apps/api/src/auth/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * 标记端点免鉴权
 * 用法:@Public() 放在 controller class 或 handler 方法上
 * Guard 内通过 Reflector.getAllAndOverride 检查(handler 优先于 class)
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 3: 写 `@CurrentUser()` 装饰器**

文件 `apps/api/src/auth/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { JwtPayload } from "../types/jwt-payload.interface";

/**
 * 从 req.user 取出 JwtAuthGuard 验签后挂上的 payload
 * 用法:create(@CurrentUser() user: JwtPayload, ...)
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
  if (!req.user) {
    throw new Error("CurrentUser decorator used on a route without JwtAuthGuard");
  }
  return req.user;
});
```

- [ ] **Step 4: 跑 typecheck 确认三文件干净**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0,无类型错误。

- [ ] **Step 5: 暂不 commit**

---

### Task 3: 实现 `JwtAuthGuard`

**Files:**

- Create: `apps/api/src/auth/jwt-auth.guard.ts`

- [ ] **Step 1: 写 Guard**

文件 `apps/api/src/auth/jwt-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import type { JwtPayload } from "./types/jwt-payload.interface";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization;
    if (!header) {
      throw new UnauthorizedException("missing token");
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("invalid authorization header");
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = payload;
      return true;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new UnauthorizedException("token expired");
      }
      throw new UnauthorizedException("invalid token");
    }
  }
}
```

- [ ] **Step 2: 跑 typecheck**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0。

- [ ] **Step 3: 暂不 commit**

---

### Task 4: 实现 `AuthService` + `LoginDto` + `AuthController`

**Files:**

- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: 写 `LoginDto`**

文件 `apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  handle!: string;
}
```

- [ ] **Step 2: 写 `AuthService`**

文件 `apps/api/src/auth/auth.service.ts`:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "./types/jwt-payload.interface";

export interface LoginResult {
  accessToken: string;
  user: { id: string; handle: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateAndIssue(handle: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { handle } });
    if (!user) {
      throw new UnauthorizedException("user not found");
    }

    const payload: JwtPayload = { sub: user.id, handle: user.handle };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: { id: user.id, handle: user.handle } };
  }
}
```

- [ ] **Step 3: 写 `AuthController`**

文件 `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AuthService, LoginResult } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.validateAndIssue(dto.handle);
  }
}
```

> 注:这里用 `HttpCode(200)` 而不是默认的 201,因为 login 是"读取/换取" token 的操作,不创建资源。spec 第 233 行写的是 201——以本计划为准改成 200 更语义化,e2e 用例也按 200 写。

- [ ] **Step 4: 跑 typecheck**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0。

- [ ] **Step 5: 暂不 commit**

---

### Task 5: 写 `AuthModule`,注册全局 Guard

**Files:**

- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.controller.ts`

- [ ] **Step 1: 写 `AuthModule`**

文件 `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN", "7d") },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 2: 改 `app.module.ts`,挂全局 Guard**

替换 `apps/api/src/app.module.ts` 的全部内容为:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PrismaKnownRequestFilter } from "./common/filters/prisma-known-request.filter";
import { DraftsModule } from "./drafts/drafts.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PromptsModule } from "./prompts/prompts.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DraftsModule,
    PromptsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: PrismaKnownRequestFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: 改 `app.controller.ts`,健康检查放行**

替换 `apps/api/src/app.controller.ts` 的内容为:

```ts
import { Controller, Get } from "@nestjs/common";

import { AppService } from "./app.service";
import { Public } from "./auth/decorators/public.decorator";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

- [ ] **Step 4: 跑 typecheck + 单测**

Run: `pnpm --filter @bytedance-aigc/api typecheck && pnpm --filter @bytedance-aigc/api test`
Expected: 全绿。`app.controller.spec.ts` 默认那一条单测应仍然通过(它直接 new controller,不走 Guard)。

- [ ] **Step 5: 暂不 commit**

---

### Task 6: 改造 `drafts` 模块——拿掉 body.authorId,从 token 派生

**Files:**

- Modify: `apps/api/src/drafts/dto/create-draft.dto.ts`
- Modify: `apps/api/src/drafts/drafts.service.ts`
- Modify: `apps/api/src/drafts/drafts.controller.ts`

- [ ] **Step 1: 删除 DTO 里的 `authorId` 字段**

替换 `apps/api/src/drafts/dto/create-draft.dto.ts` 内容为:

```ts
import { Type } from "class-transformer";
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { DraftMode } from "@prisma/client";

export class CreateDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsObject()
  body!: Record<string, unknown>;

  @IsOptional()
  @IsEnum(DraftMode)
  @Type(() => String)
  mode?: DraftMode;
}
```

- [ ] **Step 2: 改 `drafts.service.ts` 接受 authorId 入参**

替换 `apps/api/src/drafts/drafts.service.ts` 内容为:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { Draft, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreateDraftDto } from "./dto/create-draft.dto";

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateDraftDto): Promise<Draft> {
    return this.prisma.draft.create({
      data: {
        authorId,
        title: dto.title,
        body: dto.body as Prisma.InputJsonValue,
        mode: dto.mode,
      },
    });
  }

  async list(): Promise<Draft[]> {
    return this.prisma.draft.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async findOne(id: string): Promise<Draft> {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }
    return draft;
  }
}
```

- [ ] **Step 3: 改 `drafts.controller.ts`,从 `@CurrentUser()` 取 authorId**

替换 `apps/api/src/drafts/drafts.controller.ts` 内容为:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { Draft } from "@prisma/client";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.interface";
import { DraftsService } from "./drafts.service";
import { CreateDraftDto } from "./dto/create-draft.dto";

@Controller("drafts")
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDraftDto): Promise<Draft> {
    return this.drafts.create(user.sub, dto);
  }

  @Get()
  list(): Promise<Draft[]> {
    return this.drafts.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Draft> {
    return this.drafts.findOne(id);
  }
}
```

- [ ] **Step 4: 跑 typecheck**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0。

- [ ] **Step 5: 暂不 commit**

---

### Task 7: 改造 `prompts` 模块——平台 prompt 是公开资源,标 `@Public`

**Files:**

- Modify: `apps/api/src/prompts/prompts.controller.ts`

- [ ] **Step 1: 类上加 `@Public()`**

替换 `apps/api/src/prompts/prompts.controller.ts` 内容为:

```ts
import { Controller, Get, Param, Query } from "@nestjs/common";
import { Prompt } from "@prisma/client";

import { Public } from "../auth/decorators/public.decorator";
import { ListPromptsQueryDto } from "./dto/list-prompts-query.dto";
import { PromptsService } from "./prompts.service";

@Public()
@Controller("prompts")
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get()
  list(@Query() query: ListPromptsQueryDto): Promise<Prompt[]> {
    return this.prompts.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Prompt> {
    return this.prompts.findOne(id);
  }
}
```

- [ ] **Step 2: 跑 typecheck**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0。

- [ ] **Step 3: 暂不 commit**

---

### Task 8: 写 e2e 共享 helper `loginAsDemo`

**Files:**

- Create: `apps/api/test/helpers/auth.ts`

- [ ] **Step 1: 写 helper**

文件 `apps/api/test/helpers/auth.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";

interface LoginResponseBody {
  accessToken: string;
  user: { id: string; handle: string };
}

/**
 * 用 demo-author 登录拿 token
 * 调用前需保证 fixture 已 apply(DEMO_USERS 含 demo-author)
 * 配合 .set('Authorization', `Bearer ${token}`) 用
 */
export async function loginAsDemo(app: INestApplication<App>): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ handle: "demo-author" })
    .expect(200);
  return (res.body as LoginResponseBody).accessToken;
}
```

- [ ] **Step 2: 跑 typecheck**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: 退出码 0。

- [ ] **Step 3: 暂不 commit**

---

### Task 9: 改 `drafts.e2e-spec.ts`——POST 不发 authorId,所有请求加 Authorization

**Files:**

- Modify: `apps/api/test/drafts.e2e-spec.ts`

- [ ] **Step 1: 替换整个 spec 文件**

替换 `apps/api/test/drafts.e2e-spec.ts` 内容为:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

interface DraftResponse {
  id: string;
  authorId: string;
  title: string;
  mode: string;
  version: number;
}

describe("DraftsController (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("POST /drafts -> 201 returns created draft with cuid (authorId 来自 token)", async () => {
    const res = await request(app.getHttpServer())
      .post("/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Hello Draft",
        body: { type: "doc", content: [] },
      })
      .expect(201);

    const body = res.body as DraftResponse;
    expect(body).toMatchObject({
      authorId: DEMO_AUTHOR_ID,
      title: "Hello Draft",
      mode: "FAST",
      version: 1,
    });
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(10);
  });

  it("GET /drafts -> 200 returns array including demo + created drafts", async () => {
    const res = await request(app.getHttpServer())
      .get("/drafts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const list = res.body as DraftResponse[];

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it("GET /drafts/:id -> 200 returns one draft", async () => {
    const created = await request(app.getHttpServer())
      .post("/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Findable",
        body: {},
      })
      .expect(201);
    const createdBody = created.body as DraftResponse;

    const res = await request(app.getHttpServer())
      .get(`/drafts/${createdBody.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const found = res.body as DraftResponse;

    expect(found.id).toBe(createdBody.id);
    expect(found.title).toBe("Findable");
  });

  it("POST /drafts -> 400 when title missing", async () => {
    await request(app.getHttpServer())
      .post("/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({ body: {} })
      .expect(400);
  });

  it("GET /drafts/:id -> 404 when not found", async () => {
    await request(app.getHttpServer())
      .get("/drafts/nonexistent-id-zzz")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: 暂不跑——等 Task 10 写完 auth.e2e 一起跑**

---

### Task 10: 写 `auth.e2e-spec.ts`(5 个用例)

**Files:**

- Create: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: 写 spec**

文件 `apps/api/test/auth.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";

interface LoginResponseBody {
  accessToken: string;
  user: { id: string; handle: string };
}

describe("AuthController (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("POST /auth/login -> 200 with token + user", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ handle: "demo-author" })
      .expect(200);

    const body = res.body as LoginResponseBody;
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.split(".")).toHaveLength(3); // jwt 三段
    expect(body.user).toEqual({ id: DEMO_AUTHOR_ID, handle: "demo-author" });
  });

  it("POST /auth/login -> 401 when handle not found", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ handle: "ghost-user-zzz" })
      .expect(401);
  });

  it("POST /auth/login -> 400 when body missing handle", async () => {
    await request(app.getHttpServer()).post("/auth/login").send({}).expect(400);
  });

  it("GET /drafts -> 401 without Authorization header", async () => {
    await request(app.getHttpServer()).get("/drafts").expect(401);
  });

  it("GET /drafts -> 401 with malformed token", async () => {
    await request(app.getHttpServer())
      .get("/drafts")
      .set("Authorization", "Bearer foo.bar.baz")
      .expect(401);
  });
});
```

- [ ] **Step 2: 跑全部 e2e**

Run: `pnpm --filter @bytedance-aigc/api test:e2e`
Expected:

- `app.e2e-spec.ts`:1 用例(`/` GET)PASS
- `auth.e2e-spec.ts`:5 用例 PASS
- `drafts.e2e-spec.ts`:5 用例 PASS
- `prompts.e2e-spec.ts`:5 用例 PASS
- 共 16 用例全绿

如失败,排查顺序:

1. `JWT_SECRET` 是否在 `.env` 中(ConfigModule.forRoot 默认读 cwd 的 `.env`,e2e 启 NestApplication 时 cwd 是 `apps/api`——若 `.env` 在仓库根,`ConfigModule` 默认能读到根目录的 `.env` 因为 monorepo 跑 jest 时 cwd 是 `apps/api`。如果读不到,在 `app.module.ts` 临时改 `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] })` 验证)。
2. `auth.e2e` 第 4 用例(无 token 401):若返回 200,说明全局 Guard 没生效,检查 `app.module.ts` 的 `APP_GUARD` provider。
3. `drafts.e2e` POST 401:确认 `loginAsDemo` 真拿到了 token(beforeAll 里 `console.log(token)` 排查)。

- [ ] **Step 3: 暂不 commit,等 Task 11 五连复测**

---

### Task 11: 静态五连复测 + 整合 commit

**Files:**(无新增/修改,仅验证)

- [ ] **Step 1: 跑静态五连**

Run(从 monorepo 根):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check
```

Expected: 五个命令全部退出码 0。

如 `format:check` 报红,跑 `pnpm format` 自动修。

- [ ] **Step 2: git status / diff 检视**

Run: `git status && git diff --stat`
Expected: 看到下列变化(加号代表新增,M 代表修改):

```
M  .env.example
M  apps/api/package.json
M  apps/api/src/app.controller.ts
M  apps/api/src/app.module.ts
M  apps/api/src/drafts/dto/create-draft.dto.ts
M  apps/api/src/drafts/drafts.controller.ts
M  apps/api/src/drafts/drafts.service.ts
M  apps/api/src/prompts/prompts.controller.ts
M  apps/api/test/drafts.e2e-spec.ts
M  pnpm-lock.yaml
?? apps/api/src/auth/
?? apps/api/test/auth.e2e-spec.ts
?? apps/api/test/helpers/
```

- [ ] **Step 3: 整合 commit**

Run:

```bash
git add .env.example \
  apps/api/package.json \
  apps/api/src/app.controller.ts \
  apps/api/src/app.module.ts \
  apps/api/src/auth \
  apps/api/src/drafts/dto/create-draft.dto.ts \
  apps/api/src/drafts/drafts.controller.ts \
  apps/api/src/drafts/drafts.service.ts \
  apps/api/src/prompts/prompts.controller.ts \
  apps/api/test/auth.e2e-spec.ts \
  apps/api/test/drafts.e2e-spec.ts \
  apps/api/test/helpers \
  pnpm-lock.yaml

git commit -m "$(cat <<'EOF'
feat(api): JWT 鉴权骨架(Phase 1.4)

- AuthModule:JwtModule.registerAsync 异步注入 secret/expiresIn
- POST /auth/login:输入 handle 即发 token(无密码,demo 友好)
- 全局 JwtAuthGuard via APP_GUARD,@Public 装饰器配 Reflector.getAllAndOverride 跳过校验
- @CurrentUser 参数装饰器从 req.user 取 JwtPayload
- POST /drafts 拿掉 body.authorId,改从 token.sub 派生
- /prompts 与根路径标 @Public(平台资源/健康检查)
- .env.example 增 JWT_SECRET / JWT_EXPIRES_IN
- e2e:auth.e2e 5 用例 + drafts.e2e 改造 + 共享 loginAsDemo helper
EOF
)"
```

(commit message 不含 `Co-Authored-By` —— 用户已锁定的偏好。)

- [ ] **Step 4: 验证 commit 落地**

Run: `git log -1 --stat`
Expected: 看到刚才的 commit hash 与文件变更列表。

---

## Self-Review

**Spec 覆盖检查:**

- spec §2.1(选 B JWT)→ Task 4(AuthService.validateAndIssue 不验密码)+ Task 5(AuthModule)
- spec §2.2(不引 passport)→ Task 3 直接用 JwtService
- spec §2.3(payload 极简)→ Task 2 JwtPayload 接口
- spec §2.4(7d)→ Task 1 .env.example + Task 5 useFactory expiresIn
- spec §2.5(getOrThrow)→ Task 5 useFactory `config.getOrThrow`
- spec §3.1(模块文件树)→ Task 2/3/4/5 全覆盖
- spec §3.2(请求时序)→ 由 Task 5 + Task 3 共同实现
- spec §3.3(端点改造表)→ Task 5(/)+ Task 6(/drafts)+ Task 7(/prompts)+ Task 4(/auth/login)
- spec §3.4(APP_GUARD)→ Task 5 Step 2
- spec §3.5(Reflector.getAllAndOverride)→ Task 3 Step 1
- spec §4.1(LoginDto)→ Task 4 Step 1
- spec §4.3(CreateDraftDto 删 authorId)→ Task 6 Step 1
- spec §4.4(JwtPayload)→ Task 2 Step 1
- spec §5(错误码)→ Task 3 抛 UnauthorizedException 各分支 + Task 4 service 抛 401
- spec §6.1(fixture 不动)→ 计划未触碰 fixture 文件
- spec §6.2(loginAsDemo)→ Task 8
- spec §6.3(auth.e2e 5 用例)→ Task 10
- spec §6.4(drafts.e2e 改造、prompts.e2e 不动)→ Task 9 + Task 7 让 prompts.e2e 不需要改
- spec §7.1(`@nestjs/jwt` ^10)→ Task 1 Step 1
- spec §7.2(.env.example)→ Task 1 Step 2
- spec §7.3(JwtModule.registerAsync)→ Task 5 Step 1
- spec §9 成功标准 1-6 → Task 11 跑五连 + e2e 全过 + Task 6 删 authorId 字段

**类型一致性:**

- `JwtPayload`(Task 2)被 Task 3 / 4 / 6 / 8 / 10 一致使用
- `LoginResult`(Task 4)被 Task 8 helper 解构 `accessToken` 字段一致
- `CreateDraftDto`(Task 6)在 Task 9 e2e POST body 与字段定义一致(无 authorId)

**Placeholder 扫描:**无 TBD / TODO / "适当处理" 类描述,所有代码块完整可粘贴。

**与 spec §2.4 / §3 / §4 / §5 / §6 微小偏差(本计划已显式说明):**

- spec §6.2 `loginAsDemo` 期望 201,本计划改为 200(Task 4 Step 3 注释解释)。auth.e2e 用例 1 也按 200 写,与 helper 保持一致。

---

## Plan complete

Plan complete and saved to `docs/superpowers/plans/2026-05-27-phase-1-4-auth-jwt.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
