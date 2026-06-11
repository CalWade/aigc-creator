"use client";
import { useState } from "react";
import type { PreflightResponse } from "@bytedance-aigc/shared";
import { apiFetch } from "@bytedance-aigc/ui/lib/auth";

export interface PreflightHookState {
  loading: boolean;
  data: PreflightResponse | null;
  error: string | null;
}

export function usePreflight(draftId: string) {
  const [state, setState] = useState<PreflightHookState>({
    loading: false,
    data: null,
    error: null,
  });
  const run = async (): Promise<PreflightResponse | null> => {
    setState({ loading: true, data: null, error: null });
    try {
      const res = await apiFetch(`/drafts/${draftId}/preflight`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        const msg = typeof body.message === "string" ? body.message : `预检失败 ${res.status}`;
        setState({ loading: false, data: null, error: msg });
        return null;
      }
      const data = (await res.json()) as PreflightResponse;
      setState({ loading: false, data, error: null });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ loading: false, data: null, error: msg });
      return null;
    }
  };
  return { ...state, run };
}

export interface PublishResult {
  id: string;
  publishedAt: string;
}

export function usePublish(draftId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (): Promise<PublishResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/drafts/${draftId}/publish`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: { message?: string } | string;
        };
        const m =
          typeof body.message === "string"
            ? body.message
            : (body.message?.message ?? `发布失败 ${res.status}`);
        setError(m);
        setLoading(false);
        return null;
      }
      const data = (await res.json()) as PublishResult;
      setLoading(false);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      return null;
    }
  };
  return { loading, error, run };
}
