"use client";

import { useEffect, useState } from "react";

/** True when the URL carries ?done, so stills can open a screen in its finished state. */
export function useDone(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => setDone(new URLSearchParams(window.location.search).has("done")), []);
  return done;
}

/** A 0 to 1 clock that runs for `ms` once `on` turns true. */
export function useProgress(on: boolean, ms: number, instant = false): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!on) return setP(0);
    if (instant) return setP(1);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, ms, instant]);
  return p;
}
