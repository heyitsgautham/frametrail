"use client";

import { ArrowRight, Check, FileVideo, HardDrive, Layers, ScrollText, Scissors, TriangleAlert, Waves } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { media, STATE_COLOR } from "@/lib/format";
import type { Case, ProvNode, Segment } from "@/lib/types";
import { useDone } from "@/lib/use-done";
import { cn } from "@/lib/utils";

const ICON: Record<ProvNode["kind"], typeof HardDrive> = {
  source: HardDrive,
  extent: Layers,
  stream: Waves,
  derivative: Scissors,
  clip: FileVideo,
  frame: FileVideo,
  report: ScrollText,
};

const STAGE: Record<ProvNode["kind"], string> = {
  source: "Seized evidence",
  extent: "Byte extent",
  stream: "Video stream",
  derivative: "Derivative",
  clip: "Exported clip",
  frame: "Still",
  report: "Report",
};

// Pick any exported clip and its chain back to the seized bytes is drawn left to right:
// each step with its own hash and the operation that made it.
export function Provenance({ c }: { c: Case }) {
  const done = useDone();
  const { nodes, edges } = c.provenance;
  const parent = useMemo(() => new Map(edges.map(([a, b]) => [b, a])), [edges]);
  const clips = nodes.filter((n) => n.kind === "clip");
  const segOf = (n: ProvNode): Segment | undefined =>
    c.segments.find((s) => n.id.startsWith(`${s.id}/`) || n.id === s.id || n.label.startsWith(s.id));
  const preferred = clips.find((n) => segOf(n)?.state === "recovered-unindexed") ?? clips[0];
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (done && preferred) setSel(preferred.id);
  }, [done, preferred]);

  const chain = useMemo(() => {
    const out: ProvNode[] = [];
    let id = sel;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const n = nodes.find((x) => x.id === id);
      if (n) out.unshift(n);
      id = parent.get(id) ?? null;
    }
    return out;
  }, [sel, nodes, parent]);
  const node = nodes.find((n) => n.id === sel);
  const seg = node ? segOf(node) : undefined;

  return (
    <div className="pb-10">
      <PageHead kicker="Step 5 · Provenance" title="Where did this clip come from?" />
      <div className="grid grid-cols-[300px_1fr] gap-5 px-8">
        <Panel className="p-3" data-testid="clip-list">
          <div className="px-2 pb-2 pt-1">
            <Label>{clips.length} exported clips</Label>
          </div>
          {clips.map((n) => {
            const s = segOf(n);
            return (
              <button
                key={n.id}
                type="button"
                data-testid={`node-${n.id}`}
                onClick={() => setSel(n.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left",
                  sel === n.id ? "bg-panel-2" : "hover:bg-panel-2/60",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s ? STATE_COLOR[s.state] : "#737874" }} />
                <span className="flex-1 truncate font-mono text-[14px] text-ink">{n.label}</span>
              </button>
            );
          })}
        </Panel>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-6" data-testid="graph">
            {chain.length ? (
              <div className="flex items-stretch">
                <AnimatePresence mode="popLayout">
                  {chain.map((n, i) => {
                    const Icon = ICON[n.kind];
                    const last = i === chain.length - 1;
                    return (
                      <motion.div
                        key={`${sel}-${n.id}`}
                        className="flex min-w-0 flex-1 items-stretch"
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 * i, duration: 0.4 }}
                      >
                        <div
                          className={cn(
                            "flex min-h-[330px] min-w-0 flex-1 flex-col gap-3 rounded-md border p-5",
                            last ? "border-amber bg-[#2a2410]" : "border-teal/50 bg-[#12241f]",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-6 w-6 shrink-0", last ? "text-amber" : "text-teal")} />
                            <Label>{STAGE[n.kind]}</Label>
                          </div>
                          <div className="text-[18px] font-semibold leading-snug text-ink">{n.label}</div>
                          {n.tool && <div className="font-mono text-[12px] text-ink-3">{n.tool}</div>}
                          {n.sha256 && (
                            <div className="mt-auto">
                              <div className="text-[12px] text-ink-3">SHA-256</div>
                              <div className="break-all font-mono text-[14px] leading-snug text-ink-2">{n.sha256}</div>
                            </div>
                          )}
                        </div>
                        {!last && (
                          <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 px-1 text-center">
                            <ArrowRight className="h-6 w-6 text-teal" />
                            <span className="text-[13px] leading-tight text-ink-2">{chain[i + 1]?.op ?? "read"}</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              <div className="py-10 text-center text-[16px] text-ink-3">Pick a clip to trace it back to the seized bytes</div>
            )}
          </Panel>
          {node && <Detail key={node.id} node={node} seg={seg} steps={chain.length} />}
        </div>
      </div>
    </div>
  );
}

function Detail({ node, seg, steps }: { node: ProvNode; seg?: Segment; steps: number }) {
  const [check, setCheck] = useState<"idle" | "running" | "match" | "differ">("idle");
  const file = media(seg?.clip);
  async function rehash() {
    if (!file || !node.sha256) return;
    setCheck("running");
    const buf = await (await fetch(file, { cache: "no-store" })).arrayBuffer();
    const d = await crypto.subtle.digest("SHA-256", buf);
    const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
    await new Promise((r) => setTimeout(r, 700));
    setCheck(hex === node.sha256 ? "match" : "differ");
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25 * steps }}
      className="grid grid-cols-[1fr_1fr_340px] gap-5 [&>*]:min-h-[190px]"
    >
      <Panel className="p-5">
        <Label>Kept by the export</Label>
        {(seg?.kept ?? []).map((k) => (
          <div key={k} className="mt-3 flex gap-2 text-[15px] leading-snug text-ink-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
            {k}
          </div>
        ))}
      </Panel>
      <Panel className="p-5">
        <Label>Lost or not recorded</Label>
        {(seg?.lost ?? []).map((k) => (
          <div key={k} className="mt-3 flex gap-2 text-[15px] leading-snug text-ink-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--st-partial)]" />
            {k}
          </div>
        ))}
      </Panel>
      <Panel className="flex flex-col justify-between gap-3 p-5">
        <div className="text-[14px] leading-snug text-ink-3">
          Hash the exported file again, here, and compare it with the value recorded at export.
        </div>
        <button
          type="button"
          data-testid="rehash"
          onClick={rehash}
          disabled={!file || check === "running"}
          className="w-full rounded-md bg-amber py-3 text-[15px] font-bold text-amber-ink"
        >
          {check === "running" ? "Hashing the clip…" : "Re-hash this clip"}
        </button>
        <AnimatePresence>
          {(check === "match" || check === "differ") && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="rehash-result"
              className={cn(
                "rounded-md border px-3 py-2 text-[14px] font-semibold",
                check === "match" ? "border-teal/50 bg-teal/10 text-teal" : "border-red/50 bg-red/10 text-red",
              )}
            >
              {check === "match" ? "SHA-256 matches. Unchanged since export." : "SHA-256 differs from the value at export."}
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>
    </motion.div>
  );
}
