import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * Phase 2.6 — list /me/reports & /admin/reports 共用 DTO。
 * status 联合含 "ALL" 是 admin 工作台用,前端 tab 可以"全部"过滤。
 */
export type ReportListStatus = "PENDING" | "RESOLVED" | "ALL";

export class ListReportsDto {
  @IsOptional()
  @IsIn(["PENDING", "RESOLVED", "ALL"])
  status?: ReportListStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
