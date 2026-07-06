"use client";

import { useEffect } from "react";

import { Button } from "@aigc-creator/ui/components/ui/button";
import { Card, CardContent } from "@aigc-creator/ui/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@aigc-creator/ui/components/ui/tabs";
import { useAdminReports, type AdminReportFilter } from "@/hooks/use-admin-reports";

import { ReportRow } from "./ReportRow";

const TABS: { key: AdminReportFilter; label: string }[] = [
  { key: "PENDING", label: "待处置" },
  { key: "RESOLVED", label: "已处置" },
  { key: "ALL", label: "全部" },
];

export function AdminReportsClient() {
  const { items, cursor, status, loading, error, load } = useAdminReports();

  useEffect(() => {
    void load("PENDING", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error === "无管理员权限") {
    return <p className="text-destructive text-sm">无管理员权限,请联系运维。</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={status} onValueChange={(v) => void load(v as AdminReportFilter, true)}>
        <TabsList variant="line">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">暂无举报。</p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((r) => (
          <li key={r.id}>
            <ReportRow report={r} onResolved={() => void load(status, true)} />
          </li>
        ))}
      </ul>
      <div className="flex justify-center">
        {cursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(status, false)}
            disabled={loading}
          >
            {loading ? "加载中…" : "加载更多"}
          </Button>
        )}
        {!cursor && loading && <span className="text-sm text-muted-foreground">加载中…</span>}
      </div>
    </div>
  );
}
