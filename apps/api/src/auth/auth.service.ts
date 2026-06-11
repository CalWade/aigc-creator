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
import { CodeStoreService } from "./code-store.service";
import { SmsService } from "./sms.service";
import { MailService } from "./mail.service";

export interface LoginResult {
  accessToken: string;
  user: { id: string; handle: string; role: "AUTHOR" | "ADMIN" };
}

interface AuditContext {
  ip?: string;
  userAgent?: string;
}

const CODE_TTL_SECONDS = 300; // 5 min

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly codeStore: CodeStoreService,
    private readonly sms: SmsService,
    private readonly mail: MailService,
  ) {}

  // ---------- 登录 ----------

  async login(dto: LoginDto, ctx: AuditContext): Promise<LoginResult> {
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
    if (method === "email_code") {
      if (!dto.email || !dto.code) throw new BadRequestException("邮箱与验证码必填");
      return this.loginByEmailCode(dto.email, dto.code, ctx);
    }
    throw new BadRequestException("未知 method");
  }

  private async loginByHandle(handle: string, ctx: AuditContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { handle } });
    if (!user) throw new UnauthorizedException("user not found");
    return this.issue(user, "handle", handle, ctx);
  }

  private async loginByPhone(phone: string, code: string, ctx: AuditContext): Promise<LoginResult> {
    await this.consumeCode(`phone:${phone}`, code);
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

  private async loginByEmailCode(
    email: string,
    code: string,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    const normalized = email.toLowerCase();
    await this.consumeCode(`email:login:${normalized}`, code);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) throw new UnauthorizedException("user not found");
    return this.issue(user, "email_code", normalized, ctx);
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
    if (dto.method === "email_code") {
      if (!dto.email || !dto.code) throw new BadRequestException("邮箱与验证码必填");
      return this.registerByEmailCode(dto.email, dto.code, dto.handle, ctx);
    }
    throw new BadRequestException("未知 method");
  }

  private async registerByPhone(
    phone: string,
    code: string,
    desiredHandle: string | undefined,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    await this.consumeCode(`phone:${phone}`, code);
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

  private async registerByEmailCode(
    email: string,
    code: string,
    desiredHandle: string | undefined,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    const normalized = email.toLowerCase();
    await this.consumeCode(`email:register:${normalized}`, code);
    const exist = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (exist) throw new ConflictException("该邮箱已注册");
    const handle = await this.allocateHandle(desiredHandle ?? normalized.split("@")[0]);
    const user = await this.prisma.user.create({
      data: { handle, email: normalized },
    });
    return this.issue(user, "email_code", normalized, ctx, "REGISTER");
  }

  private async allocateHandle(seed: string): Promise<string> {
    const base = seed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `user${Date.now() % 1e6}`;
    for (let i = 0; i < 8; i += 1) {
      const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 10000)}`;
      const taken = await this.prisma.user.findUnique({ where: { handle: candidate } });
      if (!taken) return candidate;
    }
    throw new ConflictException("handle 冲突过多，稍后重试");
  }

  // ---------- 验证码 ----------

  async sendCode(dto: SendCodeDto): Promise<{ ok: true; ttlSeconds: number; demoCode?: string }> {
    const code = this.generateCode();
    const key = `phone:${dto.phone}`;

    await this.codeStore.set(key, code);

    const result = await this.sms.sendCode(dto.phone, code);

    void this.writeAudit({
      type: "SEND_CODE",
      method: dto.scene,
      identity: dto.phone,
      ip: undefined,
      userAgent: undefined,
    });

    return { ok: true, ttlSeconds: CODE_TTL_SECONDS, demoCode: result.demoCode };
  }

  async sendEmailCode(
    email: string,
    scene: "login" | "register",
  ): Promise<{ ok: true; ttlSeconds: number; demoCode?: string }> {
    const normalized = email.toLowerCase();
    const code = this.generateCode();
    const key = `email:${scene}:${normalized}`;

    await this.codeStore.set(key, code);

    const result = await this.mail.sendCode(normalized, code);
    void this.writeAudit({
      type: "SEND_CODE",
      method: "email",
      identity: normalized,
      ip: undefined,
      userAgent: undefined,
    });

    return { ok: true, ttlSeconds: CODE_TTL_SECONDS, demoCode: result.demoCode };
  }

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async consumeCode(key: string, code: string): Promise<void> {
    try {
      await this.codeStore.consume(key, code);
    } catch (err) {
      throw new UnauthorizedException((err as Error).message);
    }
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
    user: { id: string; handle: string; role: "AUTHOR" | "ADMIN" },
    method: string,
    identity: string,
    ctx: AuditContext,
    type: "LOGIN" | "REGISTER" = "LOGIN",
  ): Promise<LoginResult> {
    const payload: Pick<JwtPayload, "sub" | "handle" | "role"> = {
      sub: user.id,
      handle: user.handle,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    void this.writeAudit({
      type,
      userId: user.id,
      method,
      identity,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { accessToken, user: { id: user.id, handle: user.handle, role: user.role } };
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
      this.logger.warn(`audit write failed: ${(err as Error).message}`);
    }
  }

  // ---------- 兼容旧签名(给 e2e/单测留个 happy path)----------
  validateAndIssue(handle: string): Promise<LoginResult> {
    return this.loginByHandle(handle, {});
  }
}
