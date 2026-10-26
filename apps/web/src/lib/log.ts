import "server-only";
import pino, { type DestinationStream, type Logger } from "pino";

// The workbench server's log: one JSON object per line on stdout, so `docker compose logs web`
// or any log shipper can filter by level, route or digest. LOG_LEVEL sets the floor.
export function createLog(dest?: DestinationStream): Logger {
  const opts = { name: "frametrail-web", level: process.env.LOG_LEVEL || "info", timestamp: pino.stdTimeFunctions.isoTime };
  return dest ? pino(opts, dest) : pino(opts);
}

export const log = createLog();

type RequestInfo = Readonly<{ path: string; method: string }>;
type ErrorContext = Readonly<{ routePath: string; routeType: string; renderSource?: string }>;

/**
 * One record for a request that failed on the server. The digest is the number Next shows on
 * its error page in place of the message, so an examiner's screenshot leads to this line.
 */
export function logRequestError(logger: Logger, err: unknown, req: RequestInfo, ctx: ErrorContext): void {
  const digest = typeof err === "object" && err && "digest" in err ? String(err.digest) : undefined;
  logger.error(
    { err, digest, method: req.method, path: req.path, route: ctx.routePath, routeType: ctx.routeType, renderSource: ctx.renderSource },
    "request failed",
  );
}
