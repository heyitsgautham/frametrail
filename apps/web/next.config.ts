import path from "node:path";
import type { NextConfig } from "next";

const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  outputFileTracingRoot: root,
  turbopack: { root },
  images: { unoptimized: true },
};

export default nextConfig;
