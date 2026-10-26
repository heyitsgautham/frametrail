import { existsSync } from "node:fs";
import { CLIPS, loadCase } from "@/lib/data";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Liveness for the container healthcheck. Healthy means the case file parses, since every
// screen reads it; missing clips only leave the video players empty, so they are reported
// and do not fail the check.
export function GET() {
  try {
    const c = loadCase();
    return Response.json({ status: "ok", case: c.id, segments: c.segments.length, clips: existsSync(CLIPS) });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.warn({ error }, "health check failed");
    return Response.json({ status: "error", error }, { status: 503 });
  }
}
