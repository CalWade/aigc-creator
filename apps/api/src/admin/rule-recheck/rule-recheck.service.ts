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
   * 从 PUBLISHED Draft 中拉取所有在规则更新前最后修改的稿件,
   * 串行(p-limit concurrency=2)调 ReviewService.reviewPostPublish 重新评估,
   * 命中 BLOCK 时转 OFFLINE。
   * 同步执行,无 worker。
   */
  async recheckSinceRuleVersion(ruleVersion: string) {
    const run = await this.prisma.ruleRecheckRun.create({
      data: { ruleVersion, status: "RUNNING" },
    });

    try {
      // 拉所有 PUBLISHED 稿件(规则更新后不需要按时间过滤,
      // 因为调用方知道哪些需要重审)
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
        where: { id: run.id },
        data: {
          totalScanned,
          totalOffline,
          status: "DONE",
          finishedAt: new Date(),
        },
      });

      this.logger.log(
        `recheckSinceRuleVersion: version=${ruleVersion} scanned=${totalScanned} offline=${totalOffline}`,
      );

      return this.prisma.ruleRecheckRun.findUnique({ where: { id: run.id } });
    } catch (err) {
      await this.prisma.ruleRecheckRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      throw err;
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
