import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { AdminGuard } from "./admin.guard";

function makeCtx(user?: JwtPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("AdminGuard", () => {
  const ORIGINAL_ENV = process.env.ADMIN_HANDLES;
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  afterAll(() => {
    process.env.ADMIN_HANDLES = ORIGINAL_ENV;
  });

  it("白名单命中 → 放行", () => {
    process.env.ADMIN_HANDLES = "admin,super";
    const ctx = makeCtx({ sub: "u-admin", handle: "admin" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("白名单不含 → 抛 ForbiddenException 且 code=ADMIN_REQUIRED", () => {
    process.env.ADMIN_HANDLES = "admin";
    const ctx = makeCtx({ sub: "u-1", handle: "demo-author" });
    try {
      guard.canActivate(ctx);
      fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const resp = (err as ForbiddenException).getResponse() as { code?: string };
      expect(resp.code).toBe("ADMIN_REQUIRED");
    }
  });

  it("req.user 缺失 → 抛 UnauthorizedException", () => {
    process.env.ADMIN_HANDLES = "admin";
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(UnauthorizedException);
  });

  it("env 缺失或空白 → 拒绝所有人(空白名单 = 全拒)", () => {
    process.env.ADMIN_HANDLES = "";
    const ctx = makeCtx({ sub: "u-admin", handle: "admin" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);

    delete process.env.ADMIN_HANDLES;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("逗号分隔 trim 容错:'  admin , super ' 中 admin 命中", () => {
    process.env.ADMIN_HANDLES = "  admin , super ";
    const ctx = makeCtx({ sub: "u-admin", handle: "admin" });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
