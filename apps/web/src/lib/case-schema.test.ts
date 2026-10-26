import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CaseFileError, parseCase } from "./case-schema";

const DEMO = readFileSync(path.resolve(__dirname, "../../../../data/demo/derived/case.json"), "utf8");
const demo = () => JSON.parse(DEMO) as Record<string, unknown> & { segments: Record<string, unknown>[] };

function error(json: string): string {
  try {
    parseCase(json, "case.json");
  } catch (e) {
    expect(e).toBeInstanceOf(CaseFileError);
    return (e as Error).message;
  }
  throw new Error("parsed a case that should have failed");
}

describe("parseCase", () => {
  test("accepts the committed demo case and keeps fields the screens do not read", () => {
    const c = parseCase(DEMO, "case.json");
    expect(c.id).toBe("FT-26-014");
    expect(c.segments.length).toBeGreaterThan(0);
    expect((c as Record<string, unknown>).tools).toBeDefined();
    expect((c.segments[0] as Record<string, unknown>).firstBlock).toBeTypeOf("number");
  });

  test("turns the engine's null reformat into no reformat", () => {
    const c = parseCase(JSON.stringify({ ...demo(), reformat: null }), "case.json");
    expect(c.reformat).toBeUndefined();
  });

  test("names the field that has the wrong type", () => {
    const bad = demo();
    bad.segments[2] = { ...bad.segments[2], md5: 42 };
    const msg = error(JSON.stringify(bad));
    expect(msg).toContain("case.json is not a case file FrameTrail can show");
    expect(msg).toContain("segments[2].md5");
  });

  test("names a missing field and a value outside its set", () => {
    const { custody: _, ...rest } = demo();
    const bad = { ...rest, segments: [{ ...demo().segments[0], state: "deleted" }] };
    const msg = error(JSON.stringify(bad));
    expect(msg).toContain("segments[0].state");
    expect(msg).toContain("custody");
  });

  test("lists the first three problems and counts the rest", () => {
    const msg = error(JSON.stringify({ id: "x" }));
    expect(msg).toMatch(/, and \d+ more$/);
    expect(msg.split(";")).toHaveLength(3);
  });

  test("says when the file is not JSON at all", () => {
    expect(error("{ not json")).toMatch(/^case\.json is not valid JSON: /);
    expect(error("[]")).toContain("(top level)");
  });
});
