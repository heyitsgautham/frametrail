import { secs } from "@/lib/format";
import type { Camera, Case } from "@/lib/types";

// The moment both players open on: people on the second camera while the disk camera was
// recording. The engine may name it in stats.syncRef.
export function pickMoment(c: Case, first: Camera, second: Camera): { t: number } | null {
  const named = c.stats.syncRef;
  if (named !== undefined) return { t: typeof named === "number" ? named : secs(String(named)) };
  // Both players need room to run: at least 14 s of the same segment after the moment.
  const at = (cam: Camera, t: number) =>
    c.segments.find((s) => s.cameraId === cam.id && s.clip && secs(s.refStart) + 1 <= t && t <= secs(s.refEnd) - 14);
  // Prefer a moment with people on the second camera while the first camera's footage there
  // had to be carved back, so the players open on the recovered picture.
  const people = c.detections
    .filter((d) => d.label === "person" && d.cameraId === second.id)
    .map((d) => ({
      t: secs(d.refTime),
      score: d.confidence * ((d as { count?: number }).count ?? 1),
      found: at(first, secs(d.refTime))?.state,
    }))
    .filter((p) => p.found)
    .sort((p, q) => Number(q.found === "recovered-unindexed") - Number(p.found === "recovered-unindexed") || q.score - p.score);
  if (people[0]) return { t: people[0].t };
  for (const s of c.segments.filter((s) => s.cameraId === second.id && s.clip)) {
    const t = secs(s.refStart) + 5;
    if (at(first, t)) return { t };
  }
  return null;
}
