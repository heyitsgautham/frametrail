import type { State } from "./types";

export const STATE_LABEL: Record<State, string> = {
  indexed: "Indexed",
  "recovered-unindexed": "Recovered, not in index",
  partial: "Partial",
  overwritten: "Overwritten",
  free: "Free",
  system: "System area",
};

// One colour per recovery state, shared by the disk map, the timeline and the legend.
export const STATE_COLOR: Record<State, string> = {
  indexed: "var(--st-indexed)",
  "recovered-unindexed": "var(--st-recovered)",
  partial: "var(--st-partial)",
  overwritten: "var(--st-overwritten)",
  free: "var(--st-free)",
  system: "var(--st-system)",
};

export function bytes(n: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export function hex(n: number, pad = 8): string {
  return `0x${n.toString(16).toUpperCase().padStart(pad, "0")}`;
}

export function short(h: string, n = 8): string {
  return h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h;
}

/** Seconds since midnight for an ISO-ish local timestamp, ignoring any zone suffix. */
export function secs(iso: string): number {
  const m = /T?(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(iso);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function clock(s: number, frac = false): string {
  const t = ((s % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const x = t % 60;
  const ss = frac ? x.toFixed(2).padStart(5, "0") : String(Math.floor(x)).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${ss}`;
}

export function day(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, mo, dd] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && mo && dd ? `${Number(dd)} ${months[Number(mo) - 1]} ${y}` : iso;
}

/** The URL the app serves a clip or poster at, whatever form the engine wrote the path in. */
export function media(p?: string): string | undefined {
  if (!p) return undefined;
  return `/clips/${p.replace(/^\/+/, "").replace(/^(data\/local\/)?clips\//, "")}`;
}
