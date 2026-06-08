import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;

  // Phase 2.14:乐观并发,客户端带上自己持有的 draft.version,
  // service 层对比当前 DB version 决定走正常更新还是走冲突分支。
  @IsOptional()
  @IsInt()
  @Min(1)
  baseVersion?: number;
}
