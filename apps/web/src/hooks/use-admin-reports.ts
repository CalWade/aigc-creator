"use client";
import { useState } from "react";
import type { ReportDto, ReportStatus, ResolveReportInput } from "@aigc-creator/shared";

import { apiFetch } from "@aigc-creator/ui/lib/auth";

export type AdminReportFilter = ReportStatus | "ALL";

export interface AdminReportsState {
  items: ReportDto[];
  cursor: string | null;
  status: AdminReportFilter;
  loading: boolean;
  error: string | null;
}

interface AdminReportsListResponse {
  items: ReportDto[];
  nextCursor: string | null;
}

export function useAdminReports() {
  const [state, setState] = useState<AdminReportsState>({
    items: [],
    cursor: null,
    status: "PENDING",
    loading: false,
    error: null,
  });

  const load = async (status: AdminReportFilter, reset: boolean): Promise<void> => {
    setState((prev) => ({
      items: reset ? [] : prev.items,
      cursor: reset ? null : prev.cursor,
      status,
      loading: true,
      error: null,
    }));
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("limit", "20");
      if (!reset) {
        const currentCursor = state.cursor;
        if (currentCursor) params.set("cursor", currentCursor);
      }
      const res = await apiFetch(`/admin/reports?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        const msg = mapListError(res.status, body.code, body.message);
        setState((prev) => ({
          items: reset ? [] : prev.items,
          cursor: reset ? null : prev.cursor,
          status,
          loading: false,
          error: msg,
        }));
        return;
      }
      const data = (await res.json()) as AdminReportsListResponse;
      setState((prev) => ({
        items: reset ? data.items : [...prev.items, ...data.items],
        cursor: data.nextCursor,
        status,
        loading: false,
        error: null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        items: reset ? [] : prev.items,
        cursor: reset ? null : prev.cursor,
        status,
        loading: false,
        error: msg,
      }));
    }
  };

  return { ...state, load };
}

export interface UseResolveReportState {
  loading: boolean;
  error: string | null;
}

export function useResolveReport() {
  const [state, setState] = useState<UseResolveReportState>({ loading: false, error: null });

  const run = async (reportId: string, input: ResolveReportInput): Promise<boolean> => {
    setState({ loading: true, error: null });
    try {
      const res = await apiFetch(`/admin/reports/${reportId}/resolve`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        const msg = mapResolveError(res.status, body.code, body.message);
        setState({ loading: false, error: msg });
        return false;
      }
      setState({ loading: false, error: null });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ loading: false, error: msg });
      return false;
    }
  };

  return { ...state, run };
}

function mapListError(status: number, code?: string, message?: string): string {
  if (code === "ADMIN_REQUIRED" || status === 403) return "无管理员权限";
  if (status === 401) return "请先登录";
  return message ?? `加载失败 (HTTP ${status})`;
}

function mapResolveError(status: number, code?: string, message?: string): string {
  if (code === "REPORT_ALREADY_RESOLVED") return "该举报已处置";
  if (code === "REPORT_NOT_FOUND") return "举报不存在";
  if (code === "ADMIN_REQUIRED" || status === 403) return "无管理员权限";
  if (status === 401) return "请先登录";
  return message ?? `处置失败 (HTTP ${status})`;
}
