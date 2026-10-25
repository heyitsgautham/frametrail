"use client";

import { Play, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Label, Panel } from "@/components/shell";
import { clock, media, secs } from "@/lib/format";
import type { Camera, Case, Segment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SyncPlayers({
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
