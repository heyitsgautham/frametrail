"use client";

import { Check, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { clock, media, secs } from "@/lib/format";
import type { Case, Detection } from "@/lib/types";
import { makeAxis } from "@/lib/axis";
import { cn } from "@/lib/utils";

const LABEL: Record<Detection["label"], string> = { person: "Person", motion: "Motion", "left-object": "Object left behind" };

// The model points; the examiner decides. Every marker keeps its model, version and
// confidence, and nothing leaves triage without a human verdict.
export function Triage({ c }: { c: Case }) {
  const [review, setReview] = useState<Record<string, Detection["review"]>>(() =>
    Object.fromEntries(c.detections.map((d) => [d.id, d.review])),
  );
  // Verdicts stay with the tab, so the report counts what the examiner decided.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("ft-review") ?? "{}") as Record<string, Detection["review"]>;
      if (Object.keys(saved).length) setReview((v) => ({ ...v, ...saved }));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("ft-review", JSON.stringify(Object.fromEntries(Object.entries(review).filter(([, r]) => r !== "pending"))));
    } catch {}
  }, [review]);
  // The strongest marker from each camera and the weakest overall on the first row, then the
  // next strongest and the next weakest. Weak markers are where a model is most likely wrong,
  // and where a reviewer earns their keep.
  const shown = useMemo(() => {
    const by = [...c.detections].sort((a, b) => b.confidence - a.confidence);
    const top = c.cameras.map((cam) => by.filter((d) => d.cameraId === cam.id));
    const weak = [...by].reverse();
    const pick: Detection[] = [];
    const add = (d?: Detection) => d && !pick.includes(d) && pick.push(d);
    add(top[0]?.[0]);
    add(top[1]?.[0]);
    add(weak.find((d) => !pick.includes(d)));
    add(top[0]?.[1]);
    add(top[1]?.[1]);
    add(weak.find((d) => !pick.includes(d)));
    return pick;
  }, [c.detections, c.cameras]);
  const cams = Object.fromEntries(c.cameras.map((x) => [x.id, x]));
  const axis = useMemo(
    () =>
      makeAxis(
        c.detections.map((d) => [secs(d.refTime), secs(d.refTime)] as [number, number]),
        8,
        120,
      ),
    [c.detections],
  );
  const count = (r: Detection["review"]) => Object.values(review).filter((v) => v === r).length;
  const model = c.detections[0]?.model;

  return (
    <div className="pb-10">
      <PageHead kicker="Step 4 · AI triage" title="Where to look first">
        <div className="flex gap-3 font-mono text-[14px]">
          <span className="rounded-md border border-line px-3 py-2 text-ink-2" data-testid="n-pending">
            {count("pending")} to review
          </span>
          <span className="rounded-md border border-teal/40 px-3 py-2 text-teal" data-testid="n-confirmed">
            {count("confirmed")} confirmed
          </span>
          <span className="rounded-md border border-red/40 px-3 py-2 text-red" data-testid="n-rejected">
            {count("rejected")} rejected
          </span>
        </div>
      </PageHead>
      <div className="flex flex-col gap-5 px-8">
        <Panel className="flex items-center gap-4 border-amber/40 bg-amber/[0.06] px-5 py-3 text-[14px] text-ink-2" data-testid="ai-notice">
          <Sparkles className="h-5 w-5 shrink-0 text-amber" />
          <span>
            <b className="text-amber">AI-assisted findings.</b> For triage, not proof. The full footage stays available and every marker
            needs an examiner&apos;s verdict.
          </span>
          {model && (
            <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-[13px] text-ink-3" data-testid="ai-model">
              {model.name} {model.version} · {model.licence} · runs offline
            </span>
          )}
        </Panel>
        <Panel className="px-5 py-4" data-testid="markers">
          <Label>{c.detections.length} markers across both cameras, reference time</Label>
          {c.cameras.map((cam) => (
            <div key={cam.id} className="mt-3 flex items-center">
              <span className="w-[130px] text-[14px] text-ink-2">{cam.name}</span>
              <div className="relative h-7 flex-1 rounded bg-[#15181b]">
                {c.detections
                  .filter((d) => d.cameraId === cam.id)
                  .map((d) => (
                    <span
                      key={d.id}
                      className={cn(
                        "absolute top-1 bottom-1 w-1.5 -translate-x-1/2 rounded-full transition-colors",
                        review[d.id] === "confirmed" ? "bg-teal" : review[d.id] === "rejected" ? "bg-red/60" : "bg-amber",
                      )}
                      style={{ left: `${axis.x(secs(d.refTime))}%`, opacity: 0.4 + d.confidence * 0.6 }}
                    />
                  ))}
              </div>
            </div>
          ))}
          <div className="relative mt-2 ml-[130px] h-4 font-mono text-[12px] text-ink-3">
            {axis.windows.map((w) => (
              <span key={w.from} className="absolute" style={{ left: `${w.left}%` }}>
                {clock(w.from)}
              </span>
            ))}
          </div>
        </Panel>
        <div className="grid grid-cols-3 gap-5">
          {shown.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
              <Card
                d={d}
                cam={cams[d.cameraId]?.name ?? d.cameraId}
                review={review[d.id] ?? "pending"}
                set={(r) => setReview((v) => ({ ...v, [d.id]: r }))}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ d, cam, review, set }: { d: Detection; cam: string; review: Detection["review"]; set: (r: Detection["review"]) => void }) {
  return (
    <Panel
      className={cn(
        "overflow-hidden transition-all duration-300",
        review === "confirmed" && "border-teal/60",
        review === "rejected" && "opacity-50 saturate-0",
      )}
      data-testid={`det-${d.id}`}
    >
      <div className="h-[196px] bg-black">
        <div className="relative mx-auto aspect-[4/3] h-full">
          {d.thumb && <img src={media(d.thumb)} alt="" className="h-full w-full object-cover" />}
          {((d as Detection & { boxes?: [number, number, number, number][] }).boxes ?? []).slice(1).map((b, i) => (
            <div
              key={i}
              className="absolute border border-dashed border-amber/60"
              style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }}
            />
          ))}
          {d.box && (
            <div
              className={cn(
                "absolute border-2",
                review === "confirmed" ? "border-teal" : review === "rejected" ? "border-red" : "border-amber",
              )}
              style={{ left: `${d.box[0] * 100}%`, top: `${d.box[1] * 100}%`, width: `${d.box[2] * 100}%`, height: `${d.box[3] * 100}%` }}
            >
              <span
                className={cn(
                  "absolute -top-6 left-[-2px] px-1.5 py-0.5 font-mono text-[12px] font-bold text-[#101214]",
                  review === "confirmed" ? "bg-teal" : review === "rejected" ? "bg-red" : "bg-amber",
                )}
              >
                {LABEL[d.label]} {Math.round(d.confidence * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">{cam}</div>
          <div className="font-mono text-[12px] text-ink-3">
            ref {clock(secs(d.refTime))} · raw {clock(secs(d.rawTime))}
          </div>
        </div>
        <button
          type="button"
          data-testid={`confirm-${d.id}`}
          onClick={() => set("confirmed")}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md border",
            review === "confirmed" ? "border-teal bg-teal text-[#101214]" : "border-line text-ink-2 hover:border-teal",
          )}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid={`reject-${d.id}`}
          onClick={() => set("rejected")}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md border",
            review === "rejected" ? "border-red bg-red text-[#101214]" : "border-line text-ink-2 hover:border-red",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Panel>
  );
}
