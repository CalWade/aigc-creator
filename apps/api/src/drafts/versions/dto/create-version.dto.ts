import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

// Phase 2.14:版本类型。NAMED 是用户主动命名版本,
// OFFLINE_CONFLICT 是离线编辑回到线上发现冲突时,把本地稿存为一个独立版本。
export enum CreateVersionKind {
  NAMED = "NAMED",
  OFFLINE_CONFLICT = "OFFLINE_CONFLICT",
}

export class CreateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsEnum(CreateVersionKind)
  kind?: CreateVersionKind;

  // OFFLINE_CONFLICT 时必填,NAMED 时必须不传(service 层在 Task 3 narrow)。
  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
