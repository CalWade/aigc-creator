import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { AuthService, type LoginResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { SendCodeDto } from "./dto/send-code.dto";
import { SendEmailCodeDto } from "./dto/send-email-code.dto";
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
  sendCode(@Body() dto: SendCodeDto): Promise<{ ok: true; ttlSeconds: number; demoCode?: string }> {
    return this.authService.sendCode(dto);
  }

  @Public()
  @Post("send-email-code")
  @HttpCode(HttpStatus.OK)
  sendEmailCode(
    @Body() dto: SendEmailCodeDto,
  ): Promise<{ ok: true; ttlSeconds: number; demoCode?: string }> {
    return this.authService.sendEmailCode(dto.email, dto.scene);
  }

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
        // 过期/无效 token 也允许登出
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
