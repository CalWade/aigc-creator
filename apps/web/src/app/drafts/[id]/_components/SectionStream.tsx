"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { OutlineItem } from "@bytedance-aigc/shared";

import { useStreamingGeneration } from "@/hooks/use-streaming-generation";

interface SectionStreamProps {
  editor: Editor | null;
  draftId: string;
  sections: OutlineItem[];
  onComplete: () => void;
  onError: (msg: string) => void;
  setStreaming: (on: boolean) => void;
  flush: () => Promise<void>;
}

/**
 * 把 SSE 流式生成的 token 写到 TipTap editor。
 * 帧序:section.start → token×N → section.end → ... → done。
 *
 * autosave 协调:
 *   - 流前 await flush() + setStreaming(true) → 期间不发 PATCH
 *   - 流末 setStreaming(false) → 调用方在 onComplete 中 flush()
 *
 * 流期间 editable=false,防止用户在 token 写入时改光标。
 */
export function SectionStream({
  editor,
  draftId,
  sections,
  onComplete,
  onError,
  setStreaming,
  flush,
}: SectionStreamProps) {
  const { status, start, stop } = useStreamingGeneration();
  const startedRef = useRef(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!editor || startedRef.current) return;
    startedRef.current = true;

    const sectionEnds: number[] = []; // editor.state.doc 末尾位置缓存,token 插入点

    void (async () => {
      await flush();
      setStreaming(true);
      editor.setEditable(false);

      try {
        await start(draftId, sections, {
          onSectionStart: ({ heading }) => {
            editor
              .chain()
              .focus("end")
              .insertContent([
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: heading }],
                },
                { type: "paragraph" },
              ])
              .run();
            sectionEnds.push(editor.state.doc.content.size);
          },
          onToken: ({ delta }) => {
            editor.chain().focus("end").insertContent(delta).run();
          },
          onSectionEnd: () => {
            // 段落落地,结尾再加一个空段
            editor.chain().focus("end").insertContent({ type: "paragraph" }).run();
          },
          onDone: () => {
            // status 在 hook 内已置 done
          },
          onError: ({ message }) => {
            setErrMsg(message);
            onError(message);
          },
        });
      } finally {
        editor.setEditable(true);
        setStreaming(false);
        await flush().catch(() => {});
        onComplete();
      }
    })();

    return () => {
      stop();
    };
    // editor / draftId / sections 在父组件内一旦传入即固定;依赖刻意省略让 effect 只跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      {status === "streaming" && <span>正在生成正文…</span>}
      {status === "done" && <span className="text-emerald-600">生成完成</span>}
      {status === "error" && <span className="text-red-600">生成失败:{errMsg ?? "unknown"}</span>}
      {status === "streaming" && (
        <button
          type="button"
          onClick={stop}
          className="ml-2 text-xs underline text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          停止
        </button>
      )}
    </div>
  );
}
