import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  draftId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateNotificationParams) {
    return this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        draftId: params.draftId ?? null,
      },
    });
  }

  async list(userId: string, options: { cursor?: string; limit?: number; read?: boolean } = {}) {
    const { cursor, limit = 10, read } = options;
    const where: Prisma.NotificationWhereInput = { userId };
    if (read !== undefined) where.read = read;

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNext = items.length > limit;
    const data = hasNext ? items.slice(0, limit) : items;
    return { items: data, nextCursor: hasNext ? data[data.length - 1].id : null };
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) {
      throw new NotFoundException("通知不存在");
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { count: result.count };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }
}
