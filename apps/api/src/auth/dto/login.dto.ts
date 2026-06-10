import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

/**
 * 三种登录方式 union:
 * - method=handle  → 老路径,只查 handle(兼容 e2e + demo seed 用户)
 * - method=phone   → 手机号 + 6 位验证码
 * - method=email   → 邮箱 + 密码
 *
 * 各 method 必填字段在 service 层运行时校验,DTO 这里只做类型 + 格式 + 长度。
 */
export class LoginDto {
  /**
   * 缺省时按 handle 走,兼容旧 e2e helpers(loginAsDemo / loginAsAdmin)发送的 `{handle}` body。
   */
  @IsOptional()
  @IsString()
  @IsIn(["handle", "phone", "email"])
  method?: "handle" | "phone" | "email";

  @IsOptional()
  @IsString()
  @Length(1, 50)
  handle?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "验证码必须是 6 位数字" })
  code?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 72)
  password?: string;
}
