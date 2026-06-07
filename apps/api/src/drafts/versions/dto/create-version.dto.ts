import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
