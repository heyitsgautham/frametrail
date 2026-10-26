"use client";

import { Check, Fingerprint, HardDrive, Lock, Package, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { damage } from "@/lib/damage";
import { bytes, hex, STATE_COLOR, STATE_LABEL } from "@/lib/format";
import type { Source, State } from "@/lib/types";
import { useDone, useProgress } from "@/lib/use-done";
import { cn } from "@/lib/utils";

type Phase = "idle" | "hashing" | "identified" | "mapped";

// The film's opening: the seized disk image goes in read-only, both hashes compute over
// every byte, the vendor signature is found, and the disk map fills block by block.
export function Intake({ sources }: { sources: Source[] }) {
  const disk = sources.find((s) => s.kind === "disk-image") ?? sources[0]!;
  const rest = sources.filter((s) => s !== disk);
  const done = useDone();
  const [phase, setPhase] = useState<Phase>("idle");
  const hashing = useProgress(phase !== "idle", 3600, done);
  const mapping = useProgress(phase === "mapped", 4200, done);
  const damaged = useMemo(() => damage(disk), [disk]);

  useEffect(() => {
    if (done) setPhase("mapped");
  }, [done]);
  useEffect(() => {
    if (phase === "hashing" && hashing >= 1) {
      const t = setTimeout(() => setPhase("identified"), 500);
      return () => clearTimeout(t);
    }
    if (phase === "identified") {
      const t = setTimeout(() => setPhase("mapped"), 2600);
      return () => clearTimeout(t);
    }
  }, [phase, hashing]);

  return (
    <div className="pb-10">
      <PageHead kicker="Step 1 · Evidence intake" title="Acquire, hash, identify">
        <div
          className="flex items-center gap-2 rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[14px] font-semibold text-teal"
          data-testid="write-block"
        >
          <Lock className="h-4 w-4" /> Write-blocked · read only
        </div>
      </PageHead>
      <div className="grid grid-cols-[440px_1fr] gap-5 px-8">
        <div className="flex flex-col gap-5">
          <Panel className="p-5" data-testid="source-card">
            <Label>Seized recorder disk</Label>
            <div className="mt-3 flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-md border border-line-2 bg-panel-2">
                <HardDrive className="h-8 w-8 text-amber" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-mono text-[15px] text-ink">{disk.fileName}</div>
                <div className="mt-1 text-[14px] text-ink-3">
                  {disk.id} · {bytes(disk.sizeBytes)} raw image
                </div>
              </div>
            </div>
            {phase === "idle" ? (
              <button
                type="button"
                data-testid="acquire"
                onClick={() => setPhase("hashing")}
                className="mt-5 w-full rounded-md bg-amber py-3 text-[16px] font-bold text-amber-ink transition-transform hover:brightness-105 active:scale-[0.99]"
              >
                Acquire {disk.id}
              </button>
            ) : (
              <div className="mt-5">
                <div className="flex justify-between font-mono text-[13px] text-ink-2">
                  <span className="tabular">{bytes(disk.sizeBytes * hashing)} read</span>
                  <span className="tabular">{Math.round(hashing * 100)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${hashing * 100}%` }} />
                </div>
              </div>
            )}
          </Panel>

          <Panel className="p-5" data-testid="hashes">
            <Label>Hashes over every byte</Label>
            <HashLine name="MD5" value={disk.md5} p={hashing} />
            <HashLine name="SHA-256" value={disk.sha256} p={hashing} />
            <div className="mt-4 flex items-center gap-2 text-[13px] text-ink-3">
              {hashing >= 1 ? (
                <>
                  <Check className="h-4 w-4 text-teal" /> Both digests in one read pass,{" "}
                  {disk.hashSeconds < 1 ? `${Math.round(disk.hashSeconds * 1000)} ms` : `${disk.hashSeconds.toFixed(1)} s`}
                </>
              ) : (
                "Reading the image once, both digests together"
              )}
            </div>
          </Panel>

          {phase === "mapped" && damaged.length > 0 && (
            <Panel className="border-red/50 p-5" data-testid="damage">
              <Label className="text-red">Damage found on the disk</Label>
              <ul className="mt-3 flex flex-col gap-2.5">
                {damaged.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red" />
                    {line}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="p-5">
            <Label>Other exhibits in this case</Label>
            {rest.map((s) => (
              <div key={s.id} className="mt-3 flex items-center gap-3" data-testid={`exhibit-${s.id}`}>
                <Package className="h-5 w-5 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[14px] text-ink-2">{s.fileName}</div>
                  <div className="text-[13px] text-ink-3">
                    {s.id} · {s.vendor.family} · {bytes(s.sizeBytes)}
                  </div>
                </div>
                {phase === "mapped" && <Check className="h-5 w-5 text-teal" />}
              </div>
            ))}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-5" data-testid="signature">
            <div className="flex items-center justify-between">
              <Label>Vendor signature</Label>
              <AnimatePresence>
                {phase !== "idle" && phase !== "hashing" && (
                  <motion.div
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 rounded-md bg-amber px-3 py-1.5 text-[15px] font-bold text-amber-ink"
                    data-testid="vendor"
                  >
                    <Fingerprint className="h-4 w-4" />
                    {disk.vendor.family} · {Math.round(disk.vendor.confidence * 100)}%
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* Sixteen bytes a row need about 640 px, so under 1440 px the strip shows eight. */}
            <div className="min-[1440px]:hidden">
              <HexStrip sig={disk.vendor.signature} lit={phase === "identified" || phase === "mapped"} perRow={8} />
            </div>
            <div className="hidden min-[1440px]:block">
              <HexStrip sig={disk.vendor.signature} lit={phase === "identified" || phase === "mapped"} perRow={16} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-[14px]">
              <Fact k="Signature at" v={hex(disk.vendor.signature.offset)} on={phase !== "idle" && phase !== "hashing"} />
              <Fact k="Model" v={disk.vendor.model ?? "Not recorded"} on={phase !== "idle" && phase !== "hashing"} />
              <Fact k="Firmware" v={disk.vendor.firmware ?? "Not recorded"} on={phase !== "idle" && phase !== "hashing"} />
            </div>
          </Panel>
          <DiskMap source={disk} p={mapping} />
        </div>
      </div>
    </div>
  );
}

function HashLine({ name, value, p }: { name: string; value: string; p: number }) {
  const shown = Math.floor(value.length * p);
  return (
    <div className="mt-3">
      <div className="text-[12px] font-semibold text-ink-3">{name}</div>
      <div className="mt-1 break-all font-mono text-[14px] leading-[1.5] tabular" data-testid={`hash-${name}`}>
        <span className={p >= 1 ? "text-teal" : "text-ink"}>{value.slice(0, shown)}</span>
        <span className="text-ink-3/40">{"·".repeat(value.length - shown)}</span>
      </div>
    </div>
  );
}

function Fact({ k, v, on }: { k: string; v: string; on: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3">{k}</div>
      <div className={cn("mt-0.5 font-mono transition-opacity duration-500", on ? "text-ink opacity-100" : "opacity-0")}>{v}</div>
    </div>
  );
}

function HexStrip({ sig, lit, perRow }: { sig: Source["vendor"]["signature"]; lit: boolean; perRow: 8 | 16 }) {
  const bytesArr = sig.hex.trim().split(/\s+/);
  const rows: string[][] = [];
  for (let i = 0; i < bytesArr.length; i += perRow) rows.push(bytesArr.slice(i, i + perRow));
  return (
    // Offset, 16 bytes and their ASCII need about 725 px at 16 px type. Under 1536 px of
    // window the strip tightens to fit, and it scrolls inside its box if it still cannot.
    <div
      className="scanline mt-4 overflow-x-auto rounded-md border border-line bg-[#0a0c0d] px-4 py-3 font-mono text-[14px] 2xl:text-[16px]"
      data-testid="hex-strip"
    >
      {rows.map((r, i) => (
        <div key={i} className="flex gap-4 2xl:gap-6">
          <span className="text-ink-3">{hex(sig.offset + i * perRow)}</span>
          <span className="flex gap-1.5 2xl:gap-2">
            {r.map((b, j) => (
              <motion.span
                key={j}
                animate={{ color: lit ? "#f4b400" : "#737874" }}
                transition={{ delay: lit ? (i * perRow + j) * 0.04 : 0, duration: 0.25 }}
              >
                {b}
              </motion.span>
            ))}
          </span>
          <motion.span animate={{ color: lit ? "#eceae4" : "#3a3f44" }} transition={{ delay: lit ? 0.6 : 0 }}>
            {sig.ascii.slice(i * perRow, (i + 1) * perRow)}
          </motion.span>
        </div>
      ))}
    </div>
  );
}

// At intake the tool knows only what the recorder's index lists. Blocks the index points at
// show as listed; everything else waits for the recovery step to say what it holds.
function known(st: State): State {
  return st === "system" ? "system" : st === "indexed" || st === "overwritten" ? "indexed" : "free";
}

const ORDER: State[] = ["indexed", "free", "system"];
const INTAKE_LABEL: Partial<Record<State, string>> = {
  indexed: "Listed in the index",
  free: "Not listed in the index",
  system: "System area",
};

function DiskMap({ source, p }: { source: Source; p: number }) {
  const b = source.blocks;
  // One cell per block, or per group of blocks on a large disk, so the map stays one screen.
  const cells = useMemo(() => {
    if (!b) return [] as State[];
    const per = Math.max(1, Math.ceil(b.total / 720));
    const out: State[] = [];
    for (let i = 0; i < b.total; i += per) {
      const run = b.runs.find((r) => i >= r.start && i < r.start + r.count);
      out.push(known(run?.state ?? "free"));
    }
    return out;
  }, [b]);
  const counts = useMemo(() => {
    const m = new Map<State, number>();
    for (const r of b?.runs ?? []) m.set(known(r.state), (m.get(known(r.state)) ?? 0) + r.count);
    return m;
  }, [b]);
  const lit = Math.floor(cells.length * p);
  // Columns chosen so the grid fills a panel about 1,080 by 420 px, whatever the block count.
  const cols = Math.max(24, Math.min(64, Math.round(Math.sqrt((cells.length * 1080) / 420))));
  return (
    <Panel className="flex-1 p-5" data-testid="disk-map">
      <div className="flex items-center justify-between">
        <Label>Disk map · {b ? `${b.total.toLocaleString("en-IN")} blocks of ${bytes(b.blockSize)}` : "no block map"}</Label>
        <span className="font-mono text-[13px] text-ink-3 tabular">{Math.round(p * 100)}% scanned</span>
      </div>
      <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cells.map((s, i) => (
          <div
            key={i}
            className="aspect-square rounded-[2px] transition-colors duration-300"
            style={{ background: i < lit ? (s === "free" ? "#2c3238" : STATE_COLOR[s]) : "#1a1e22" }}
          />
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2" data-testid="legend">
        {ORDER.filter((s) => counts.has(s)).map((s) => (
          <div
            key={s}
            className={cn("flex items-center gap-2 text-[14px] transition-opacity duration-500", p >= 1 ? "opacity-100" : "opacity-40")}
          >
            <span className="h-3 w-3 rounded-[2px]" style={{ background: s === "free" ? "#2c3238" : STATE_COLOR[s] }} />
            <span className="text-ink-2">{INTAKE_LABEL[s] ?? STATE_LABEL[s]}</span>
            <span className="font-mono text-ink-3">{counts.get(s)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
