import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService, type LoginResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.validateAndIssue(dto.handle);
  }
}
