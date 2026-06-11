import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { UserGuard } from "../auth/user.guard";
import { AdminGuard } from "../reports/admin.guard";
import { AdminContentService, type AdminPostView } from "./admin-content.service";
import { OfflineDraftDto } from "./dto/offline-draft.dto";

/**
 * Phase 2.11 — admin 直接下线 + 预览任意状态作品。
 * Guard 顺序固定 (UserGuard, AdminGuard);AdminGuard 走 JWT payload.role === "ADMIN"
 * (RBAC mini,2026-06-11 起替换原 ADMIN_HANDLES env 白名单)。
 */
@Controller("admin")
@UseGuards(UserGuard, AdminGuard)
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Post("drafts/:id/offline")
  @HttpCode(HttpStatus.OK)
  offline(@Param("id") id: string, @Body() dto: OfflineDraftDto): Promise<{ ok: true }> {
    return this.content.offlineDraft(id, dto.reason);
  }

  @Get("posts/:id")
  preview(@Param("id") id: string): Promise<AdminPostView> {
    return this.content.getPost(id);
  }
}
