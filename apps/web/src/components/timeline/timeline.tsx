"use client";

import { Crosshair, Play, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Label, PageHead, Panel } from "@/components/shell";
import { useCarved } from "@/lib/carved";
import { clock, media, secs, STATE_COLOR, STATE_LABEL } from "@/lib/format";
import type { Camera, Case, Segment } from "@/lib/types";
import { makeAxis } from "@/lib/axis";
import { useDone } from "@/lib/use-done";
import { cn } from "@/lib/utils";

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

// The moment both players open on: people on the second camera while the disk camera was
// recording. The engine may name it in stats.syncRef.
function pickMoment(c: Case, first: Camera, second: Camera): { t: number } | null {
  const named = c.stats.syncRef;
  if (named !== undefined) return { t: typeof named === "number" ? named : secs(String(named)) };
  // Both players need room to run: at least 14 s of the same segment after the moment.
  const at = (cam: Camera, t: number) =>
    c.segments.find((s) => s.cameraId === cam.id && s.clip && secs(s.refStart) + 1 <= t && t <= secs(s.refEnd) - 14);
  // Prefer a moment with people on the second camera while the first camera's footage there
  // had to be carved back, so the players open on the recovered picture.
  const people = c.detections
    .filter((d) => d.label === "person" && d.cameraId === second.id)
    .map((d) => ({
      t: secs(d.refTime),
      score: d.confidence * ((d as { count?: number }).count ?? 1),
      found: at(first, secs(d.refTime))?.state,
    }))
    .filter((p) => p.found)
    .sort((p, q) => Number(q.found === "recovered-unindexed") - Number(p.found === "recovered-unindexed") || q.score - p.score);
  if (people[0]) return { t: people[0].t };
  for (const s of c.segments.filter((s) => s.cameraId === second.id && s.clip)) {
    const t = secs(s.refStart) + 5;
    if (at(first, t)) return { t };
  }
  return null;
}

function ClockCard({ cam, c, aligned }: { cam: Camera; c: Case; aligned: boolean }) {
  const src = c.sources.find((s) => s.id === cam.sourceId);
  const z = cam.clock.seizure;
  const off = cam.clock.offsetSec;
  return (
    <Panel className="p-5" data-testid={`clock-${cam.id}`}>
      <Label>
        {cam.name} · {src?.vendor.family}
      </Label>
      {z ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] text-ink-3">Recorder screen at seizure</div>
            <div className="font-mono text-[28px] leading-tight text-ink tabular">{clock(secs(z.dvrShown))}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">Reference clock</div>
            <div className="font-mono text-[28px] leading-tight text-teal tabular">{clock(secs(z.reference))}</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[14px] text-ink-3">No seizure record for this clock</div>
      )}
      <motion.div
        initial={false}
        animate={{ opacity: aligned ? 1 : 0.3 }}
        className="mt-3 flex items-baseline gap-2 text-[14px] text-ink-2"
      >
        {Math.abs(off) < 0.5 ? (
          <span className="font-mono text-[18px] font-bold text-teal">Matches the reference clock</span>
        ) : (
          <>
            Recorder clock is
            <span className="font-mono text-[18px] font-bold text-amber">
              {Math.abs(off).toFixed(1)} s {off > 0 ? "slow" : "fast"}
            </span>
            <span className="text-ink-3">± {cam.clock.uncertaintySec.toFixed(2)} s</span>
          </>
        )}
      </motion.div>
    </Panel>
  );
}

