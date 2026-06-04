import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma, Review } from "@prisma/client";
import type {
  PreflightResponse,
  Recommendation,
  ReviewQuality,
  ReviewSafety,
  SafetyDim,
  QualityDim,
} from "@bytedance-aigc/shared";
import { SAFETY_KEYS, QUALITY_KEYS } from "@bytedance-aigc/shared";

import { LlmClient } from "../llm/llm.client";
import { PrismaService } from "../prisma/prisma.service";
import { PromptsService } from "../prompts/prompts.service";
import { DraftsService } from "../drafts/drafts.service";

const TRUNCATE_LIMIT = 12000;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly drafts: DraftsService,
    private readonly prisma: PrismaService,
    private readonly llm: LlmClient,
    private readonly prompts: PromptsService,
  ) {}

  async preflight(draftId: string, userSub: string): Promise<PreflightResponse> {
    const draft = await this.drafts.assertAuthor(draftId, userSub);
    const fullText = this.extractFullText(draft);
    const truncated = fullText.length > TRUNCATE_LIMIT;
    const text = truncated ? fullText.slice(0, TRUNCATE_LIMIT) : fullText;

    const [safetyPrompt, qualityPrompt] = await Promise.all([
      this.prompts.findDefaultByTool("SAFETY_REVIEW"),
      this.prompts.findDefaultByTool("QUALITY_REVIEW"),
    ]);

    const safetyMessages = [
      { role: "system" as const, content: safetyPrompt.systemPrompt },
      { role: "user" as const, content: text },
    ];
    const qualityMessages = [
      { role: "system" as const, content: qualityPrompt.systemPrompt },
      { role: "user" as const, content: text },
    ];

    const t0 = Date.now();
    let safetyRaw = "";
    let qualityRaw = "";
    let safetyMs = 0;
    let qualityMs = 0;
    try {
      const [s, q] = await Promise.all([
        this.timed(() => this.llm.chat(safetyMessages, { temperature: 0.0 })),
        this.timed(() => this.llm.chat(qualityMessages, { temperature: 0.4 })),
      ]);
      safetyRaw = s.value;
      safetyMs = s.ms;
      qualityRaw = q.value;
      qualityMs = q.ms;
    } catch (err) {
      this.logger.warn(`preflight LLM error: ${(err as Error).message}`);
      throw new InternalServerErrorException("LLM 审核失败,请稍后重试");
    }

    const safety = this.parseSafety(safetyRaw);
    const quality = this.parseQuality(qualityRaw);
    const recommendation = this.recommend(safety, quality);

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          draftId,
          stage: "PREFLIGHT",
          safety: safety as unknown as Prisma.InputJsonValue,
          quality: quality as unknown as Prisma.InputJsonValue,
          recommendation,
          modelMeta: {
            latencyMsSafety: safetyMs,
            latencyMsQuality: qualityMs,
            totalMs: Date.now() - t0,
            truncated,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.draft.update({ where: { id: draftId }, data: { lastReviewId: created.id } });
      return created;
    });

    return { review: this.toDto(review), recommendation };
  }

  async listByDraft(draftId: string, userSub: string, limit = 10): Promise<Review[]> {
    await this.drafts.assertAuthor(draftId, userSub);
    return this.prisma.review.findMany({
      where: { draftId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** 把 draft.body(TipTap JSONContent)+ 标题拼成 markdown-ish 全文。简单实现:递归取 text 节点。 */
  private extractFullText(draft: { title: string; body: unknown }): string {
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

  private async timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
    const t = Date.now();
    const value = await fn();
    return { value, ms: Date.now() - t };
  }

  /** 严格 JSON parse;失败 / 缺维度 / 维度不全 → fallback BLOCK 风险态。 */
  private parseSafety(raw: string): ReviewSafety {
    const fallback = (note: string): ReviewSafety => ({
      overall: 0,
      dimensions: SAFETY_KEYS.map((key) => ({
        key,
        score: 100,
        severity: "high" as const,
        hits: [],
        reason: "AI 输出格式异常,默认按高风险处理",
      })),
      note,
    });
    let parsed: { dimensions?: unknown };
    try {
      parsed = JSON.parse(raw) as { dimensions?: unknown };
    } catch {
      return fallback("AI 安全审核输出非合法 JSON");
    }
    if (!Array.isArray(parsed.dimensions)) return fallback("AI 安全审核输出缺 dimensions");
    const dims: SafetyDim[] = [];
    for (const key of SAFETY_KEYS) {
      const found = (parsed.dimensions as { key?: string }[]).find((d) => d?.key === key);
      if (!found) return fallback(`AI 输出缺维度 ${key}`);
      const f = found as Record<string, unknown>;
      const score = Number(f.score);
      const severity = (f.severity === "high" || f.severity === "medium" ? f.severity : "low") as
        | "low"
        | "medium"
        | "high";
      dims.push({
        key,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        severity,
        hits: Array.isArray(f.hits)
          ? (f.hits as unknown[]).filter((h) => typeof h === "string").map(String)
          : [],
        reason: typeof f.reason === "string" ? f.reason : undefined,
      });
    }
    const maxScore = Math.max(0, ...dims.map((d) => d.score));
    return { overall: 100 - maxScore, dimensions: dims };
  }

  private parseQuality(raw: string): ReviewQuality {
    const fallback = (note: string): ReviewQuality => ({
      overall: 0,
      dimensions: QUALITY_KEYS.map((key) => ({ key, score: 0, reason: "AI 输出格式异常" })),
      note,
    });
    let parsed: { dimensions?: unknown };
    try {
      parsed = JSON.parse(raw) as { dimensions?: unknown };
    } catch {
      return fallback("AI 质量评分输出非合法 JSON");
    }
    if (!Array.isArray(parsed.dimensions)) return fallback("AI 质量评分输出缺 dimensions");
    const dims: QualityDim[] = [];
    for (const key of QUALITY_KEYS) {
      const found = (parsed.dimensions as { key?: string }[]).find((d) => d?.key === key);
      if (!found) return fallback(`AI 输出缺维度 ${key}`);
      const f = found as Record<string, unknown>;
      const score = Number(f.score);
      dims.push({
        key,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        reason: typeof f.reason === "string" ? f.reason : "",
      });
    }
    const overall = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
    return { overall, dimensions: dims };
  }

  private recommend(safety: ReviewSafety, quality: ReviewQuality): Recommendation {
    if (safety.dimensions.some((d) => d.severity === "high")) return "BLOCK";
    if (safety.dimensions.some((d) => d.severity === "medium")) return "WARN";
    if (quality.overall < 60) return "WARN";
    return "ALLOW";
  }

  private toDto(r: Review): PreflightResponse["review"] {
    return {
      id: r.id,
      stage: r.stage as "PREFLIGHT" | "POST_PUBLISH",
      safety: r.safety as unknown as ReviewSafety,
      quality: r.quality as unknown as ReviewQuality,
      recommendation: r.recommendation as Recommendation,
      modelMeta: r.modelMeta as never,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
