// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

const logRequestError = vi.hoisted(() => vi.fn());
vi.mock("./lib/log", () => ({ log: { name: "test" }, logRequestError }));

import { onRequestError } from "./instrumentation";

const req = { path: "/intake", method: "GET", headers: {} };
const ctx = { routerKind: "App Router", routePath: "/(case)/intake", routeType: "render", revalidateReason: undefined } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  logRequestError.mockClear();
});

describe("onRequestError", () => {
  test("logs a server error on the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const err = new Error("boom");
    await onRequestError(err, req, ctx);
    expect(logRequestError).toHaveBeenCalledWith({ name: "test" }, err, req, ctx);
  });

  test("does nothing on the edge runtime, where pino cannot run", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("boom"), req, ctx);
    expect(logRequestError).not.toHaveBeenCalled();
  });
});
