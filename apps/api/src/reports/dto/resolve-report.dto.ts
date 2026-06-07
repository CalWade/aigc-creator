import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ReportResolution } from "@prisma/client";

export class ResolveReportDto {
  @IsEnum(ReportResolution)
  resolution!: ReportResolution;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
