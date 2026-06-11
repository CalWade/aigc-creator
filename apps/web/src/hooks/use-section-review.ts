"use client";

import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { SectionReviewResponse } from "@bytedance-aigc/shared";

import { apiFetch } from "@bytedance-aigc/ui/lib/auth";
import { dispatchSetViolations, type Violation } from "@/lib/tiptap/review-decorations";

export interface SectionReviewItem {
  heading: string;
  range: { from: number; to: number };
  result: SectionReviewResponse;
}

export interface UseSectionReviewState {
  items: SectionReviewItem[];
  reviewSection: (input: {
    draftId: string;
    sessionId: string;
    heading: string;
    range: { from: number; to: number };
    text: string;
  }) => Promise<SectionReviewResponse | null>;
  dismiss: (heading: string) => void;
  reset: () => void;
}

/**
 * fire-and-forget 段落审核;命中 → dispatchSetViolations(section)。
 * 返回 result 给调用方判断 abortStream。
 */
export function useSectionReview(editor: Editor | null): UseSectionReviewState {
  const [items, setItems] = useState<SectionReviewItem[]>([]);
  const violationsRef = useRef<Violation[]>([]);

  const reviewSection: UseSectionReviewState["reviewSection"] = useCallback(
    async (input) => {
      try {
        const res = await apiFetch("/reviews/section", {
          method: "POST",
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as SectionReviewResponse;
        if (body.recommendation !== "ALLOW" && editor) {
          const v: Violation = {
            id: body.reviewId || `sect-${input.range.from}-${input.range.to}`,
            from: input.range.from,
            to: Math.min(input.range.to, editor.state.doc.content.size),
            severity: body.severity,
            category: body.hitCategories[0] ?? "section",
            source: "section",
            message: body.message,
          };
          if (v.from < v.to) {
            violationsRef.current = [...violationsRef.current, v];
            dispatchSetViolations(editor, "section", violationsRef.current);
            setItems((prev) => [
              ...prev,
              { heading: input.heading, range: input.range, result: body },
            ]);
          }
        }
        return body;
      } catch {
        return null;
      }
    },
    [editor],
  );

  const dismiss = useCallback(
    (heading: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.heading !== heading);
        if (editor) {
          violationsRef.current = violationsRef.current.filter((v) =>
            next.some((i) => i.range.from === v.from && i.range.to === v.to),
          );
          dispatchSetViolations(editor, "section", violationsRef.current);
        }
        return next;
      });
    },
    [editor],
  );

  const reset = useCallback(() => {
    violationsRef.current = [];
    setItems([]);
    if (editor) dispatchSetViolations(editor, "section", []);
  }, [editor]);

  return { items, reviewSection, dismiss, reset };
}
