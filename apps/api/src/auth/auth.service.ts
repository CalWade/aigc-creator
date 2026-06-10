import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "./jwt-payload.interface";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { SendCodeDto } from "./dto/send-code.dto";

export interface LoginResult {
  accessToken: string;
  user: { id: string; handle: string };
}

interface AuditContext {
  ip?: string;
  userAgent?: string;
}

/**
 * 训练营 demo:验证码用进程内 Map 临时存,过期 5 分钟。
 * 生产应换 Redis;接口形态保持一致便于切换。
 */
const CODE_TTL_MS = 5 * 60 * 1000;
const FIXED_DEMO_CODE = "123456";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly codeStore = new Map<string, { code: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ---------- 登录 ----------

  async login(dto: LoginDto, ctx: AuditContext): Promise<LoginResult> {
    // 缺省 method 视为 handle,兼容 e2e helpers(loginAsDemo 等)发的 `{handle}` body
    const method = dto.method ?? "handle";
    if (method === "handle") {
      if (!dto.handle) throw new BadRequestException("handle 必填");
      return this.loginByHandle(dto.handle, ctx);
    }
    if (method === "phone") {
      if (!dto.phone || !dto.code) throw new BadRequestException("手机号与验证码必填");
      return this.loginByPhone(dto.phone, dto.code, ctx);
    }
    if (method === "email") {
      if (!dto.email || !dto.password) throw new BadRequestException("邮箱与密码必填");
      return this.loginByEmail(dto.email, dto.password, ctx);
    }
    throw new BadRequestException("未知 method");
  }

  private async loginByHandle(handle: string, ctx: AuditContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { handle } });
    if (!user) throw new UnauthorizedException("user not found");
    return this.issue(user, "handle", handle, ctx);
  }

  private async loginByPhone(phone: string, code: string, ctx: AuditContext): Promise<LoginResult> {
    this.consumeCode(phone, code);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new UnauthorizedException("user not found");
    return this.issue(user, "phone", phone, ctx);
  }

  private async loginByEmail(
    email: string,
    password: string,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) throw new UnauthorizedException("user not found");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("invalid credentials");
    return this.issue(user, "email", email, ctx);
  }

  // ---------- 注册 ----------

  async register(dto: RegisterDto, ctx: AuditContext): Promise<LoginResult> {
    if (dto.method === "phone") {
      if (!dto.phone || !dto.code) throw new BadRequestException("手机号与验证码必填");
      return this.registerByPhone(dto.phone, dto.code, dto.handle, ctx);
    }
    if (dto.method === "email") {
      if (!dto.email || !dto.password) throw new BadRequestException("邮箱与密码必填");
      return this.registerByEmail(dto.email, dto.password, dto.handle, ctx);
    }
    throw new BadRequestException("未知 method");
  }

  private async registerByPhone(
    phone: string,
    code: string,
    desiredHandle: string | undefined,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    this.consumeCode(phone, code);
    const exist = await this.prisma.user.findUnique({ where: { phone } });
    if (exist) throw new ConflictException("该手机号已注册");
    const handle = await this.allocateHandle(desiredHandle ?? `u_${phone.slice(-6)}`);
    const user = await this.prisma.user.create({
      data: { handle, phone },
    });
    return this.issue(user, "phone", phone, ctx, "REGISTER");
  }

  private async registerByEmail(
    email: string,
    password: string,
    desiredHandle: string | undefined,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    const normalized = email.toLowerCase();
    const exist = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (exist) throw new ConflictException("该邮箱已注册");
    const passwordHash = await bcrypt.hash(password, 10);
    const handle = await this.allocateHandle(desiredHandle ?? normalized.split("@")[0]);
    const user = await this.prisma.user.create({
      data: { handle, email: normalized, passwordHash },
    });
    return this.issue(user, "email", normalized, ctx, "REGISTER");
  }

  /**
   * handle 冲突时追加数字后缀,最多重试 8 次。
   * 仅做基本字符兜底,DTO 已限格式。
   */
  private async allocateHandle(seed: string): Promise<string> {
    const base = seed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `user${Date.now() % 1e6}`;
    for (let i = 0; i < 8; i += 1) {
      const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 10000)}`;
      const taken = await this.prisma.user.findUnique({ where: { handle: candidate } });
      if (!taken) return candidate;
    }
    throw new ConflictException("handle 冲突过多,稍后重试");
  }

  // ---------- 验证码 ----------

  async sendCode(dto: SendCodeDto): Promise<{ ok: true; ttlSeconds: number; demoCode: string }> {
    const expiresAt = Date.now() + CODE_TTL_MS;
    this.codeStore.set(dto.phone, { code: FIXED_DEMO_CODE, expiresAt });
    this.logger.log(
      `[demo] send-code phone=${dto.phone} scene=${dto.scene} code=${FIXED_DEMO_CODE}`,
    );
    void this.writeAudit({
      type: "SEND_CODE",
      method: dto.scene,
      identity: dto.phone,
      ip: undefined,
      userAgent: undefined,
    });
    return { ok: true, ttlSeconds: Math.floor(CODE_TTL_MS / 1000), demoCode: FIXED_DEMO_CODE };
  }

  private consumeCode(phone: string, code: string): void {
    const entry = this.codeStore.get(phone);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException("验证码已过期,请重新获取");
    }
    if (entry.code !== code) {
      throw new UnauthorizedException("验证码不正确");
    }
    this.codeStore.delete(phone);
  }

  // ---------- 登出 / Audit ----------

  async logout(userId: string | null, ctx: AuditContext): Promise<{ ok: true }> {
    await this.writeAudit({
      type: "LOGOUT",
      userId,
      method: "jwt",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true };
  }

  // ---------- 内部:签发 token + 写 audit ----------

  private async issue(
    user: { id: string; handle: string },
    method: string,
    identity: string,
    ctx: AuditContext,
    type: "LOGIN" | "REGISTER" = "LOGIN",
  ): Promise<LoginResult> {
    const payload: Pick<JwtPayload, "sub" | "handle"> = { sub: user.id, handle: user.handle };
    const accessToken = await this.jwtService.signAsync(payload);
    void this.writeAudit({
      type,
      userId: user.id,
      method,
      identity,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { accessToken, user: { id: user.id, handle: user.handle } };
  }

  private async writeAudit(input: {
    type: "LOGIN" | "REGISTER" | "LOGOUT" | "SEND_CODE";
    userId?: string | null;
    method?: string;
    identity?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.authEvent.create({
        data: {
          type: input.type,
          userId: input.userId ?? null,
          method: input.method ?? null,
          identity: input.identity ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      // audit 写失败不应影响登录主流程;仅 warn
      this.logger.warn(`audit write failed: ${(err as Error).message}`);
    }
  }

  // ---------- 兼容旧签名(给 e2e/单测留个 happy path)----------
  validateAndIssue(handle: string): Promise<LoginResult> {
    return this.loginByHandle(handle, {});
  }
}
