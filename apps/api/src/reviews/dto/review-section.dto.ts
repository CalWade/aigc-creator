import { Type } from "class-transformer";
import { IsInt, IsString, MaxLength, MinLength, ValidateNested, Min } from "class-validator";

class RangeDto {
  @IsInt()
  @Min(0)
  from!: number;

  @IsInt()
  @Min(0)
  to!: number;
}

export class ReviewSectionDto {
  @IsString()
  @MinLength(1)
  draftId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sessionId!: string;

  @ValidateNested()
  @Type(() => RangeDto)
  range!: RangeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}
