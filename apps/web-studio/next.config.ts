import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@bytedance-aigc/ui", "@bytedance-aigc/shared"],
  // Multi-Zones: studio 挂在消费端的 /studio/* 子路径下
  basePath: "/studio",
  assetPrefix: "/studio-static",
};

export default nextConfig;
