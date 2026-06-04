import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Phase 2.2 FAST 模式选题入参。
 * topic 必填,hint 可选(用户可补一句"风格请克制"之类约束)。
 */
export class OutlineRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  hint?: string;
}
