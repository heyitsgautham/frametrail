import { loadCase } from "@/lib/data";

/** The committed demo case, read through the same loader the server uses. */
export const demo = loadCase();

/** Open the next render in its finished state, as the ?done stills do. */
export function finished() {
  window.history.replaceState(null, "", "/?done");
}
