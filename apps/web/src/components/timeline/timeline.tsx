"use client";

import { Crosshair, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { useCarved } from "@/lib/carved";
import { clock, secs, STATE_COLOR, STATE_LABEL } from "@/lib/format";
import type { Case, Segment } from "@/lib/types";
import { makeAxis } from "@/lib/axis";
import { useDone } from "@/lib/use-done";
import { cn } from "@/lib/utils";
import { ClockCard, Correlation } from "./clocks";
import { pickMoment } from "./moment";
import { SyncPlayers } from "./players";

// Two recorders, two clocks. Before alignment each lane sits where its own recorder says it
// does; after, every lane moves to the reference clock measured at seizure. The raw times
// never change: the reference time is an analysis shown beside them. Until the wiped disk
// is carved, the disk camera shows only what its index still lists, so the hole shows.
export function Timeline({ c }: { c: Case }) {
  const done = useDone();
  const [carved] = useCarved();
  const [aligned, setAlignedState] = useState(false);
  const [sync, setSync] = useState(false);
  // Alignment is kept per tab, so coming back after carving shows the aligned lanes.
  const setAligned = (v: boolean) => {
    setAlignedState(v);
    try {
      sessionStorage.setItem("ft-aligned", v ? "1" : "0");
    } catch {}
  };
  useEffect(() => {
    if (done) {
      setAlignedState(true);
      setSync(true);
      return;
    }
    try {
      if (sessionStorage.getItem("ft-aligned") === "1") setAlignedState(true);
    } catch {}
  }, [done]);
  const al = c.alignment[0];
  const disk = c.sources.find((s) => s.kind === "disk-image");
  const first = c.cameras.find((x) => x.sourceId === disk?.id) ?? c.cameras[0]!;
  const second = c.cameras.find((x) => x !== first) ?? first;
  const cams = useMemo(() => [first, second], [first, second]);

  const visible = (s: Segment) => carved || s.state === "indexed" || s.extent.sourceId !== disk?.id;
  const segs = c.segments.filter((s) => s.cameraId === first.id || s.cameraId === second.id);
  const logs = (c.log ?? []).filter((l) => l.sourceId === first.sourceId && /init|format/i.test(`${l.kind} ${l.text}`));
  const axis = useMemo(
    () =>
      makeAxis([
        ...segs.flatMap((s) => [
          [secs(s.rawStart), secs(s.rawEnd)] as [number, number],
          [secs(s.refStart), secs(s.refEnd)] as [number, number],
        ]),
        ...logs.map((l) => [secs(l.at), secs(l.at)] as [number, number]),
      ]),
    [segs, logs],
  );
  const x = axis.x;

  // The holes: where the disk camera's footage exists on the disk but not in its index.
  // Adjacent missing segments merge into one hole.
  const holes = useMemo(() => {
    const miss = segs.filter((s) => s.cameraId === first.id && s.state !== "indexed").sort((a, b) => secs(a.rawStart) - secs(b.rawStart));
    const out: { raw: [number, number]; ref: [number, number] }[] = [];
    for (const s of miss) {
      const last = out.at(-1);
      if (last && secs(s.rawStart) - last.raw[1] < 2) {
        last.raw[1] = secs(s.rawEnd);
        last.ref[1] = secs(s.refEnd);
      } else out.push({ raw: [secs(s.rawStart), secs(s.rawEnd)], ref: [secs(s.refStart), secs(s.refEnd)] });
    }
    return out;
  }, [segs, first]);
  const moment = useMemo(() => pickMoment(c, first, second), [c, first, second]);

  return (
    <div className="pb-10">
      <PageHead kicker="Step 2 · Timeline" title="One clock for every camera">
        <button
          type="button"
          data-testid="align"
          onClick={() => setAligned(true)}
          disabled={aligned}
          className={cn(
            "flex items-center gap-2 rounded-md px-5 py-3 text-[16px] font-bold transition-all",
            aligned ? "border border-teal/40 bg-teal/10 text-teal" : "bg-amber text-amber-ink hover:brightness-105",
          )}
        >
          <Crosshair className="h-5 w-5" />
          {aligned ? "Clocks aligned" : "Align clocks"}
        </button>
      </PageHead>

      <div className="flex flex-col gap-5 px-8">
        <div className="grid grid-cols-[1fr_1fr_400px] gap-5">
          {cams.map((cam) => (
            <ClockCard key={cam.id} cam={cam} c={c} aligned={aligned} />
          ))}
          <Correlation al={al} cams={cams} aligned={aligned} />
        </div>

        <Panel className="px-5 pb-5 pt-4" data-testid="lanes">
          <div className="flex items-center justify-between">
            <Label>{aligned ? "Reference time, from the seizure record" : "Each recorder's own time"}</Label>
            <div className="flex gap-5 text-[13px] text-ink-3">
              {(["indexed", "recovered-unindexed", "overwritten"] as const).map((s) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATE_COLOR[s] }} />
                  {STATE_LABEL[s]}
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-3 ml-[190px] h-6">
            {axis.ticks.map((t) => (
              <div key={t} className="absolute top-0 -translate-x-1/2 font-mono text-[12px] text-ink-3" style={{ left: `${x(t)}%` }}>
                {clock(t)}
              </div>
            ))}
            {axis.breaks.map((b) => (
              <div
                key={b.left}
                className="absolute top-0 text-center font-mono text-[11px] text-ink-3/70"
                style={{ left: `${b.left}%`, width: `${b.width}%` }}
              >
                {Math.round(b.seconds / 60)}m
              </div>
            ))}
          </div>
          {cams.map((cam, ci) => (
            <div key={cam.id} className={cn("flex items-center", ci === 0 ? "mt-8" : "mt-3")}>
              <div className="w-[190px] shrink-0 whitespace-nowrap">
                <div className="text-[15px] font-semibold text-ink">{cam.name}</div>
                <div className="font-mono text-[12px] text-ink-3">
                  {cam.id} · {c.sources.find((s) => s.id === cam.sourceId)?.vendor.family.replace(/ (disk|export)$/, "")}
                </div>
              </div>
              <div className="relative h-14 flex-1 rounded bg-[#15181b]">
                {axis.ticks.map((t) => (
                  <div key={t} className="absolute top-0 bottom-0 w-px bg-line/60" style={{ left: `${x(t)}%` }} />
                ))}
                {axis.breaks.map((b) => (
                  <div
                    key={b.left}
                    className="absolute top-0 bottom-0 bg-bg"
                    style={{
                      left: `${b.left}%`,
                      width: `${b.width}%`,
                      backgroundImage: "repeating-linear-gradient(90deg, transparent 0 5px, rgba(255,255,255,.05) 5px 6px)",
                    }}
                  />
                ))}
                {cam === first &&
                  !carved &&
                  holes.map((h, i) => {
                    const [a, b] = aligned ? h.ref : h.raw;
                    return (
                      <motion.div
                        key={i}
                        data-testid={i === holes.length - 1 ? "hole" : `hole-${i}`}
                        className="absolute top-1.5 bottom-1.5 flex items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-red/70"
                        style={{ background: "repeating-linear-gradient(135deg, rgba(240,86,74,.16) 0 6px, transparent 6px 12px)" }}
                        initial={false}
                        animate={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%` }}
                        transition={{ duration: 1.8, ease: [0.45, 0, 0.2, 1] }}
                      >
                        <span className="whitespace-nowrap px-2 text-[13px] font-semibold text-red">Not in the index</span>
                      </motion.div>
                    );
                  })}
                <AnimatePresence>
                  {segs
                    .filter((s) => s.cameraId === cam.id && visible(s))
                    .map((s, i) => {
                      const a = aligned ? secs(s.refStart) : secs(s.rawStart);
                      const b = aligned ? secs(s.refEnd) : secs(s.rawEnd);
                      const found = s.state !== "indexed" && s.extent.sourceId === disk?.id;
                      return (
                        <motion.div
                          key={s.id}
                          data-testid={`lane-${s.id}`}
                          className="absolute top-1.5 bottom-1.5 origin-left rounded-[3px]"
                          style={{
                            background: STATE_COLOR[s.state],
                            boxShadow: s.state === "recovered-unindexed" ? "0 0 14px rgba(244,180,0,.55)" : undefined,
                          }}
                          initial={found ? { scaleX: 0, opacity: 0 } : false}
                          animate={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%`, scaleX: 1, opacity: 1 }}
                          transition={{ duration: found ? 0.7 : 1.8, delay: found ? 0.5 + i * 0.35 : 0, ease: [0.45, 0, 0.2, 1] }}
                        />
                      );
                    })}
                </AnimatePresence>
                {cam === first &&
                  logs.map((l) => {
                    const t = aligned && l.ref ? secs(l.ref) : secs(l.at);
                    return (
                      <motion.div
                        key={`${l.at}-${l.text}`}
                        data-testid="log-marker"
                        className="absolute -top-2 -bottom-2 w-0.5 bg-red"
                        initial={false}
                        animate={{ left: `${x(t)}%` }}
                        transition={{ duration: 1.8, ease: [0.45, 0, 0.2, 1] }}
                      >
                        <span className="absolute -top-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded bg-red px-2 py-0.5 text-[12px] font-bold text-[#101214]">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {l.text}
                          {l.user && !l.text.includes(l.user) ? ` by ${l.user}` : ""} · {clock(secs(l.at))}
                        </span>
                      </motion.div>
                    );
                  })}
                {sync && moment && (
                  <motion.div
                    className="absolute -top-2 -bottom-2 w-0.5 bg-teal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, left: `${x(moment.t)}%` }}
                    data-testid="playhead"
                  />
                )}
              </div>
            </div>
          ))}
        </Panel>

        <SyncPlayers
          c={c}
          cams={cams}
          moment={moment}
          aligned={aligned}
          sync={sync}
          onSync={() => setSync(true)}
          carved={carved}
          diskId={disk?.id}
        />
      </div>
    </div>
  );
}
