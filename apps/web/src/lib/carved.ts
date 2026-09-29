"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ft-carved";

/**
 * Whether the examiner has carved the wiped disk yet. Until then the timeline shows only
 * what the recorder's own index lists. Kept per tab, and forced on by ?done for stills.
 */
export function useCarved(): [boolean, () => void] {
  const [carved, setCarved] = useState(false);
  useEffect(() => {
    let v = new URLSearchParams(window.location.search).has("done");
    try {
      v ||= sessionStorage.getItem(KEY) === "1";
    } catch {}
    setCarved(v);
  }, []);
  const carve = useCallback(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    setCarved(true);
  }, []);
  return [carved, carve];
}
