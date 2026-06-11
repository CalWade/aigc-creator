import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@bytedance-aigc/ui", "@bytedance-aigc/shared"],
};

export default nextConfig;
