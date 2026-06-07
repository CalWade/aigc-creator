import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ReportCategory } from "@prisma/client";

export class CreateReportDto {
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
