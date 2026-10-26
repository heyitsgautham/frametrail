// @vitest-environment node
import { Writable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createLog, logRequestError } from "./log";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const dest = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(String(chunk)));
      done();
    },
  });
  return { lines, log: createLog(dest) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server log", () => {
  test("writes one JSON object per line with a level, a time and the service name", () => {
    const { lines, log } = capture();
    log.info({ route: "/health" }, "ready");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 30, name: "frametrail-web", route: "/health", msg: "ready" });
    expect(String(lines[0]?.time)).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  test("drops records under LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const { lines, log } = capture();
    log.info("hidden");
    log.warn("shown");
    expect(lines.map((l) => l.msg)).toEqual(["shown"]);
  });

  test("records a failed request with its digest, route and stack", () => {
    const { lines, log } = capture();
    const err = Object.assign(new Error("case.json is not a case file"), { digest: "2508870047" });
    logRequestError(log, err, { path: "/intake", method: "GET" }, { routePath: "/(case)/intake", routeType: "render" });
    expect(lines[0]).toMatchObject({
      level: 50,
      msg: "request failed",
      digest: "2508870047",
      method: "GET",
      path: "/intake",
      route: "/(case)/intake",
      routeType: "render",
    });
    const logged = lines[0]?.err as { message: string; stack: string };
    expect(logged.message).toBe("case.json is not a case file");
    expect(logged.stack).toContain("Error: case.json");
  });

  test("records a thrown value that is not an Error, with no digest", () => {
    const { lines, log } = capture();
    logRequestError(log, "plain string", { path: "/clips/x", method: "GET" }, { routePath: "/clips/[...path]", routeType: "route" });
    expect(lines[0]).toMatchObject({ level: 50, err: "plain string", route: "/clips/[...path]" });
    expect(lines[0]).not.toHaveProperty("digest");
  });
});
