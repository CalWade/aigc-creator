import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { DraftToolType } from "@prisma/client";

import { UserGuard } from "../../auth/user.guard";
import { AdminGuard } from "../../reports/admin.guard";
import { PromptLabService } from "./prompt-lab.service";

class AddTestCaseDto {
  @IsEnum(DraftToolType)
  tool!: DraftToolType;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  input!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  expected!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;
}

class RunEvalDto {
  @IsEnum(DraftToolType)
  tool!: DraftToolType;

  @IsString()
  @MinLength(1)
  candidatePromptId!: string;
}

class PromoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class RollbackDto {
  @IsEnum(DraftToolType)
  tool!: DraftToolType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller("admin/prompt-lab")
@UseGuards(UserGuard, AdminGuard)
export class PromptLabController {
  constructor(private readonly service: PromptLabService) {}

  @Post("test-cases")
  @HttpCode(HttpStatus.CREATED)
  addTestCase(@Body() dto: AddTestCaseDto) {
    return this.service.addTestCase(dto.tool, dto.input, dto.expected, dto.category);
  }

  @Get("test-cases")
  listTestCases(
    @Query("tool") tool?: DraftToolType,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.listTestCases(
      tool,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post("eval-runs")
  @HttpCode(HttpStatus.OK)
  runEval(@Body() dto: RunEvalDto) {
    return this.service.runEval(dto.tool, dto.candidatePromptId);
  }

  @Get("eval-runs")
  listEvalRuns(@Query("tool") tool?: DraftToolType, @Query("limit") limit?: string) {
    return this.service.listEvalRuns(tool, limit ? parseInt(limit, 10) : 20);
  }

  @Get("eval-runs/:id/compare")
  compareWithCurrent(@Param("id") id: string) {
    return this.service.compareWithCurrent(id);
  }

  @Post("eval-runs/:id/promote")
  @HttpCode(HttpStatus.OK)
  promoteToLive(@Param("id") id: string, @Body() dto: PromoteDto) {
    return this.service.promoteToLive(id, "admin", dto.note);
  }

  @Post("rollback")
  @HttpCode(HttpStatus.OK)
  rollback(@Body() dto: RollbackDto) {
    return this.service.rollback(dto.tool, "admin", dto.note);
  }
}
