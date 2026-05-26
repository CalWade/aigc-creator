import { Injectable, NotFoundException } from "@nestjs/common";
import { Draft, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreateDraftDto } from "./dto/create-draft.dto";

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDraftDto): Promise<Draft> {
    return this.prisma.draft.create({
      data: {
        authorId: dto.authorId,
        title: dto.title,
        body: dto.body as Prisma.InputJsonValue,
        mode: dto.mode,
      },
    });
  }

  async list(): Promise<Draft[]> {
    return this.prisma.draft.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async findOne(id: string): Promise<Draft> {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }
    return draft;
  }
}
