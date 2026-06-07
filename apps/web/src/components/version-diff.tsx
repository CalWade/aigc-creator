"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import type { JSONContent } from "@tiptap/react";

import { computeChanges, type DiffRange } from "@/lib/diff";

const HIGHLIGHT_KEY = new PluginKey("version-diff-highlight");

/**
 * 给只读 editor 套一个 Decoration 插件:把传入的 ranges 转成 inline decoration class。
 * 用 inline 而非 widget,因为我们就是要给已有文本节点加 className,不插新元素。
 */
function buildHighlightExt(ranges: DiffRange[], className: string): Extension {
  return Extension.create({
    name: "version-diff-highlight",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: HIGHLIGHT_KEY,
          props: {
            decorations: (state) => {
              const decos = ranges
                .filter((r) => r.from < r.to && r.to <= state.doc.content.size + 1)
                .map((r) => Decoration.inline(r.from, r.to, { class: className }));
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}

interface ReadOnlyDiffEditorProps {
  doc: JSONContent;
  ranges: DiffRange[];
  highlightClass: string;
}

function ReadOnlyDiffEditor({ doc, ranges, highlightClass }: ReadOnlyDiffEditorProps) {
  // 把 ranges + highlightClass 编入 key,内容/范围变了重建 editor 最简(diff 视图低频,无性能压力)。
  const key = useMemo(
    () => `${highlightClass}:${ranges.length}:${ranges.map((r) => `${r.from}-${r.to}`).join(",")}`,
    [ranges, highlightClass],
  );
  const ext = useMemo(() => buildHighlightExt(ranges, highlightClass), [ranges, highlightClass]);

  const editor = useEditor(
    {
      extensions: [StarterKit, ext],
      content: doc,
      editable: false,
      immediatelyRender: false,
    },
    [key],
  );

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) return <div className="text-xs text-zinc-500">加载中…</div>;

  return (
    <EditorContent
      editor={editor}
      className="prose prose-sm dark:prose-invert max-w-none focus:outline-none"
    />
  );
}

interface VersionDiffProps {
  /** 旧版本(选中的历史版本)— 渲染在左栏 */
  oldDoc: JSONContent;
  /** 新版本(草稿当前内容)— 渲染在右栏 */
  newDoc: JSONContent;
}

export function VersionDiff({ oldDoc, newDoc }: VersionDiffProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // 用 useMemo 跑 diff,避免每次渲染都跑(短文 50ms 左右,长文可能 200ms+)。
  const { deletions, insertions, error } = useMemo(() => {
    try {
      // schema 现取自一个临时 editor — useEditor 在外层组件里已用同套 StarterKit,parseJSON 一致。
      // 这里直接拿 PMNode + Schema 太重,改方案:延迟到 ReadOnlyDiffEditor 初始化后,
      // 但 diff 必须在渲染前算出 ranges 才能传给 plugin。
      // 解法:用一个临时 editor 拿 schema,跑完 diff 立即 destroy。
      const tmp = createTempSchema();
      const r = computeChanges(oldDoc, newDoc, tmp);
      return { deletions: r.deletions, insertions: r.insertions, error: null as string | null };
    } catch (err) {
      return {
        deletions: [],
        insertions: [],
        error: err instanceof Error ? err.message : "diff 失败",
      };
    }
  }, [oldDoc, newDoc]);

  // 滚动同步:左栏滚 → 右栏跟。简单 scrollTop 镜像,长文可能高度不齐(留 backlog)。
  function onScrollSync(
    e: React.UIEvent<HTMLDivElement>,
    target: React.RefObject<HTMLDivElement | null>,
  ) {
    if (target.current) target.current.scrollTop = e.currentTarget.scrollTop;
  }

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        diff 渲染失败: {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div
        ref={leftRef}
        onScroll={(e) => onScrollSync(e, rightRef)}
        className="overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3"
      >
        <div className="mb-2 text-xs font-medium text-zinc-500">旧版本</div>
        <ReadOnlyDiffEditor
          doc={oldDoc}
          ranges={deletions}
          highlightClass="bg-red-100 dark:bg-red-900/40 line-through"
        />
      </div>
      <div
        ref={rightRef}
        onScroll={(e) => onScrollSync(e, leftRef)}
        className="overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3"
      >
        <div className="mb-2 text-xs font-medium text-zinc-500">当前版本</div>
        <ReadOnlyDiffEditor
          doc={newDoc}
          ranges={insertions}
          highlightClass="bg-green-100 dark:bg-green-900/40"
        />
      </div>
    </div>
  );
}

// 共用 schema:必须和 TiptapBody 用同一套 StarterKit 配置,否则 fromJSON 解析会丢节点。
// StarterKit 只通过 editor 实例暴露 schema,这里走一次性构造拿出来后 module-level 缓存。
let cachedSchema: import("@tiptap/pm/model").Schema | null = null;
function createTempSchema(): import("@tiptap/pm/model").Schema {
  if (cachedSchema) return cachedSchema;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Editor } = require("@tiptap/react") as typeof import("@tiptap/react");
  const tmp = new Editor({
    extensions: [StarterKit],
  });
  cachedSchema = tmp.schema;
  tmp.destroy();
  return cachedSchema;
}
