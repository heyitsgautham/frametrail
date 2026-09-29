import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Case, LogEntry } from "./types";

export const REPO = path.resolve(process.cwd(), "../..");
export const CLIPS = path.join(REPO, "data/local/clips");
const CASE = process.env.FT_CASE || path.join(REPO, "data/demo/derived/case.json");

type RawLog = Partial<LogEntry> & { rawTime?: string; refTime?: string; type?: string; byteOffset?: number };

// Read on every request, so a fresh engine run shows without a rebuild. The engine writes
// log records with rawTime, refTime and type; the screens read at, ref and kind.
export function loadCase(): Case {
  const c = JSON.parse(readFileSync(CASE, "utf8")) as Omit<Case, "log"> & { log?: RawLog[] };
  const log: LogEntry[] = (c.log ?? []).map((l) => ({
    sourceId: l.sourceId ?? "",
    at: l.at ?? l.rawTime ?? "",
    ref: l.ref ?? l.refTime,
    kind: l.kind ?? l.type ?? "",
    text: l.text ?? "",
    user: l.user ?? /user (\S+)/.exec(l.text ?? "")?.[1],
    offset: l.offset ?? l.byteOffset,
  }));
  return { ...c, log };
}
