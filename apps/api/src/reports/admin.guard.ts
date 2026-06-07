import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt-payload.interface";

/**
 * Phase 2.6 — admin 鉴权。
 * 依赖 UserGuard 已把 JwtPayload 放 req.user;@UseGuards 顺序必须 (UserGuard, AdminGuard)。
 * 白名单走 env ADMIN_HANDLES(逗号分隔 handle);空白名单拒绝所有人。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user) throw new UnauthorizedException();

    const allow = (process.env.ADMIN_HANDLES ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

    if (!allow.includes(req.user.handle)) {
      throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "需要 admin 权限" });
    }
    return true;
  }
}
