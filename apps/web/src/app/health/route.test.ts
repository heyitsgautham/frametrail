// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// data.ts reads FT_CASE when it loads, so each case gets a fresh module graph.
async function health(caseFile?: string) {
  vi.resetModules();
  if (caseFile) vi.stubEnv("FT_CASE", caseFile);
  const { GET } = await import("./route");
  const res = GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function scratch(name: string, body: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "ft-health-")), name);
  writeFileSync(file, body);
  return file;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /health", () => {
  test("reports ok with the case the screens read", async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", case: "FT-26-014" });
    expect(body.segments).toBeGreaterThan(0);
  });

  test("answers 503 naming the field when the case file is damaged", async () => {
    const { status, body } = await health(scratch("case.json", JSON.stringify({ id: 7 })));
    expect(status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.error).toContain("case.json is not a case file FrameTrail can show");
    expect(body.error).toContain("id:");
  });

  test("answers 503 saying how to make a case when there is none", async () => {
    const { status, body } = await health(path.join(tmpdir(), "ft-no-such-dir", "case.json"));
    expect(status).toBe(503);
    expect(body.error).toMatch(/^No case file at .*pnpm engine:analyse/);
  });
});
