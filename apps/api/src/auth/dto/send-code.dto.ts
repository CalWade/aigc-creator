import { IsIn, IsString, Matches } from "class-validator";

export class SendCodeDto {
  @IsString()
  @IsIn(["login", "register"])
  scene!: "login" | "register";

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone!: string;
}
