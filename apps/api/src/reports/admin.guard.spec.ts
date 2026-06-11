import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { AdminGuard } from "./admin.guard";

function makeCtx(user?: Partial<JwtPayload>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("AdminGuard", () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it("role === ADMIN → 放行", () => {
    const ctx = makeCtx({ sub: "u-admin", handle: "admin", role: "ADMIN" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("role === AUTHOR → 抛 ForbiddenException 且 code=ADMIN_REQUIRED", () => {
    const ctx = makeCtx({ sub: "u-1", handle: "demo-author", role: "AUTHOR" });
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
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(UnauthorizedException);
  });

  it("老 token 兼容:payload 无 role 字段 → fail-closed 拒绝(视同非 ADMIN)", () => {
    // 升级前签发的 JWT payload 只有 sub+handle,role 字段为 undefined
    const ctx = makeCtx({ sub: "u-admin", handle: "admin" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
