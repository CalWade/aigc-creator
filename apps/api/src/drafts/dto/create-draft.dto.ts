import { Type } from "class-transformer";
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { DraftMode } from "@prisma/client";

export class CreateDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsObject()
  body!: Record<string, unknown>;

  @IsOptional()
  @IsEnum(DraftMode)
  @Type(() => String)
  mode?: DraftMode;
}
