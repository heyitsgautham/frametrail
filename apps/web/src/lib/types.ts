// The case file the engine writes to data/demo/derived/case.json. The app reads nothing else.

export type State = "indexed" | "recovered-unindexed" | "partial" | "overwritten" | "free" | "system";

export interface Case {
  id: string;
  title: string;
  createdAt: string;
  examiner: string;
  tz: string;
  sources: Source[];
  cameras: Camera[];
  segments: Segment[];
  alignment: Alignment[];
  detections: Detection[];
  provenance: { nodes: ProvNode[]; edges: [string, string][] };
  custody: CustodyEvent[];
  adapters: Adapter[];
  stats: Record<string, number | string>;
  footage: { name: string; url: string; licence: string; credit: string };
  log?: LogEntry[];
  reformat?: Reformat;
}

/** A record from a recorder's own event log, times as the recorder stored them. */
export interface LogEntry {
  sourceId: string;
  at: string;
  ref?: string;
  kind: string;
  text: string;
  user?: string;
  offset?: number;
}

/** Evidence that a recorder's disk was re-initialised before seizure. */
export interface Reformat {
  sourceId: string;
  at: string;
  ref?: string;
  evidence: string[];
  timeReversal: { blockOrder: number[]; times: string[] };
}

export interface Source {
  id: string;
  kind: "disk-image" | "native-export";
  fileName: string;
  sizeBytes: number;
  md5: string;
  sha256: string;
  acquiredAt: string;
  acquiredBy: string;
  writeBlocked: boolean;
  vendor: {
    family: string;
    confidence: number;
    signature: { offset: number; hex: string; ascii: string };
    model?: string;
    firmware?: string;
  };
  blocks?: { blockSize: number; total: number; runs: { start: number; count: number; state: State; segmentId?: string }[] };
  hashSeconds: number;
  structures?: Structures;
}

/** What the engine read of a disk's own structures. The damage fields appear only when found. */
export interface Structures {
  masterSector?: { offset: number; backupOffset: number; backupMatches: boolean; primaryIntact?: boolean; readFrom?: number };
  index?: { offset: number; copiesMatch: boolean; entries: number; readFrom?: number; readable?: boolean };
  image?: { expectedBytes: number; shortBy: number };
}

export interface Camera {
  id: string;
  name: string;
  sourceId: string;
  channel: number;
  fps: number;
  width: number;
  height: number;
  clock: {
    rawTz: string;
    offsetSec: number;
    driftPpm: number;
    uncertaintySec: number;
    method: string;
    reference: boolean;
    plantedOffsetSec?: number;
    seizure?: { dvrShown: string; reference: string; offsetSec: number; note: string };
  };
}

export interface Segment {
  id: string;
  cameraId: string;
  state: State;
  rawStart: string;
  rawEnd: string;
  refStart: string;
  refEnd: string;
  extent: { sourceId: string; byteStart: number; byteEnd: number };
  md5: string;
  sha256: string;
  clip?: string;
  poster?: string;
  frames: number;
  kept: string[];
  lost: string[];
  note?: string;
}

export interface Alignment {
  a: string;
  b: string;
  offsetSec: number;
  uncertaintySec: number;
  score: number;
  plantedSec?: number;
  driftPpm?: number;
  method?: string;
  curve: [number, number][];
}

export interface Detection {
  id: string;
  cameraId: string;
  segmentId: string;
  label: "person" | "motion" | "left-object";
  refTime: string;
  rawTime: string;
  confidence: number;
  box?: [number, number, number, number];
  model: { name: string; version: string; licence: string };
  review: "pending" | "confirmed" | "rejected";
  thumb?: string;
}

export interface ProvNode {
  id: string;
  kind: "source" | "extent" | "stream" | "derivative" | "clip" | "frame" | "report";
  label: string;
  sha256?: string;
  op?: string;
  tool?: string;
}

export interface CustodyEvent {
  seq: number;
  at: string;
  actor: string;
  action: string;
  objectId: string;
  sha256: string;
  prev: string;
  hash: string;
}

export interface Adapter {
  vendor: string;
  family: string;
  formats: string[];
  status: "tested-on-fixture" | "export-parser" | "next-phase";
  ops: string[];
  note: string;
}
