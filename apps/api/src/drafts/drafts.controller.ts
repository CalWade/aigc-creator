import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Draft } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { DraftsService } from "./drafts.service";
import { CreateDraftDto } from "./dto/create-draft.dto";
import { UpdateDraftDto } from "./dto/update-draft.dto";

@Controller("drafts")
@UseGuards(UserGuard)
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDraftDto): Promise<Draft> {
    return this.drafts.create(user.sub, dto);
  }

  @Get()
  list(): Promise<Draft[]> {
    return this.drafts.list();
  }

  @Get("mine")
  findMine(@CurrentUser() user: JwtPayload): Promise<Draft[]> {
    return this.drafts.findByAuthor(user.sub);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Draft> {
    return this.drafts.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDraftDto,
  ): Promise<Draft> {
    return this.drafts.update(id, user.sub, dto);
  }
}
