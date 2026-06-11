import { IsEmail, IsIn, IsString, MaxLength } from "class-validator";

export class SendEmailCodeDto {
  @IsString()
  @IsIn(["login", "register"])
  scene!: "login" | "register";

  @IsEmail()
  @MaxLength(254)
  email!: string;
}
