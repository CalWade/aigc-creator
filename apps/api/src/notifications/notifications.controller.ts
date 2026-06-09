import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(UserGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() dto: ListNotificationsDto) {
    return this.notifications.list(user.sub, {
      cursor: dto.cursor,
      limit: dto.limit ? Number(dto.limit) : 10,
      read: dto.read === "true" ? true : dto.read === "false" ? false : undefined,
    });
  }

  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  markRead(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.notifications.markRead(id, user.sub);
  }

  @Patch("read-all")
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.getUnreadCount(user.sub);
  }
}
