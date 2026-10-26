// @vitest-environment node
import { describe, expect, test } from "vitest";
import nextConfig, { CSP } from "./next.config";

describe("security headers", () => {
  test("every path gets the policy and the hardening headers", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");
    const names = rules[0]!.headers.map((h) => h.key);
    expect(names).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });

  test("the policy allows only the app's own origin and never eval outside development", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("connect-src 'self'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).not.toContain("unsafe-eval");
    expect(CSP).not.toMatch(/https?:/);
  });
});
