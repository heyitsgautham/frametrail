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

  test("answers a byte range with 206 and the matching slice", async () => {
    const res = await get("C01.mp4", "bytes=100-199");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(Buffer.from(await res.arrayBuffer()).equals(BYTES.subarray(100, 200))).toBe(true);
  });

  test("answers an open-ended range, a suffix range and a range past the end", async () => {
    expect((await get("C01.mp4", "bytes=900-")).headers.get("content-range")).toBe("bytes 900-999/1000");
    expect((await get("C01.mp4", "bytes=-100")).headers.get("content-range")).toBe("bytes 900-999/1000");
    expect((await get("C01.mp4", "bytes=990-5000")).headers.get("content-range")).toBe("bytes 990-999/1000");
  });

  test("answers 416 for a range that starts past the end", async () => {
    const res = await get("C01.mp4", "bytes=1000-");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  test("ignores a Range header that names no valid range and sends the whole clip", async () => {
    for (const range of ["bytes=-", "bytes=500-100", "items=0-10"]) {
      const res = await get("C01.mp4", range);
      expect(res.status, range).toBe(200);
      expect(res.headers.get("content-length"), range).toBe("1000");
    }
  });
});
