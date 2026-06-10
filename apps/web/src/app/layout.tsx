import type { Metadata } from "next";
import { Fraunces, Instrument_Serif, IBM_Plex_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { SiteMasthead } from "@/components/site-masthead";
import { SiteFooter } from "@/components/site-footer";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const notoSerif = Noto_Serif_SC({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "炽 · CHÌ — AI 创作者编辑部",
  description: "为创作者打造的 AI 辅助生产与分发平台 · 双轨创作 · 五阶段审核 · 双榜分发",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${fraunces.variable} ${instrument.variable} ${plexMono.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteMasthead />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
