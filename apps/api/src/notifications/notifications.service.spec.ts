import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  describe("create", () => {
    it("creates a notification and returns it", async () => {
      const expected = {
        id: "n1",
        userId: "u1",
        type: "PUBLISH_APPROVED",
        title: "发布通过",
        body: "《标题》已成功发布",
        read: false,
        draftId: "d1",
        createdAt: new Date(),
      };
      prisma.notification.create.mockResolvedValue(expected);

      const result = await service.create({
        userId: "u1",
        type: "PUBLISH_APPROVED",
        title: "发布通过",
        body: "《标题》已成功发布",
        draftId: "d1",
      });

      expect(result).toEqual(expected);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          type: "PUBLISH_APPROVED",
          title: "发布通过",
          body: "《标题》已成功发布",
          draftId: "d1",
        },
      });
    });

    it("creates a notification without draftId", async () => {
      prisma.notification.create.mockResolvedValue({ id: "n2" });

      await service.create({
        userId: "u1",
        type: "HOT_RANK",
        title: "热点榜上榜",
        body: "测试",
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ draftId: null }),
      });
    });
  });

  describe("list", () => {
    it("returns items with nextCursor when more exist", async () => {
      const items = Array.from({ length: 11 }, (_, i) => ({
        id: `n${i}`,
        userId: "u1",
        type: "PUBLISH_APPROVED",
        title: "t",
        body: "b",
        read: false,
        draftId: null,
        createdAt: new Date(),
      }));
      prisma.notification.findMany.mockResolvedValue(items);

      const result = await service.list("u1", { limit: 10 });

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).toBe("n9");
    });

    it("returns all items without nextCursor when fewer than limit", async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `n${i}`,
        userId: "u1",
        type: "PUBLISH_APPROVED",
        title: "t",
        body: "b",
        read: false,
        draftId: null,
        createdAt: new Date(),
      }));
      prisma.notification.findMany.mockResolvedValue(items);

      const result = await service.list("u1", { limit: 10 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeNull();
    });

    it("filters by read status", async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.list("u1", { read: false });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", read: false },
        }),
      );
    });

    it("passes cursor for pagination", async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.list("u1", { cursor: "abc", limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "abc" },
          skip: 1,
        }),
      );
    });
  });

  describe("markRead", () => {
    it("marks a notification as read", async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: "n1",
        userId: "u1",
        read: false,
      });
      prisma.notification.update.mockResolvedValue({ id: "n1", read: true });

      const result = await service.markRead("n1", "u1");

      expect(result.read).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: "n1" },
        data: { read: true },
      });
    });

    it("throws NotFoundException when notification does not belong to user", async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: "n1",
        userId: "u2",
        read: false,
      });

      await expect(service.markRead("n1", "u1")).rejects.toThrow("通知不存在");
    });

    it("throws NotFoundException when notification is null", async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead("n1", "u1")).rejects.toThrow("通知不存在");
    });
  });

  describe("markAllRead", () => {
    it("updates all unread notifications for the user", async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead("u1");

      expect(result.count).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", read: false },
        data: { read: true },
      });
    });
  });

  describe("getUnreadCount", () => {
    it("returns the unread count", async () => {
      prisma.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount("u1");

      expect(result.count).toBe(3);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: "u1", read: false },
      });
    });

    it("returns 0 when no unread", async () => {
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount("u1");

      expect(result.count).toBe(0);
    });
  });
});
