"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

const TABS = [
  { href: "/", value: "recommend", label: "推荐" },
  { href: "/rank/hot", value: "hot", label: "热点榜" },
  { href: "/rank/best", value: "best", label: "爆文榜" },
  { href: "/rank/external/douyin", value: "douyin", label: "抖音热榜" },
];

export function RankTabs() {
  const pathname = usePathname();
  const activeTab = TABS.find((t) => t.href === pathname)?.value ?? "recommend";
  return (
    <Tabs value={activeTab} className="mb-4">
      <TabsList variant="line">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} asChild>
            <Link href={t.href}>{t.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
