import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { AuthService, type LoginResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { SendCodeDto } from "./dto/send-code.dto";
import type { JwtPayload } from "./jwt-payload.interface";
import { Public } from "./public.decorator";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResult> {
    return this.authService.login(dto, ctxOf(req));
  }

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<LoginResult> {
    return this.authService.register(dto, ctxOf(req));
  }

  @Public()
  @Post("send-code")
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() dto: SendCodeDto): Promise<{ ok: true; ttlSeconds: number; demoCode: string }> {
    return this.authService.sendCode(dto);
  }

  /**
   * 登出:JWT 无状态,后端不做黑名单(成本/收益不划算)。
   * 仅做 audit log 记录;前端清 token 才是真正"登出"。
   * 不带 token / token 无效也允许调用,确保前端登出按钮永远成功。
   */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request): Promise<{ ok: true }> {
    let userId: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      try {
        const decoded = await this.jwtService.verifyAsync<JwtPayload>(token);
        userId = decoded.sub;
      } catch {
        // 过期/无效 token 也允许登出,直接 audit 一条匿名 LOGOUT
      }
    }
    return this.authService.logout(userId, ctxOf(req));
  }
}

function ctxOf(req: Request): { ip?: string; userAgent?: string } {
  const ip = (req.ip ?? req.socket?.remoteAddress) || undefined;
  const ua = req.headers["user-agent"];
  return { ip, userAgent: typeof ua === "string" ? ua.slice(0, 500) : undefined };
}
