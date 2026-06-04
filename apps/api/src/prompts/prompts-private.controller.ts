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
import { Prompt } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { PromptsService } from "./prompts.service";
import { UpdatePromptDto } from "./dto/update-prompt.dto";

/**
 * Phase 2.2 Task 8 — 私有 Prompt 写端点。
 *
 * 与 PromptsController 同挂 `/prompts`,但本控制器走 UserGuard,
 * 路由签名与原 Public 控制器**不重叠**:
 *   - GET    /prompts/private          → listPrivate(自己的私有)
 *   - POST   /prompts/:platformId/copy → 平台 prompt 复制为私人副本
 *   - PATCH  /prompts/:id              → 改自己的私人 prompt
 *   - DELETE /prompts/:id              → 删自己的私人 prompt
 *
 * 注意:Nest 路由匹配按"先注册先匹配",因此本控制器必须在
 * PromptsController 之前注册(见 prompts.module.ts 注释)。
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
}
