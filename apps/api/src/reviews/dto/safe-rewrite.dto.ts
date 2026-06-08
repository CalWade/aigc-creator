import { IsArray, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { SENSITIVE_CATEGORIES, type SensitiveCategory } from "@bytedance-aigc/shared";

export class SafeRewriteDto {
  @IsString()
  @MinLength(1)
  draftId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsArray()
  @IsIn([...SENSITIVE_CATEGORIES], { each: true })
  hitCategories!: SensitiveCategory[];

  @IsString()
  @MaxLength(500)
  message!: string;
}
