// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { CLIPS } from "@/lib/data";
import { GET } from "./route";

// Serve from a scratch folder instead of data/local/clips, which only exists after an engine run.
vi.mock("@/lib/data", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return { CLIPS: mkdtempSync(`${tmpdir()}/ft-clips-`) };
});

const BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
writeFileSync(path.join(CLIPS, "C01.mp4"), BYTES);
mkdirSync(path.join(CLIPS, "detections"));
writeFileSync(path.join(CLIPS, "detections", "D001.jpg"), "jpeg");

function get(rel: string, range?: string) {
  const req = new Request(`http://localhost/clips/${rel}`, { headers: range ? { range } : {} });
  return GET(req, { params: Promise.resolve({ path: rel.split("/") }) });
}

describe("GET /clips/[...path]", () => {
  test("serves a whole clip with its type and length", async () => {
    const res = await get("C01.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("1000");
    expect(Buffer.from(await res.arrayBuffer()).equals(BYTES)).toBe(true);
  });

  test("serves a still inside a subfolder", async () => {
    const res = await get("detections/D001.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("jpeg");
  });

  test("answers 404 for a folder instead of failing mid-response", async () => {
    const res = await get("detections");
    expect(res.status).toBe(404);
  });

  test("answers 404 for a missing file and for a path outside the clips folder", async () => {
    expect((await get("C99.mp4")).status).toBe(404);
    expect((await get("../../package.json")).status).toBe(404);
  });
});
