"use client";

import { motion } from "motion/react";
import { Label, Panel } from "@/components/shell";
import { clock, secs } from "@/lib/format";
import type { Camera, Case } from "@/lib/types";

export function ClockCard({ cam, c, aligned }: { cam: Camera; c: Case; aligned: boolean }) {
  const src = c.sources.find((s) => s.id === cam.sourceId);
  const z = cam.clock.seizure;
  const off = cam.clock.offsetSec;
  return (
    <Panel className="p-5" data-testid={`clock-${cam.id}`}>
      <Label>
        {cam.name} · {src?.vendor.family}
      </Label>
      {z ? (
        // At 28 px a time needs 134 px, more than half a card holds below a 1366 px window.
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] text-ink-3">Recorder screen at seizure</div>
            <div className="font-mono text-[22px] leading-tight text-ink tabular min-[1366px]:text-[28px]" data-testid="clock-value">
              {clock(secs(z.dvrShown))}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">Reference clock</div>
            <div className="font-mono text-[22px] leading-tight text-teal tabular min-[1366px]:text-[28px]" data-testid="clock-value">
              {clock(secs(z.reference))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[14px] text-ink-3">No seizure record for this clock</div>
      )}
      <motion.div
        initial={false}
        animate={{ opacity: aligned ? 1 : 0.3 }}
        // Each part wraps as a whole, so a narrow card never splits "97.4 s" from "slow".
        className="mt-3 flex flex-wrap items-baseline gap-x-2 whitespace-nowrap text-[14px] text-ink-2"
        data-testid="clock-offset"
      >
        {Math.abs(off) < 0.5 ? (
          <span className="whitespace-normal font-mono text-[18px] font-bold text-teal">Matches the reference clock</span>
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
export function Correlation({ al, cams, aligned }: { al: Case["alignment"][number] | undefined; cams: Camera[]; aligned: boolean }) {
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
