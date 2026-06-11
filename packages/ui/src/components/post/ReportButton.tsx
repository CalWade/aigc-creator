"use client";

import { useState, useSyncExternalStore } from "react";

import { getUser } from "../../lib/auth";

import { ReportDialog } from "./ReportDialog";

interface ReportButtonProps {
  postId: string;
  authorId: string;
}

const subscribe = (cb: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

const getMeId = (): string | null => getUser()?.id ?? null;

export function ReportButton({ postId, authorId }: ReportButtonProps) {
  const meId = useSyncExternalStore(subscribe, getMeId, () => null);
  const [open, setOpen] = useState(false);

  if (meId === authorId) return null;

  const handleClick = (): void => {
    if (!meId) {
      window.location.assign("/login");
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="text-sm text-zinc-500 hover:text-red-600 underline"
      >
        举报
      </button>
      <ReportDialog postId={postId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
