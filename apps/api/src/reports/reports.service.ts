import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
  type ReportDto,
} from "@bytedance-aigc/shared";

import { PrismaService } from "../prisma/prisma.service";
import { ReviewService } from "../reviews/review.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { ListReportsDto } from "./dto/list-reports.dto";
import { ResolveReportDto } from "./dto/resolve-report.dto";

const DEFAULT_LIMIT = 20;
const OFFLINE_REASON_MAX = 500;

interface ReportCursor {
  createdAt: string; // ISO
  id: string;
}

function encodeCursor(c: ReportCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string): ReportCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new BadRequestException({ code: "CURSOR_INVALID", message: "cursor 解析失败" });
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as ReportCursor).createdAt !== "string" ||
    typeof (parsed as ReportCursor).id !== "string"
  ) {
    throw new BadRequestException({ code: "CURSOR_INVALID", message: "cursor 格式错误" });
  }
  return parsed as ReportCursor;
}

function buildOfflineReason(category: ReportCategory, note?: string): string {
  const label = REPORT_CATEGORY_LABELS[category];
  const body = note?.trim() || "举报核实违规";
  const merged = `${label}:${body}`;
  return merged.length > OFFLINE_REASON_MAX ? merged.slice(0, OFFLINE_REASON_MAX) : merged;
}

type ReportWithJoins = Prisma.ReportGetPayload<{
  include: { post: { select: { id: true; title: true } }; reporter: { select: { handle: true } } };
}>;

function toDto(r: ReportWithJoins): ReportDto {
  return {
    id: r.id,
    postId: r.postId,
    postTitle: r.post.title,
    reporterId: r.reporterId,
    reporterHandle: r.reporter.handle,
    category: r.category,
    reason: r.reason,
    status: r.status,
    resolution: r.resolution,
    llmRecommendation: r.llmRecommendation,
    llmReason: r.llmReason,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewService,
  ) {}

  /** Phase 2.6 — 用户举报已发布稿件。fire-and-forget LLM 复审,失败静默。 */
  async create(
    postId: string,
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<{ reportId: string }> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: postId },
      select: { id: true, status: true, title: true, body: true },
    });
    if (!draft) throw new NotFoundException({ code: "POST_NOT_FOUND", message: "稿件不存在" });
    if (draft.status !== "PUBLISHED") {
      throw new BadRequestException({
        code: "POST_NOT_PUBLISHED",
        message: "该稿件不可举报",
      });
    }

    let created;
    try {
      created = await this.prisma.report.create({
        data: { postId, reporterId, category: dto.category, reason: dto.reason },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({
          code: "REPORT_DUPLICATE",
          message: "您已举报过该稿件",
        });
      }
      throw err;
    }

    // PostStat.report++(spec §3.2 副作用 3;Phase 2.4 已建表占位)
    await this.prisma.postStat.upsert({
      where: { draftId: postId },
      update: { report: { increment: 1 } },
      create: { draftId: postId, report: 1 },
    });

    // fire-and-forget LLM 复审。失败静默(已在 reviewPostPublish 内部 fallback)。
    void this.reviews
      .reviewPostPublish(extractFullText(draft))
      .then((r) =>
        this.prisma.report.update({
          where: { id: created.id },
          data: { llmRecommendation: r.recommendation, llmReason: r.reason },
        }),
      )
      .catch((err: unknown) => {
        this.logger.warn(`reviewPostPublish dispatch failed: ${(err as Error).message}`);
      });

    return { reportId: created.id };
  }

  /** Phase 2.6 — 作者看自己稿件被举报记录。隐私:不暴露 reporter 视角。 */
  async listMine(
    authorId: string,
    dto: ListReportsDto,
  ): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ReportWhereInput = { post: { authorId } };
    if (dto.cursor) {
      const c = decodeCursor(dto.cursor);
      where.OR = [
        { createdAt: { lt: new Date(c.createdAt) } },
        { createdAt: new Date(c.createdAt), id: { lt: c.id } },
      ];
    }
    const rows = await this.prisma.report.findMany({
      where,
      include: {
        post: { select: { id: true, title: true } },
        reporter: { select: { handle: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && slice.length > 0
        ? encodeCursor({
            createdAt: slice[slice.length - 1].createdAt.toISOString(),
            id: slice[slice.length - 1].id,
          })
        : null;
    return { items: slice.map(toDto), nextCursor };
  }

  /** Phase 2.6 — admin 工作台列表。status 默认 PENDING,支持 ALL。 */
  async listAdmin(dto: ListReportsDto): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const status = dto.status ?? "PENDING";
    const where: Prisma.ReportWhereInput = {};
    if (status !== "ALL") where.status = status;
    if (dto.cursor) {
      const c = decodeCursor(dto.cursor);
      where.OR = [
        { createdAt: { lt: new Date(c.createdAt) } },
        { createdAt: new Date(c.createdAt), id: { lt: c.id } },
      ];
    }
    const rows = await this.prisma.report.findMany({
      where,
      include: {
        post: { select: { id: true, title: true } },
        reporter: { select: { handle: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && slice.length > 0
        ? encodeCursor({
            createdAt: slice[slice.length - 1].createdAt.toISOString(),
            id: slice[slice.length - 1].id,
          })
        : null;
    return { items: slice.map(toDto), nextCursor };
  }

  /** Phase 2.6 — admin 处置。OFFLINE 走事务联动 Draft.status=OFFLINE。 */
  async resolve(reportId: string, adminId: string, dto: ResolveReportDto): Promise<{ ok: true }> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException({ code: "REPORT_NOT_FOUND", message: "举报不存在" });
    }
    if (report.status !== "PENDING") {
      throw new ConflictException({
        code: "REPORT_ALREADY_RESOLVED",
        message: "该举报已处置",
      });
    }

    const now = new Date();
    if (dto.resolution === "OFFLINE") {
      await this.prisma.$transaction([
        this.prisma.report.update({
          where: { id: reportId },
          data: {
            status: "RESOLVED",
            resolution: "OFFLINE",
            resolverId: adminId,
            resolvedAt: now,
          },
        }),
        this.prisma.draft.update({
          where: { id: report.postId },
          data: {
            status: "OFFLINE",
            offlineAt: now,
            offlineReason: buildOfflineReason(report.category, dto.note),
          },
        }),
      ]);
    } else {
      await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: "RESOLVED",
          resolution: dto.resolution,
          resolverId: adminId,
          resolvedAt: now,
        },
      });
    }
    return { ok: true };
  }
}

/** 从 Draft.title + body(TipTap JSONContent)递归取文本,用于 LLM 复审输入。 */
function extractFullText(draft: { title: string; body: unknown }): string {
  const parts: string[] = [draft.title];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(draft.body);
  return parts.join("\n");
}
