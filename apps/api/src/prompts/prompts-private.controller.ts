import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prompt, PromptSnapshot } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { PromptsService } from "./prompts.service";
import { UpdatePromptDto } from "./dto/update-prompt.dto";

/**
 * Phase 2.2 Task 8 — 私有 Prompt 写端点(基础 CRUD)。
 * Phase 2.17 — 快照列表 + 回滚两端点扩展。
 *
 * 与 PromptsController 同挂 `/prompts`,本控制器走 UserGuard,路由签名不重叠:
 *   GET    /prompts/private                              → 自己的私有
 *   POST   /prompts/:platformId/copy                     → 平台 → 私人副本
 *   PATCH  /prompts/:id                                  → 改自己的私人 prompt
 *   DELETE /prompts/:id                                  → 删自己的私人 prompt
 *   GET    /prompts/:id/snapshots                        → 列最近 3 条快照
 *   POST   /prompts/:id/snapshots/:snapId/restore        → 回滚到快照
 */
@Controller("prompts")
@UseGuards(UserGuard)
export class PromptsPrivateController {
  constructor(private readonly prompts: PromptsService) {}

  @Get("private")
  listPrivate(@CurrentUser() user: JwtPayload): Promise<Prompt[]> {
    return this.prompts.listPrivate(user.sub);
  }

  @Post(":platformId/copy")
  @HttpCode(HttpStatus.CREATED)
  copy(@Param("platformId") platformId: string, @CurrentUser() user: JwtPayload): Promise<Prompt> {
    return this.prompts.copyToPrivate(platformId, user.sub);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePromptDto,
  ): Promise<Prompt> {
    return this.prompts.update(id, user.sub, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id") id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.prompts.deleteOne(id, user.sub);
  }

  @Get(":id/snapshots")
  listSnapshots(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PromptSnapshot[]> {
    return this.prompts.listSnapshots(id, user.sub);
  }

  @Post(":id/snapshots/:snapId/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("id") id: string,
    @Param("snapId") snapId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Prompt> {
    return this.prompts.restoreSnapshot(id, snapId, user.sub);
  }
}
