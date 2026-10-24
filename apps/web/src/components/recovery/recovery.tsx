"use client";

import { Check, FileSearch, ScanSearch, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { bytes, clock, hex, media, secs, STATE_COLOR, STATE_LABEL, short } from "@/lib/format";
import type { LogEntry, Reformat, Segment, Source } from "@/lib/types";
import { useCarved } from "@/lib/carved";
import { useDone, useProgress } from "@/lib/use-done";
import { cn } from "@/lib/utils";

// Why the disk camera has a hole, and what carving gets back. The recorder's own log and
// the order of times across the blocks show the disk was initialised; carving the
// unallocated blocks finds the footage the format left behind.
export function Recovery({
  source,
  segments,
  cameras,
  log,
  reformat,
}: {
  source: Source;
  segments: Segment[];
  cameras: Record<string, string>;
  log: LogEntry[];
  reformat?: Reformat;
}) {
  const done = useDone();
  const [carved, carve] = useCarved();
  const [scanning, setScanning] = useState(false);
  const scan = useProgress(scanning, 3800, done);
  const found = segments.filter((s) => s.state !== "indexed");
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (done && found[0]) setSel(found[0].id);
  }, [done, found]);
  useEffect(() => {
    if (scanning && scan >= 1 && !carved) carve();
  }, [scanning, scan, carved, carve]);
  const shown = carved ? segments : segments.filter((s) => s.state === "indexed");
  const seg = segments.find((s) => s.id === sel);
  const total = source.blocks?.total ?? 1;
  const bs = source.blocks?.blockSize ?? 1;

  return (
    <div className="pb-10">
      <PageHead kicker="Step 3 · Recovery" title="Someone wiped this recorder">
        <button
          type="button"
          data-testid="carve"
          onClick={() => setScanning(true)}
          disabled={scanning || carved}
          className={cn(
            "flex items-center gap-2 rounded-md px-5 py-3 text-[16px] font-bold",
            carved ? "border border-teal/40 bg-teal/10 text-teal" : "bg-amber text-amber-ink",
          )}
        >
          <ScanSearch className="h-5 w-5" />
          {carved ? `${found.filter((s) => s.clip).length} segments carved` : scanning ? "Carving…" : "Carve unallocated blocks"}
        </button>
      </PageHead>
      <div className="flex flex-col gap-5 px-8">
        <div className="grid grid-cols-[1fr_520px] gap-5">
          <Reversal reformat={reformat} total={total} />
          <Panel className="p-5" data-testid="recorder-log">
            <Label>The recorder&apos;s own log</Label>
            <div className="mt-3 flex flex-col gap-2">
              {log.map((l) => {
                const bad = /init|format/i.test(`${l.kind} ${l.text}`);
                return (
                  <div
                    key={`${l.at}-${l.text}`}
                    className={cn("flex items-center gap-3 rounded-md border px-3 py-2", bad ? "border-red/60 bg-red/10" : "border-line")}
                  >
                    <span className="font-mono text-[14px] text-ink-2">{clock(secs(l.at))}</span>
                    <span className={cn("flex-1 text-[15px]", bad ? "font-bold text-red" : "text-ink")}>{l.text}</span>
                    {l.user && <span className="font-mono text-[13px] text-ink-3">{l.user}</span>}
                  </div>
                );
              })}
            </div>
            {reformat && (
              <div className="mt-4 flex flex-col gap-1.5">
                {reformat.evidence.map((e) => (
                  <div key={e} className="flex gap-2 text-[14px] leading-snug text-ink-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red" />
                    {e}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel className="px-5 py-4" data-testid="carve-strip">
          <div className="flex items-center justify-between">
            <Label>Unallocated blocks, scanned for video frames</Label>
            <span className="font-mono text-[13px] text-ink-3 tabular">{Math.round(scan * 100)}%</span>
          </div>
          <div className="relative mt-3 h-8 overflow-hidden rounded bg-[#1a1e22]">
            {source.blocks?.runs.map((r, i) => {
              const lit = carved || scan * total >= r.start;
              const hidden = !carved && r.state !== "indexed" && r.state !== "system";
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 transition-all duration-500"
                  style={{
                    left: `${(r.start / total) * 100}%`,
                    width: `${(r.count / total) * 100}%`,
                    background: hidden && !lit ? "#1a1e22" : STATE_COLOR[r.state],
                    opacity: seg && r.segmentId !== seg.id ? 0.35 : 1,
                  }}
                />
              );
            })}
            {scanning && scan < 1 && (
              <div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_16px_white]" style={{ left: `${scan * 100}%` }} />
            )}
          </div>
        </Panel>

        <div className="grid grid-cols-[600px_1fr] gap-5">
          <Panel className="p-3" data-testid="segment-list">
            <div className="flex px-3 pb-2 pt-2 text-[12px] font-semibold text-ink-3">
              <span className="w-[140px]">Segment</span>
              <span className="flex-1">Recorder time</span>
              <span className="w-[130px] text-right">State</span>
            </div>
            <AnimatePresence initial={false}>
              {shown.map((s) => (
                <motion.button
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  type="button"
                  data-testid={`seg-${s.id}`}
                  onClick={() => setSel(s.id)}
                  className={cn(
                    "relative flex w-full items-center rounded-md px-3 py-2.5 text-left transition-colors",
                    sel === s.id ? "bg-panel-2" : "hover:bg-panel-2/60",
                  )}
                >
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ background: STATE_COLOR[s.state] }} />
                  <span className="w-[140px] font-mono text-[14px] text-ink">{s.id}</span>
                  <span className="flex-1 whitespace-nowrap font-mono text-[14px] text-ink-2 tabular">
                    {clock(secs(s.rawStart))} to {clock(secs(s.rawEnd))}
                  </span>
                  <span className="w-[130px] text-right text-[13px] font-semibold" style={{ color: STATE_COLOR[s.state] }}>
                    {s.state === "recovered-unindexed" ? "Carved" : STATE_LABEL[s.state]}
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </Panel>
          <AnimatePresence mode="wait">
            {seg ? (
              <motion.div
                key={seg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <SegmentView seg={seg} camera={cameras[seg.cameraId] ?? seg.cameraId} blockSize={bs} />
              </motion.div>
            ) : (
              <Panel className="grid place-items-center p-10 text-ink-3">
                <div className="flex flex-col items-center gap-3">
                  <FileSearch className="h-10 w-10" />
                  <span className="text-[16px]">
                    {carved ? "Pick a carved segment to play it" : "The index lists only what was recorded after the wipe"}
                  </span>
                </div>
              </Panel>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Block number against recorded time. A recorder writes forward in time, so times fall
// back where the new recording restarted at the front of the disk.
function Reversal({ reformat, total }: { reformat?: Reformat; total: number }) {
  if (!reformat) return <Panel className="p-5 text-ink-3">No sign of re-initialisation</Panel>;
  const { blockOrder, times } = reformat.timeReversal;
  const pts = blockOrder.map((b, i) => ({ b, t: secs(times[i] ?? "") }));
  const ts = pts.map((p) => p.t);
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  const W = 760;
  const H = 360;
  const maxB = Math.max(total, ...blockOrder);
  const px = (b: number) => 56 + (b / maxB) * (W - 70);
  const py = (t: number) => H - 24 - ((t - t0) / (t1 - t0 || 1)) * (H - 40);
  let drop = -1;
  for (let i = 1; i < pts.length; i++) if (pts[i]!.t < pts[i - 1]!.t && drop < 0) drop = i;
  return (
    <Panel className="flex flex-col p-5" data-testid="time-reversal">
      <div className="flex items-center justify-between">
        <Label>Time reversal · block number against recorded time</Label>
        <span className="rounded bg-red px-2 py-0.5 text-[12px] font-bold text-[#101214]">Disk was initialised</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="mt-3 min-h-0 w-full flex-1">
        <line x1={56} x2={W - 10} y1={H - 24} y2={H - 24} stroke="#2a3035" />
        <line x1={56} x2={56} y1={8} y2={H - 24} stroke="#2a3035" />
        <text x={56} y={H - 4} fill="#737874" fontSize="15" fontFamily="var(--font-code)">
          block 0
        </text>
        <text x={W - 10} y={H - 4} fill="#737874" fontSize="12" textAnchor="end" fontFamily="var(--font-code)">
          block {maxB}
        </text>
        <text x={48} y={py(t1) + 5} fill="#737874" fontSize="14" textAnchor="end" fontFamily="var(--font-code)">
          {clock(t1).slice(0, 5)}
        </text>
        <text x={48} y={py(t0) + 5} fill="#737874" fontSize="14" textAnchor="end" fontFamily="var(--font-code)">
          {clock(t0).slice(0, 5)}
        </text>
        {pts.map((p, i) => (
          <motion.circle
            key={i}
            cx={px(p.b)}
            cy={py(p.t)}
            r={7}
            fill={drop >= 0 && i < drop ? "#5b8def" : "#f4b400"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.03 * i }}
          />
        ))}
        {drop > 0 && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * pts.length + 0.3 }}>
            <line
              x1={px(pts[drop - 1]!.b)}
              y1={py(pts[drop - 1]!.t)}
              x2={px(pts[drop]!.b)}
              y2={py(pts[drop]!.t)}
              stroke="#f0564a"
              strokeWidth="3"
              strokeDasharray="6 5"
            />
            <text
              x={(px(pts[drop - 1]!.b) + px(pts[drop]!.b)) / 2 + 10}
              y={(py(pts[drop - 1]!.t) + py(pts[drop]!.t)) / 2}
              fill="#f0564a"
              fontSize="18"
              fontWeight="700"
            >
              time runs backwards here
            </text>
          </motion.g>
        )}
      </svg>
      <div className="mt-2 flex gap-6 text-[14px] text-ink-3">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#5b8def]" /> After the wipe, written from block 0
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Older footage the wipe left behind
        </span>
      </div>
    </Panel>
  );
}

function SegmentView({ seg, camera, blockSize }: { seg: Segment; camera: string; blockSize: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    ref.current?.play().catch(() => {});
  }, []);
  const found = seg.state === "recovered-unindexed";
  return (
    <Panel className="overflow-hidden" data-testid="segment-view">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[16px] text-ink">{seg.id}</span>
          <span className="text-[14px] text-ink-3">{camera}</span>
        </div>
        <span className="rounded px-2.5 py-1 text-[13px] font-bold" style={{ background: STATE_COLOR[seg.state], color: "#101214" }}>
          {STATE_LABEL[seg.state]}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_300px]">
        <div className="relative bg-black">
          {seg.clip ? (
            <video
              ref={ref}
              src={media(seg.clip)}
              poster={media(seg.poster)}
              muted
              playsInline
              loop
              className="aspect-[4/3] w-full object-contain"
              data-testid="segment-video"
            />
          ) : (
            <div className="grid aspect-[4/3] place-items-center text-ink-3">Nothing decodable survives</div>
          )}
          {seg.note && (
            <div className="absolute left-4 top-4 flex max-w-[80%] items-center gap-2 rounded-md bg-black/75 px-3 py-2 text-[14px] text-ink backdrop-blur">
              {found ? <FileSearch className="h-4 w-4 text-amber" /> : <TriangleAlert className="h-4 w-4 text-[var(--st-partial)]" />}
              {seg.note}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 border-l border-line p-5 text-[14px]">
          <div data-testid="extent">
            <Label>Byte extent in {seg.extent.sourceId}</Label>
            <div className="mt-1.5 font-mono text-[15px] text-ink">{hex(seg.extent.byteStart, 9)}</div>
            <div className="font-mono text-[15px] text-ink">{hex(seg.extent.byteEnd, 9)}</div>
            <div className="mt-1 text-ink-3">
              {bytes(seg.extent.byteEnd - seg.extent.byteStart)} · blocks {Math.floor(seg.extent.byteStart / blockSize)} to{" "}
              {Math.floor((seg.extent.byteEnd - 1) / blockSize)}
            </div>
          </div>
          <div>
            <Label>Hashes of the extent</Label>
            <div className="mt-1.5 font-mono text-[13px] text-ink-2">MD5 {short(seg.md5, 6)}</div>
            <div className="font-mono text-[13px] text-ink-2">SHA-256 {short(seg.sha256, 6)}</div>
          </div>
          <div>
            <Label>Kept</Label>
            {seg.kept.map((k) => (
              <div key={k} className="mt-1.5 flex gap-2 text-ink-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {k}
              </div>
            ))}
          </div>
          {seg.lost.length > 0 && (
            <div>
              <Label>Lost or absent</Label>
              {seg.lost.map((k) => (
                <div key={k} className="mt-1.5 flex gap-2 text-ink-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red" /> {k}
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto font-mono text-[13px] text-ink-3">{seg.frames.toLocaleString("en-IN")} frames decoded</div>
        </div>
      </div>
    </Panel>
  );
}
