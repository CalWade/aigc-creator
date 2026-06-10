import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ReactionKind } from "@prisma/client";
import type { PostReactionsDto } from "@bytedance-aigc/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { ReactionsService } from "./reactions.service";

@Controller("post/:id/reactions")
@UseGuards(JwtAuthGuard)
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
