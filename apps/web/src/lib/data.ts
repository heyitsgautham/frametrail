import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CaseFileError, parseCase } from "./case-schema";
import type { Case, LogEntry } from "./types";

export const REPO = path.resolve(process.cwd(), "../..");
export const CLIPS = path.join(REPO, "data/local/clips");
const CASE = process.env.FT_CASE || path.join(REPO, "data/demo/derived/case.json");

function read(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CaseFileError(`No case file at ${file}. Run pnpm engine:analyse, or point FT_CASE at one.`);
    }
    throw e;
  }
}

// Read and checked on every request, so a fresh engine run shows without a rebuild and a broken
// file is named the moment it appears. The engine writes log records with rawTime, refTime and
// type; the screens read at, ref and kind.
export function loadCase(): Case {
  const c = parseCase(read(CASE), path.basename(CASE));
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