// The offset the burned-in clock gives, frame by frame, against the seizure record's figure,
// which is only good to the second.
function Correlation({ al, cams, aligned }: { al: Case["alignment"][number] | undefined; cams: Camera[]; aligned: boolean }) {
  if (!al?.curve.length) return <Panel className="p-5 text-ink-3">No camera pair to cross-check</Panel>;
  const cam = cams.find((x) => x.id === al.b);
  const seized = Math.abs(cam?.clock.seizure?.offsetSec ?? al.offsetSec);
  const xs = al.curve.map((p) => p[0]);
  const ys = [...al.curve.map((p) => p[1]), seized];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(0.8, (Math.max(...ys) - Math.min(...ys)) / 2 + 0.25);
  const W = 360;
  const H = 96;
  const px = (v: number) => ((v - x0) / (x1 - x0 || 1)) * W;
  const py = (v: number) => H / 2 - ((v - mid) / half) * (H / 2 - 6);
  const d = al.curve.map((p, i) => `${i ? "L" : "M"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");
  return (
    <Panel className="p-5" data-testid="correlation">
      <Label>Cross-check · burned-in clock</Label>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[96px] w-full overflow-visible">
        <line x1={0} x2={W} y1={py(seized)} y2={py(seized)} stroke="#34d3b4" strokeDasharray="5 5" />
        <text x={W} y={py(seized) - 6} textAnchor="end" fill="#34d3b4" fontSize="12" fontFamily="var(--font-code)">
          seizure record {seized.toFixed(0)} s
        </text>
        <motion.path
          d={d}
          fill="none"
          stroke="#f4b400"
          strokeWidth="2.5"
          initial={false}
          animate={{ pathLength: aligned ? 1 : 0 }}
          transition={{ duration: 1.4 }}
        />
      </svg>
      <motion.div
        initial={false}
        animate={{ opacity: aligned ? 1 : 0 }}
        transition={{ delay: aligned ? 1.3 : 0 }}
        className="mt-2 text-[14px] leading-snug text-ink-2"
      >
        {cam?.name ?? al.b} is <span className="font-mono text-amber">{al.offsetSec.toFixed(1)} s</span> behind
        {al.driftPpm ? (
          <>
            , drifting <span className="font-mono text-amber">{Math.round(al.driftPpm)} ppm</span>
          </>
        ) : null}
        {al.plantedSec !== undefined && <span className="text-ink-3"> · planted {al.plantedSec.toFixed(1)} s</span>}
      </motion.div>
    </Panel>
  );
}

function SyncPlayers({
  c,
  cams,
  moment,
  aligned,
  sync,
  onSync,
  carved,
  diskId,
}: {
  c: Case;
  cams: Camera[];
  moment: { t: number } | null;
  aligned: boolean;
  sync: boolean;
  onSync: () => void;
  carved: boolean;
  diskId?: string;
}) {
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const segs = useMemo(
    () =>
      cams.map((cam) =>
        moment
          ? c.segments.find(
              (s) =>
                s.cameraId === cam.id &&
                s.clip &&
                (carved || s.state === "indexed" || s.extent.sourceId !== diskId) &&
                secs(s.refStart) <= moment.t &&
                moment.t <= secs(s.refEnd),
            )
          : undefined,
      ),
    [c, cams, moment, carved, diskId],
  );

  // Seek both players, wait until both have landed, then start them together. While they
  // play, a player that drifts more than a tenth of a second from the lead is pulled back,
  // so the two burned-in clocks show the same moment.
  useEffect(() => {
    if (!sync || !moment) return;
    let stop = false;
    let raf = 0;
    const pairs = segs.map((s, i) => ({ s, v: vids.current[i] })).filter((p): p is { s: Segment; v: HTMLVideoElement } => !!p.s && !!p.v);
    const ready = (v: HTMLVideoElement) =>
      v.readyState >= 1 ? Promise.resolve() : new Promise<void>((r) => v.addEventListener("loadedmetadata", () => r(), { once: true }));
    const seek = (v: HTMLVideoElement, t: number) =>
      new Promise<void>((r) => {
        v.addEventListener("seeked", () => r(), { once: true });
        v.currentTime = t;
      });
    (async () => {
      await Promise.all(pairs.map((p) => ready(p.v)));
      await Promise.all(pairs.map((p) => seek(p.v, Math.max(0, moment.t - secs(p.s.refStart)))));
      if (stop) return;
      await Promise.all(pairs.map((p) => p.v.play().catch(() => {})));
      const tick = () => {
        const lead = pairs[0];
        if (lead) {
          const now = secs(lead.s.refStart) + lead.v.currentTime;
          setNow(now);
          for (const p of pairs.slice(1)) {
            const want = now - secs(p.s.refStart);
            if (Math.abs(p.v.currentTime - want) > 0.1 && want < p.v.duration) p.v.currentTime = want;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [sync, moment, segs]);

  return (
    <div className="grid grid-cols-[1fr_1fr_260px] gap-5" data-testid="players">
      {cams.map((cam, i) => {
        const s = segs[i];
        const off = cam.clock.offsetSec;
        return (
          <Panel key={cam.id} className="overflow-hidden" data-testid={`player-panel-${cam.id}`}>
            <div className="relative bg-black">
              {s ? (
                <video
                  key={s.id}
                  ref={(el) => {
                    vids.current[i] = el;
                  }}
                  src={media(s.clip)}
                  poster={media(s.poster)}
                  muted
                  playsInline
                  className="h-[330px] w-full object-contain"
                  data-testid={`player-${cam.id}`}
                />
              ) : (
                <div className="grid h-[330px] place-items-center">
                  <div className="flex flex-col items-center gap-2 text-red">
                    <TriangleAlert className="h-8 w-8" />
                    <span className="text-[16px] font-semibold">No footage in the index at this time</span>
                  </div>
                </div>
              )}
              {s?.state === "recovered-unindexed" && (
                <div className="absolute right-3 top-3 rounded bg-amber px-2 py-1 text-[12px] font-bold text-amber-ink">
                  Recovered by carving
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded bg-black/75 px-2.5 py-1.5 font-mono text-[13px] text-ink backdrop-blur">
                {cam.name} · raw {now !== null ? clock(now - off) : "--:--:--"}
              </div>
            </div>
          </Panel>
        );
      })}
      <Panel className="flex flex-col justify-between p-5">
        <div>
          <Label>Reference time</Label>
          <div className="mt-2 font-mono text-[30px] text-teal tabular" data-testid="ref-clock">
            {now !== null ? clock(now, true) : "--:--:--"}
          </div>
          <div className="mt-2 text-[14px] leading-snug text-ink-3">
            Both players are held to this clock. Each keeps its recorder&apos;s raw time.
          </div>
        </div>
        <button
          type="button"
          data-testid="play-both"
          disabled={!aligned || !moment}
          onClick={onSync}
          className={cn(
            "mt-4 flex items-center justify-center gap-2 rounded-md py-3 text-[15px] font-bold transition-all",
            aligned ? "bg-amber text-amber-ink" : "bg-panel-2 text-ink-3",
          )}
        >
          <Play className="h-4 w-4" /> Play both{moment ? ` at ${clock(moment.t)}` : ""}
        </button>
      </Panel>
    </div>
  );
}
