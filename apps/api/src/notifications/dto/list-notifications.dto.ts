import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { NotificationType } from "@prisma/client";

export class ListNotificationsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  read?: "true" | "false";

  @IsOptional()
  @IsIn(["10", "20", "50"])
  limit?: "10" | "20" | "50";
}
