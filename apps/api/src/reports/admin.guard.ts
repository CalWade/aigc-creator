import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt-payload.interface";

/**
 * RBAC mini — admin 鉴权。
 * 依赖 UserGuard 已把 JwtPayload 放 req.user;@UseGuards 顺序必须 (UserGuard, AdminGuard)。
 * 权限源:JWT payload.role(数据库 User.role 字段同源)。fail-closed:role 缺失/非 ADMIN 一律拒绝。
 *
 * 老 token 兼容:升级前签发的 JWT payload 没有 role 字段 → undefined !== "ADMIN" → 403,
 * 用户需重新登录才能拿到带 role 的新 token。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user) throw new UnauthorizedException();
    if (req.user.role !== "ADMIN") {
      throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "需要 admin 权限" });
    }
    return true;
  }
}
