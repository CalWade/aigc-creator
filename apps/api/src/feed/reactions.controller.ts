import { BadRequestException, Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { ReactionKind } from "@prisma/client";
import type { PostReactionsDto } from "@bytedance-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { ReactionsService } from "./reactions.service";

/**
 * 全局 APP_GUARD JwtAuthGuard 已强制鉴权;此处不再加 @UseGuards 避免 FeedModule
 * 局部需要 JwtService 而触发 DI 解析失败。
 */
@Controller("post/:id/reactions")
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Post(":kind")
  async add(
    @Param("id") id: string,
    @Param("kind") kindParam: string,
    @CurrentUser() user: JwtPayload,
    @Body() _body: unknown,
  ): Promise<PostReactionsDto> {
    return this.reactions.add(user.sub, id, parseKind(kindParam));
  }

  @Delete(":kind")
  async remove(
    @Param("id") id: string,
    @Param("kind") kindParam: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PostReactionsDto> {
    return this.reactions.remove(user.sub, id, parseKind(kindParam));
  }
}

function parseKind(raw: string): ReactionKind {
  const upper = raw.toUpperCase();
  if (upper === "LIKE" || upper === "COLLECT") return upper as ReactionKind;
  throw new BadRequestException("kind 必须是 like 或 collect");
}
