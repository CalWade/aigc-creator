import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

/**
 * 注册:
 * - method=phone → 手机号 + 6 位验证码 + 期望 handle(可选,服务端可派生)
 * - method=email → 邮箱 + 密码 + 期望 handle(可选)
 */
export class RegisterDto {
  @IsIn(["phone", "email"])
  method!: "phone" | "email";

  @IsOptional()
  @IsString()
  @Length(2, 30)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: "handle 仅支持字母数字下划线连字符" })
  handle?: string;

  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone?: string;

  @IsOptional()
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
