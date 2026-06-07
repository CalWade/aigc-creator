"use client";
import { useState } from "react";
import type { CreateReportInput } from "@bytedance-aigc/shared";

import { apiFetch } from "@/lib/auth";

export interface UseReportState {
  loading: boolean;
  error: string | null;
  done: boolean;
}

export function useCreateReport(postId: string) {
  const [state, setState] = useState<UseReportState>({
    loading: false,
    error: null,
    done: false,
  });

  const submit = async (input: CreateReportInput): Promise<boolean> => {
    setState({ loading: true, error: null, done: false });
    try {
      const res = await apiFetch(`/posts/${postId}/reports`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        const msg = mapError(res.status, body.code, body.message);
        setState({ loading: false, error: msg, done: false });
        return false;
      }
      setState({ loading: false, error: null, done: true });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ loading: false, error: msg, done: false });
      return false;
    }
  };

  const reset = (): void => setState({ loading: false, error: null, done: false });

  return { ...state, submit, reset };
}

function mapError(status: number, code?: string, message?: string): string {
  if (status === 401) return "请先登录后再举报";
  if (code === "REPORT_DUPLICATE") return "您已举报过该稿件";
  if (code === "POST_NOT_PUBLISHED") return "该稿件不可举报";
  if (status === 404) return "稿件不存在";
  return message ?? `举报失败 (HTTP ${status})`;
}
