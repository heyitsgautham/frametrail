"use client";

import { Link2, Link2Off, PencilLine, ShieldCheck, ShieldX } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { short } from "@/lib/format";
import type { CustodyEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// The custody log is hash-chained: each entry's hash covers its own fields and the hash
// before it. Change one entry and its hash no longer matches, so it and every entry after
// it can no longer be trusted.
// Same rule as the engine: SHA-256 of the previous hash followed by the entry as compact
// JSON with sorted keys.
export async function entryHash(e: Omit<CustodyEvent, "hash">): Promise<string> {
  const { prev, ...rest } = e as CustodyEvent;
  const { hash: _h, ...body } = rest as CustodyEvent;
  const sorted = Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : 1)));
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prev + JSON.stringify(sorted)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mark = "ok" | "altered" | "after";

export function Custody({ events }: { events: CustodyEvent[] }) {
  const [rows, setRows] = useState(events);
  const [marks, setMarks] = useState<Mark[]>(() => events.map(() => "ok"));
  const [reproduces, setReproduces] = useState<boolean | null>(null);
  const target = Math.min(events.length - 2, Math.max(1, Math.floor(events.length / 2)));
  const edited = events[target];

  // Check the stored chain once: every link must point at the hash before it, and the
  // entry hashes must recompute.
  useEffect(() => {
    (async () => {
      let ok = true;
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        if (i > 0 && e.prev !== events[i - 1]!.hash) ok = false;
        if ((await entryHash(e)) !== e.hash) ok = false;
      }
      setReproduces(ok);
    })();
  }, [events]);

  async function tamper() {
    const e = rows[target]!;
    const changed = { ...e, actor: e.actor === "Examiner 2" ? "Examiner 1" : "Examiner 2" };
    const fresh = await entryHash(changed);
    setRows(rows.map((r, i) => (i === target ? { ...changed, hash: fresh } : r)));
    for (let i = target; i < rows.length; i++) {
      await new Promise((r) => setTimeout(r, 140));
      setMarks((m) => m.map((v, j) => (j === i ? (i === target ? "altered" : "after") : v)));
    }
  }

  const broken = marks.some((m) => m !== "ok");
  return (
    <div className="pb-10">
      <PageHead kicker="Step 6 · Chain of custody" title="A log that cannot be quietly edited">
        <div
          data-testid="chain-status"
          className={cn(
            "flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-semibold transition-colors",
            broken ? "border-red/50 bg-red/10 text-red" : "border-teal/40 bg-teal/10 text-teal",
          )}
        >
          {broken ? <ShieldX className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          {broken ? `Chain broken at entry ${target + 1}` : reproduces === false ? "Links intact" : `All ${rows.length} entries verify`}
        </div>
      </PageHead>
      <div className="grid grid-cols-[1fr_300px] gap-5 px-8">
        <Panel className="p-4" data-testid="custody-log">
          {rows.map((e, i) => {
            const m = marks[i];
            return (
              <div key={e.seq} className={i > 0 ? "mt-1" : ""}>
                <motion.div
                  data-testid={`entry-${e.seq}`}
                  animate={{ backgroundColor: m === "altered" ? "rgba(240,86,74,.16)" : m === "after" ? "rgba(240,86,74,.07)" : "rgba(0,0,0,0)" }}
                  className={cn("grid grid-cols-[22px_36px_92px_1fr_120px_170px] items-center gap-3 rounded-md border px-3 py-[5px]", m === "ok" ? "border-line" : "border-red/50")}
                >
                  {m === "ok" ? <Link2 className="h-4 w-4 text-ink-3" /> : <Link2Off className="h-4 w-4 text-red" />}
                  <span className="font-mono text-[13px] text-ink-3">#{e.seq}</span>
                  <span className="font-mono text-[13px] text-ink-2">{/\d{2}:\d{2}:\d{2}/.exec(e.at)?.[0]}</span>
                  <span className="truncate text-[14px] text-ink">
                    {e.action} <span className="text-ink-3">· {e.objectId}</span>
                  </span>
                  <span className={cn("text-[14px]", m === "altered" ? "font-semibold text-red" : "text-ink-2")}>{e.actor}</span>
                  <span className={cn("text-right font-mono text-[12px]", m === "ok" ? "text-teal" : m === "altered" ? "font-bold text-red" : "text-red/70 line-through")}>{short(e.hash, 7)}</span>
                </motion.div>
              </div>
            );
          })}
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel className="p-5">
            <Label>How each entry is sealed</Label>
            <div className="mt-3 rounded-md bg-[#0a0c0d] p-3 font-mono text-[12px] leading-relaxed text-ink-2">
              hash = SHA-256(
              <br />
              &nbsp;&nbsp;previous hash +
              <br />
              &nbsp;&nbsp;time, actor, action,
              <br />
              &nbsp;&nbsp;exhibit, exhibit hash)
            </div>
            <div className="mt-3 text-[14px] leading-snug text-ink-3">Each entry carries the one before it, so a change anywhere shows everywhere after it.</div>
          </Panel>
          <Panel className="p-5">
            <Label>Test it</Label>
            <div className="mt-2 text-[14px] text-ink-3">
              Change who handled entry {target + 1}, {edited?.action.toLowerCase()}.
            </div>
            <button
              type="button"
              data-testid="tamper"
              onClick={tamper}
              disabled={broken}
              className={cn("mt-4 flex w-full items-center justify-center gap-2 rounded-md py-3 text-[15px] font-bold", broken ? "bg-panel-2 text-ink-3" : "bg-amber text-amber-ink")}
            >
              <PencilLine className="h-4 w-4" /> Edit entry {target + 1}
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
