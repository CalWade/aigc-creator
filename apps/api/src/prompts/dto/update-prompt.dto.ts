import { IsArray, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Phase 2.2 Task 8: 私有 Prompt 部分更新。
 * 只允许改:systemPrompt / params / fewShots / designNote。
 * tool / owner / authorId / name / sourcePromptId 等溯源字段不可改。
 */
export class UpdatePromptDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  fewShots?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  designNote?: string;
}
