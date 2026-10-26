import { z } from "zod";

// The shape every screen relies on, checked once where case.json enters the app. FT_CASE can
// point at any file, so a wrong or damaged one stops here with the field named, instead of
// failing somewhere inside a screen. Objects stay loose: fields the screens do not read pass
// through untouched, so a newer engine can add fields without breaking the workbench.

const state = z.enum(["indexed", "recovered-unindexed", "partial", "overwritten", "free", "system"]);
const text = z.string();
const count = z.number().int().nonnegative();

const source = z.looseObject({
  id: text,
  kind: z.enum(["disk-image", "native-export"]),
  fileName: text,
  sizeBytes: count,
  md5: text,
  sha256: text,
  acquiredAt: text,
  acquiredBy: text,
  writeBlocked: z.boolean(),
  vendor: z.looseObject({
    family: text,
    confidence: z.number(),
    signature: z.looseObject({ offset: z.number().int(), hex: text, ascii: text }),
    model: text.optional(),
    firmware: text.optional(),
  }),
  blocks: z
    .looseObject({
      blockSize: count,
      total: count,
      runs: z.array(z.looseObject({ start: count, count: count, state, segmentId: text.optional() })),
    })
    .optional(),
  hashSeconds: z.number(),
});

const camera = z.looseObject({
  id: text,
  name: text,
  sourceId: text,
  channel: z.number().int(),
  fps: z.number().positive(),
  width: count,
  height: count,
  clock: z.looseObject({
    rawTz: text,
    offsetSec: z.number(),
    driftPpm: z.number(),
    uncertaintySec: z.number(),
    method: text,
    reference: z.boolean(),
    plantedOffsetSec: z.number().optional(),
    seizure: z.looseObject({ dvrShown: text, reference: text, offsetSec: z.number(), note: text }).optional(),
  }),
});

const segment = z.looseObject({
  id: text,
  cameraId: text,
  state,
  rawStart: text,
  rawEnd: text,
  refStart: text,
  refEnd: text,
  extent: z.looseObject({ sourceId: text, byteStart: count, byteEnd: count }),
  md5: text,
  sha256: text,
  clip: text.optional(),
  poster: text.optional(),
  frames: count,
  kept: z.array(text),
  lost: z.array(text),
  note: text.optional(),
});

const alignment = z.looseObject({
  a: text,
  b: text,
  offsetSec: z.number(),
  uncertaintySec: z.number(),
  score: z.number(),
  plantedSec: z.number().optional(),
  driftPpm: z.number().optional(),
  method: text.optional(),
  curve: z.array(z.tuple([z.number(), z.number()])),
});

const detection = z.looseObject({
  id: text,
  cameraId: text,
  segmentId: text,
  label: z.enum(["person", "motion", "left-object"]),
  refTime: text,
  rawTime: text,
  confidence: z.number().min(0).max(1),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  model: z.looseObject({ name: text, version: text, licence: text }),
  review: z.enum(["pending", "confirmed", "rejected"]),
  thumb: text.optional(),
});

const provNode = z.looseObject({
  id: text,
  kind: z.enum(["source", "extent", "stream", "derivative", "clip", "frame", "report"]),
  label: text,
  sha256: text.optional(),
  op: text.optional(),
  tool: text.optional(),
});

const custodyEvent = z.looseObject({
  seq: count,
  at: text,
  actor: text,
  action: text,
  objectId: text,
  sha256: text,
  prev: text,
  hash: text,
});

const adapter = z.looseObject({
  vendor: text,
  family: text,
  formats: z.array(text),
  status: z.enum(["tested-on-fixture", "export-parser", "next-phase"]),
  ops: z.array(text),
  note: text,
});

// The engine writes rawTime, refTime, type and byteOffset; older cases used the screens' names.
const rawLog = z.looseObject({
  sourceId: text.optional(),
  at: text.optional(),
  ref: text.optional(),
  kind: text.optional(),
  text: text.optional(),
  user: text.optional(),
  offset: z.number().optional(),
  rawTime: text.optional(),
  refTime: text.optional(),
  type: text.optional(),
  byteOffset: z.number().optional(),
});

const reformat = z.looseObject({
  sourceId: text,
  at: text,
  ref: text.optional(),
  evidence: z.array(text),
  timeReversal: z.looseObject({ blockOrder: z.array(z.number()), times: z.array(text) }),
});

export const caseFile = z.looseObject({
  id: text,
  title: text,
  createdAt: text,
  examiner: text,
  tz: text,
  sources: z.array(source),
  cameras: z.array(camera),
  segments: z.array(segment),
  alignment: z.array(alignment),
  detections: z.array(detection),
  provenance: z.looseObject({ nodes: z.array(provNode), edges: z.array(z.tuple([text, text])) }),
  custody: z.array(custodyEvent),
  adapters: z.array(adapter),
  stats: z.record(z.string(), z.union([z.number(), text])),
  footage: z.looseObject({ name: text, url: text, licence: text, credit: text }),
  log: z.array(rawLog).optional(),
  // The engine writes null when it finds no re-initialisation.
  reformat: reformat.nullish().transform((r) => r ?? undefined),
});

export type CaseFile = z.output<typeof caseFile>;

/** A case file that does not match what the screens read. The message names the file and the fields. */
export class CaseFileError extends Error {
  override name = "CaseFileError";
}

function where(path: PropertyKey[]): string {
  return path.reduce<string>((out, k) => (typeof k === "number" ? `${out}[${k}]` : out ? `${out}.${String(k)}` : String(k)), "");
}

/** Parse case.json text, or throw a CaseFileError naming the first fields that are wrong. */
export function parseCase(json: string, file: string): CaseFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new CaseFileError(`${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const res = caseFile.safeParse(raw);
  if (res.success) return res.data;
  const issues = res.error.issues.slice(0, 3).map((i) => `${where(i.path) || "(top level)"}: ${i.message}`);
  const more = res.error.issues.length > 3 ? `, and ${res.error.issues.length - 3} more` : "";
  throw new CaseFileError(`${file} is not a case file FrameTrail can show. ${issues.join("; ")}${more}`);
}
