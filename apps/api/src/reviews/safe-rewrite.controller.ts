import { Body, Controller, HttpCode, HttpStatus, Post, Sse, UseGuards } from "@nestjs/common";
import { Observable, map } from "rxjs";

import { UserGuard } from "../auth/user.guard";
import { SafeRewriteService } from "./safe-rewrite.service";
import { SafeRewriteDto } from "./dto/safe-rewrite.dto";

@Controller("reviews")
@UseGuards(UserGuard)
export class SafeRewriteController {
  constructor(private readonly svc: SafeRewriteService) {}

  @Post("safe-rewrite")
  @Sse()
  @HttpCode(HttpStatus.OK)
  stream(@Body() dto: SafeRewriteDto): Observable<{ data: string; event?: string }> {
    return this.svc.stream(dto).pipe(
      map((frame) => ({
        event: frame.event,
        data: JSON.stringify(frame),
      })),
    );
  }
}
