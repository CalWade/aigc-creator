import { IsIn, Matches } from "class-validator";

export class SendCodeDto {
  @IsIn(["login", "register"])
  scene!: "login" | "register";

  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone!: string;
}
