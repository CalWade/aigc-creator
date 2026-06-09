import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AdminContentService } from "../admin-content.service";

@Injectable()
export class SampleAuditService {
  private readonly logger = new Logger(SampleAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContent: AdminContentService,
  ) {}

  /**
   * 从 PUBLISHED Draft 中按 ratio 抽样,写入 SampleAudit(PENDING)。
   * ratio clamp 0.01-1.0,默认 0.05。
   * 跳过已有 PENDING 审计记录的 draft(防重复抽样)。
   */
  async enqueueSample(ratio = 0.05): Promise<{ enqueued: number }> {
    const clamped = Math.max(0.01, Math.min(1.0, ratio));

    // 排除已有 PENDING 记录的 draft
    const existingPending = await this.prisma.sampleAudit.findMany({
      where: { status: "PENDING" },
      select: { draftId: true },
    });
    const pendingIds = new Set(existingPending.map((s) => s.draftId));

    const sampleCount = Math.max(
      1,
      Math.round((await this.prisma.draft.count({ where: { status: "PUBLISHED" } })) * clamped),
    );

    // Postgres 原生 RANDOM() 排序抽样
    const sampled = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM drafts
      WHERE status = 'PUBLISHED'
      ORDER BY RANDOM()
      LIMIT ${sampleCount}
    `;

    let enqueued = 0;
    for (const row of sampled) {
      if (pendingIds.has(row.id)) continue;
      try {
        await this.prisma.sampleAudit.create({
          data: { draftId: row.id, status: "PENDING" },
        });
        enqueued++;
      } catch {
        this.logger.warn(`enqueueSample: draftId=${row.id} 已存在,跳过`);
      }
    }

    this.logger.log(
      `enqueueSample: ratio=${clamped} sampled=${sampled.length} enqueued=${enqueued}`,
    );
    return { enqueued };
  }

  /**
   * 列出抽样审计记录,默认 status=PENDING。
   */
  async list(status?: "PENDING" | "PASSED" | "FAILED") {
    return this.prisma.sampleAudit.findMany({
      where: status ? { status } : undefined,
      include: { draft: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 对一条抽样审计做判定:PASS 或 FAIL。
   * FAIL 时把 Draft 转 OFFLINE(走 AdminContentService.offlineDraft)。
   */
  async decide(
    id: string,
    decision: "PASS" | "FAIL",
    reviewedBy: string,
    note?: string,
  ): Promise<{ ok: true }> {
    const audit = await this.prisma.sampleAudit.findUnique({ where: { id } });
    if (!audit) {
      throw new NotFoundException({ code: "SAMPLE_AUDIT_NOT_FOUND", message: "抽样记录不存在" });
    }
    if (audit.status !== "PENDING") {
      throw new BadRequestException({
        code: "ALREADY_DECIDED",
        message: "该抽样记录已判定",
      });
    }

    if (decision === "FAIL") {
      try {
        await this.adminContent.offlineDraft(
          audit.draftId,
          note ? `抽样巡检下线: ${note}` : "抽样巡检下线",
        );
      } catch (err) {
        this.logger.warn(`decide FAIL offlineDraft error: ${(err as Error).message}`);
      }
    }

    await this.prisma.sampleAudit.update({
      where: { id },
      data: {
        status: decision === "PASS" ? "PASSED" : "FAILED",
        reviewedAt: new Date(),
        reviewedBy,
        note: note?.slice(0, 500) ?? null,
      },
    });

    return { ok: true };
  }
}
