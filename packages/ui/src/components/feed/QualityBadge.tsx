import { Badge } from "../ui/badge";

// PRD §:570 — 仅 80+ 显示「优质」徽章
const PREMIUM_THRESHOLD = 80;

export function QualityBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  if (score < PREMIUM_THRESHOLD) return null;
  const sizeCls = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <Badge
      variant="secondary"
      className={`bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium rounded ${sizeCls}`}
    >
      优质
    </Badge>
  );
}
