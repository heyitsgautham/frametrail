"use client";

import { FileCheck2, PenLine } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { bytes, day } from "@/lib/format";
import type { Case } from "@/lib/types";
import { useDone } from "@/lib/use-done";

// The certificate the court asks for, with every field the software can know filled in from
// the case, and the declaration left for the examiner to sign.
export function Report({ c }: { c: Case }) {
  const done = useDone();
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (done) setGo(true);
  }, [done]);
  const recovered = c.segments.filter((s) => s.state !== "indexed").length;
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setVerdicts(JSON.parse(sessionStorage.getItem("ft-review") ?? "{}"));
    } catch {}
  }, []);
  const confirmed = c.detections.filter((d) => (verdicts[d.id] ?? d.review) === "confirmed").length;
  const rejected = c.detections.filter((d) => (verdicts[d.id] ?? d.review) === "rejected").length;

  const limits = [
    `${c.segments.filter((s) => s.state === "partial").length} segment only partly survives. Overwritten sectors cannot be restored.`,
    "Reference times are an analysis. The raw recorder times are kept unchanged beside them.",
    "AI markers were used to decide where to look, not as proof that an event happened.",
    "A hash proves the bytes did not change. It does not prove the camera clock was right.",
  ];

  return (
    <div className="pb-10">
      <PageHead kicker="Step 7 · Report" title="Ready for the examiner to sign">
        <button type="button" data-testid="generate" onClick={() => setGo(true)} className="flex items-center gap-2 rounded-md bg-amber px-5 py-3 text-[16px] font-bold text-amber-ink">
          <FileCheck2 className="h-5 w-5" /> Generate certificate
        </button>
      </PageHead>
      <div className="grid grid-cols-[1fr_380px] gap-5 px-8">
        <div className="rounded-lg bg-[#f3f0e8] p-8 text-[#1d1d1b] shadow-2xl" data-testid="certificate">
          <div className="text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#6b665c]">The Schedule · Section 63(4)(c)</div>
            <div className="mt-1 font-serif text-[24px] font-semibold">Certificate, Part B</div>
            <div className="text-[13px] text-[#6b665c]">To be filled by the expert · Bharatiya Sakshya Adhiniyam, 2023</div>
          </div>
          <div className="mt-6 grid grid-cols-[210px_1fr] gap-x-6 text-[14px]">
            {[
              ["Case", `${c.id} · ${c.title}`],
              ["Device type", "DVR, with a native NVR export"],
              ["Hash algorithms", "MD5 and SHA-256"],
              ...c.sources.map((s) => [
                `Device, ${s.id}`,
                `${s.vendor.family}${s.vendor.model ? `, ${s.vendor.model}` : ""} · ${s.kind === "disk-image" ? "raw disk image" : "native export"}, ${bytes(s.sizeBytes)}`,
              ]),
              ...c.sources.flatMap((s) => [
                [`MD5, ${s.id}`, s.md5],
                [`SHA-256, ${s.id}`, s.sha256],
              ]),
              ["Recovered or partial segments", `${recovered} of ${c.segments.length}, each with its own hashes`],
              ["AI-assisted markers", `${c.detections.length} raised · ${confirmed} confirmed, ${rejected} rejected by the examiner · the rest not relied on`],
              ["Date of examination", day(c.createdAt)],
            ].map(([k, v], i) => (
              <Row key={k} k={k!} v={v!} i={i} on={go} />
            ))}
          </div>
          <div className="mt-8 grid grid-cols-3 gap-6 border-t border-[#cfc9bb] pt-6 text-[13px] text-[#6b665c]">
            {["Name and designation", "Signature", "Date and place"].map((k) => (
              <div key={k}>
                <div className="h-9 border-b border-dashed border-[#9d978a]" />
                <div className="mt-1.5">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Panel className="p-5" data-testid="limitations">
            <Label>Limitations, stated in the report</Label>
            {limits.map((l, i) => (
              <motion.div key={l} initial={false} animate={{ opacity: go ? 1 : 0.25 }} transition={{ delay: go ? 1.2 + i * 0.25 : 0 }} className="mt-3 flex gap-2.5 text-[14px] leading-snug text-ink-2">
                <span className="font-mono text-amber">{i + 1}</span>
                {l}
              </motion.div>
            ))}
          </Panel>
          <Panel className="flex items-start gap-3 p-5 text-[14px] leading-snug text-ink-3">
            <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
            The software fills what it can measure. The declaration and signature stay with a person.
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, i, on }: { k: string; v: string; i: number; on: boolean }) {
  const mono = /^[0-9a-f]{32,64}$/.test(v);
  return (
    <>
      <div className="border-b border-[#ddd8cc] py-2 text-[#6b665c]">{k}</div>
      <motion.div
        initial={false}
        animate={{ opacity: on ? 1 : 0, x: on ? 0 : -6 }}
        transition={{ delay: on ? 0.12 * i : 0, duration: 0.3 }}
        className={mono ? "break-all border-b border-[#ddd8cc] py-2 font-mono text-[12.5px]" : "border-b border-[#ddd8cc] py-2"}
      >
        {v}
      </motion.div>
    </>
  );
}
