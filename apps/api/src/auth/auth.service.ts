import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "./jwt-payload.interface";

export interface LoginResult {
  accessToken: string;
  user: { id: string; handle: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateAndIssue(handle: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { handle } });
    if (!user) {
      throw new UnauthorizedException("user not found");
    }

    const payload: Pick<JwtPayload, "sub" | "handle"> = {
      sub: user.id,
      handle: user.handle,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: { id: user.id, handle: user.handle },
    };
  }
}
