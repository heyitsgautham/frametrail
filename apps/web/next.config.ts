import path from "node:path";
import type { NextConfig } from "next";

const root = path.join(__dirname, "../..");

// The workbench runs offline and loads nothing from another origin, so the policy allows only
// itself. Next's hydration scripts and Motion's style attributes are inline; development also
// needs eval for React's debugging, which a production build never sends.
const dev = process.env.NODE_ENV === "development";
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  outputFileTracingRoot: root,
  turbopack: { root },
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
