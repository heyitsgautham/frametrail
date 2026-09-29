// A time axis with the idle stretches cut out. Recorders film in bursts, minutes apart, so a
// linear axis would draw every segment as a sliver. Busy windows share the width; each gap
// between them becomes a narrow break band.

export interface Axis {
  x(t: number): number;
  windows: { from: number; to: number; left: number; width: number }[];
  breaks: { left: number; width: number; seconds: number }[];
  ticks: number[];
}

const BREAK = 5;

export function makeAxis(spans: [number, number][], pad = 12, joinBelow = 90): Axis {
  const s = spans.map(([a, b]) => [Math.min(a, b) - pad, Math.max(a, b) + pad] as [number, number]).sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of s) {
    const last = merged.at(-1);
    if (last && a - last[1] < joinBelow) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const active = merged.reduce((n, [a, b]) => n + (b - a), 0) || 1;
  const room = 100 - BREAK * Math.max(0, merged.length - 1);
  const windows: Axis["windows"] = [];
  const breaks: Axis["breaks"] = [];
  let left = 0;
  merged.forEach(([a, b], i) => {
    const width = ((b - a) / active) * room;
    windows.push({ from: a, to: b, left, width });
    left += width;
    const next = merged[i + 1];
    if (next) {
      breaks.push({ left, width: BREAK, seconds: next[0] - b });
      left += BREAK;
    }
  });
  const x = (t: number) => {
    for (const [i, w] of windows.entries()) {
      if (t <= w.to || i === windows.length - 1) {
        if (t < w.from) return i === 0 ? w.left : breaks[i - 1]!.left + BREAK / 2;
        return w.left + (Math.min(t, w.to) - w.from) / (w.to - w.from || 1) * w.width;
      }
    }
    return 100;
  };
  const ticks: number[] = [];
  // At most one label per 9% of the width, on a round step.
  for (const w of windows) {
    const room = Math.max(1, Math.floor(w.width / 9));
    const step = [15, 30, 60, 120, 300, 600].find((st) => (w.to - w.from) / st <= room) ?? 900;
    for (let t = Math.ceil(w.from / step) * step; t <= w.to; t += step) ticks.push(t);
  }
  return { x, windows, breaks, ticks };
}
