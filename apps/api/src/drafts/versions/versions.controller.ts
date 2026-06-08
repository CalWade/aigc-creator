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
import type { Prisma } from "@prisma/client";

import { CurrentUser } from "../../auth/current-user.decorator";
import type { JwtPayload } from "../../auth/jwt-payload.interface";
import { UserGuard } from "../../auth/user.guard";
import { DraftsService } from "../drafts.service";
import { CreateVersionDto } from "./dto/create-version.dto";
import { VersionsService, type VersionDetailDto, type VersionDto } from "./versions.service";

@Controller("drafts/:id/versions")
@UseGuards(UserGuard)
export class VersionsController {
  constructor(
    private readonly drafts: DraftsService,
    private readonly versions: VersionsService,
  ) {}

  @Get()
  async list(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ items: VersionDto[] }> {
    await this.drafts.assertAuthor(id, user.sub);
    return { items: await this.versions.list(id) };
  }

  @Get(":vid")
  async findOne(
    @Param("id") id: string,
    @Param("vid") vid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<VersionDetailDto> {
    await this.drafts.assertAuthor(id, user.sub);
    return this.versions.findOne(id, vid);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNamed(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVersionDto,
  ): Promise<VersionDto> {
    const draft = await this.drafts.assertAuthor(id, user.sub);
    return this.versions.createNamed(id, draft.body, dto.note, {
      kind: dto.kind,
      snapshot: dto.snapshot as Prisma.JsonValue | undefined,
    });
  }

  @Post(":vid/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param("id") id: string,
    @Param("vid") vid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string; body: unknown }> {
    await this.drafts.assertAuthor(id, user.sub);
    return this.versions.restore(id, vid);
  }
}
