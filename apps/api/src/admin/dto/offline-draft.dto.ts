import { IsOptional, IsString, MaxLength } from "class-validator";

export class OfflineDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
