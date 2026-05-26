import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { Draft } from "@prisma/client";

import { DraftsService } from "./drafts.service";
import { CreateDraftDto } from "./dto/create-draft.dto";

@Controller("drafts")
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDraftDto): Promise<Draft> {
    return this.drafts.create(dto);
  }

  @Get()
  list(): Promise<Draft[]> {
    return this.drafts.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Draft> {
    return this.drafts.findOne(id);
  }
}
