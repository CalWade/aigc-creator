import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { JwtPayload } from "./jwt-payload.interface";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers["authorization"];
    if (!header) {
      throw new UnauthorizedException("missing token");
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("invalid authorization header");
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
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
