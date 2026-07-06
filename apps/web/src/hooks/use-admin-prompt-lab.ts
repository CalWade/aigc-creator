"use client";

import { useState } from "react";

import { apiFetch } from "@aigc-creator/ui/lib/auth";

/**
 * Phase P1 — Prompt admin UI 数据层。
 *
 * 后端 8 个端点拆成 5 个 hook,每个 hook 独立维护 loading/error/data,
 * 抄 use-admin-reports.ts 定式。AdminGuard 401/403 统一映射成 "无管理员权限"
 * 让外层组件单点处理。
 */

// ---------- 类型(后端 Prisma 模型字段子集,前端只读消费) ----------

export type DraftToolType =
  | "REWRITE_FLUENT"
  | "EXPAND"
  | "TRANSFORM_STYLE"
  | "HEADLINE_SUB"
  | "HEADLINE_NEW"
  | "REWRITE_OPENING"
  | "ADD_FACTS"
  | "ADD_TOPIC"
  | "IMAGE_SUGGEST"
  | "SAFETY_REVIEW"
  | "QUALITY_REVIEW"
  | "PROMPT_REVIEW"
  | "SECTION_REVIEW"
  | "POST_PUBLISH_REVIEW"
  | "SAFE_REWRITE"
  | "IMAGE_REVIEW"
  | "DATA_DIAGNOSIS";

export const DRAFT_TOOL_TYPES: DraftToolType[] = [
  "REWRITE_FLUENT",
  "EXPAND",
  "TRANSFORM_STYLE",
  "HEADLINE_SUB",
  "HEADLINE_NEW",
  "REWRITE_OPENING",
  "ADD_FACTS",
  "ADD_TOPIC",
  "IMAGE_SUGGEST",
  "SAFETY_REVIEW",
  "QUALITY_REVIEW",
  "PROMPT_REVIEW",
  "SECTION_REVIEW",
  "POST_PUBLISH_REVIEW",
  "SAFE_REWRITE",
  "IMAGE_REVIEW",
  "DATA_DIAGNOSIS",
];

export interface AdminPrompt {
  id: string;
  name: string;
  systemPrompt: string;
  tool: DraftToolType;
  owner: "PLATFORM" | "USER";
  ownerUserId: string | null;
  isStarter: boolean;
  version: number;
  description: string | null;
  updatedAt: string;
}

export interface AdminTestCase {
  id: string;
  tool: DraftToolType;
  input: string;
  expected: string;
  category: string | null;
  createdAt: string;
}

export interface AdminEvalRun {
  id: string;
  tool: DraftToolType;
  promptId: string;
  accuracy: number;
  stability: number;
  totalCases: number;
  status: "RUNNING" | "DONE" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
}

export interface AdminCompare {
  candidate: { id: string; promptId: string; accuracy: number; totalCases: number };
  current: { id: string; name: string } | null;
  previous: { id: string; promptId: string; accuracy: number } | null;
  accuracyDelta: number;
  canPromote: boolean;
}

// ---------- 错误映射(集中处置 401/403/404) ----------

function mapError(status: number, body: { code?: string; message?: string }): string {
  if (body.code === "ADMIN_REQUIRED" || status === 403) return "无管理员权限";
  if (status === 401) return "请先登录";
  if (status === 404) return body.message ?? "资源不存在";
  return body.message ?? `请求失败 (HTTP ${status})`;
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  return mapError(res.status, body);
}

// ---------- usePromptList:GET /prompts(可选 owner/tool 过滤) ----------

export function usePromptList() {
  const [items, setItems] = useState<AdminPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (filter: { tool?: DraftToolType; owner?: "PLATFORM" | "USER" }) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filter.tool) qs.set("tool", filter.tool);
      if (filter.owner) qs.set("owner", filter.owner);
      const res = await apiFetch(`/prompts${qs.toString() ? `?${qs.toString()}` : ""}`);
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as AdminPrompt[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return { items, loading, error, load };
}

// ---------- useTestCases:GET / POST /admin/prompt-lab/test-cases ----------

export function useTestCases() {
  const [items, setItems] = useState<AdminTestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (tool?: DraftToolType) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (tool) qs.set("tool", tool);
      qs.set("limit", "50");
      const res = await apiFetch(`/admin/prompt-lab/test-cases?${qs.toString()}`);
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as AdminTestCase[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const add = async (input: {
    tool: DraftToolType;
    input: string;
    expected: string;
    category?: string;
  }): Promise<boolean> => {
    setError(null);
    try {
      const res = await apiFetch(`/admin/prompt-lab/test-cases`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        setError(await readError(res));
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  return { items, loading, error, load, add };
}

// ---------- useEvalRuns:GET /eval-runs + POST /eval-runs(同步阻塞 30s+) ----------

export function useEvalRuns() {
  const [items, setItems] = useState<AdminEvalRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (tool?: DraftToolType) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (tool) qs.set("tool", tool);
      qs.set("limit", "20");
      const res = await apiFetch(`/admin/prompt-lab/eval-runs?${qs.toString()}`);
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as AdminEvalRun[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runEval = async (
    tool: DraftToolType,
    candidatePromptId: string,
  ): Promise<AdminEvalRun | null> => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/prompt-lab/eval-runs`, {
        method: "POST",
        body: JSON.stringify({ tool, candidatePromptId }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return null;
      }
      return (await res.json()) as AdminEvalRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setRunning(false);
    }
  };

  return { items, loading, running, error, load, runEval };
}

// ---------- useCompare:GET /eval-runs/:id/compare + POST promote ----------

export function useCompare() {
  const [data, setData] = useState<AdminCompare | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (evalRunId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/prompt-lab/eval-runs/${evalRunId}/compare`);
      if (!res.ok) {
        setError(await readError(res));
        setData(null);
        return;
      }
      setData((await res.json()) as AdminCompare);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const promote = async (evalRunId: string, note?: string): Promise<boolean> => {
    setPromoting(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/prompt-lab/eval-runs/${evalRunId}/promote`, {
        method: "POST",
        body: JSON.stringify(note ? { note } : {}),
      });
      if (!res.ok) {
        setError(await readError(res));
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPromoting(false);
    }
  };

  return { data, loading, promoting, error, load, promote };
}

// ---------- useRollback:POST /rollback ----------

export function useRollback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (tool: DraftToolType, note?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/prompt-lab/rollback`, {
        method: "POST",
        body: JSON.stringify(note ? { tool, note } : { tool }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, run };
}
