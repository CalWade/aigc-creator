import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "./jwt-payload.interface";

@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!req.user) {
      throw new UnauthorizedException("UserGuard requires JwtAuthGuard upstream");
    }
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) {
      throw new UnauthorizedException("user no longer exists");
    }
    return true;
  }
}
