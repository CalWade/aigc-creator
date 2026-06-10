import * as React from "react";

/**
 * 编辑器专注模式 layout (Notion DNA)。
 *
 * (creator)/layout.tsx 已套了 AppShell(sidebar + topbar),这一层只负责把
 * 主区收成 Notion-like 阅读容器:
 *   - 浅色背景沿用 root background
 *   - max-w-[820px] 居中,顶部 24px、左右 32px
 *   - 编辑器自己的工具条 / banner 由 DraftEditor 渲染,这里只提供画布
 *
 * 不改 DraftEditor 内部任何逻辑(autosave / preflight / SSE 等保持原状)。
 */
export default function DraftEditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-svh">
      <div className="mx-auto w-full max-w-[820px] px-8 pt-6 pb-16">{children}</div>
    </div>
  );
}
