import { Injectable, Logger } from "@nestjs/common";
import pLimit from "p-limit";

import { PrismaService } from "../../prisma/prisma.service";
import { ReviewService } from "../../reviews/review.service";
import { AdminContentService } from "../admin-content.service";

@Injectable()
export class RuleRecheckService {
  private readonly logger = new Logger(RuleRecheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly review: ReviewService,
    private readonly adminContent: AdminContentService,
  ) {}

  /**
   * 异步规则复审:立即创建 run 记录并返回(status=RUNNING),
   * 后台通过 setImmediate 逐步扫描 PUBLISHED 稿件。
   * 命中 BLOCK 时转 OFFLINE。前端通过 GET /admin/rule-rechecks 轮询进度。
   */
  async recheckSinceRuleVersion(ruleVersion: string) {
    const run = await this.prisma.ruleRecheckRun.create({
      data: { ruleVersion, status: "RUNNING" },
    });

    // Fire-and-forget:后台执行,不阻塞 HTTP 响应
    setImmediate(() => {
      this.runRecheck(run.id, ruleVersion).catch((err) => {
        this.logger.error(
          `recheckSinceRuleVersion failed: runId=${run.id} err=${(err as Error).message}`,
          (err as Error).stack,
        );
      });
    });

    return run;
  }

  /** 后台执行规则复审(不阻塞 HTTP) */
  private async runRecheck(runId: string, ruleVersion: string): Promise<void> {
    try {
      const drafts = await this.prisma.draft.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, title: true, body: true },
      });

      let totalScanned = 0;
      let totalOffline = 0;

      const limit = pLimit(2);

      const tasks = drafts.map((draft) =>
        limit(async () => {
          totalScanned++;
          const text = this.extractText(draft);
          if (!text.trim()) return;

          const result = await this.review.reviewPostPublish(text);
          if (result.recommendation === "BLOCK") {
            try {
              await this.adminContent.offlineDraft(
                draft.id,
                `规则更新复审(v${ruleVersion})下线: ${result.reason}`,
              );
              totalOffline++;
            } catch (err) {
              this.logger.warn(
                `recheck offline error draftId=${draft.id}: ${(err as Error).message}`,
              );
            }
          }
        }),
      );

      await Promise.all(tasks);

      await this.prisma.ruleRecheckRun.update({
        where: { id: runId },
        data: {
          totalScanned,
          totalOffline,
          status: "DONE",
          finishedAt: new Date(),
        },
      });

      this.logger.log(
        `runRecheck: version=${ruleVersion} scanned=${totalScanned} offline=${totalOffline}`,
      );
    } catch (err) {
      await this.prisma.ruleRecheckRun.update({
        where: { id: runId },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      this.logger.error(`runRecheck failed: runId=${runId} err=${(err as Error).message}`);
    }
  }

  /** 列出所有规则复审运行记录。 */
  async list() {
    return this.prisma.ruleRecheckRun.findMany({
      orderBy: { startedAt: "desc" },
    });
  }

  /** 从 draft.body(TipTap JSONContent)+ 标题提取纯文本。 */
  private extractText(draft: { title: string; body: unknown }): string {
    const parts: string[] = [draft.title];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as { type?: string; text?: string; content?: unknown[] };
      if (typeof n.text === "string") parts.push(n.text);
      if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(draft.body);
    return parts.filter(Boolean).join("\n\n");
  }
}
