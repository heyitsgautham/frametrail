// Display names the public repository leaves out, so a search for them does not
// find it. Set them in apps/web/.env.local, which git ignores, and the app and
// its takes show them; without them the app shows the neutral names below.
//
//   NEXT_PUBLIC_PRODUCT   product name          NEXT_PUBLIC_PS     problem statement ID
//   NEXT_PUBLIC_EVENT     short event label     NEXT_PUBLIC_TEAM   team line on the title card
//
// `pnpm check:names` fails if any of these values appears in a tracked file.

export const BRAND = {
  product: process.env.NEXT_PUBLIC_PRODUCT || "FrameTrail",
  ps: process.env.NEXT_PUBLIC_PS || "",
  event: process.env.NEXT_PUBLIC_EVENT || "",
  team: process.env.NEXT_PUBLIC_TEAM || "",
  tagline: process.env.NEXT_PUBLIC_TAGLINE || "Every frame, traced to its source bytes",
};

/** "NTRO", led by the problem statement ID when one is set. */
export function orgLine(org = "NTRO"): string {
  return [BRAND.ps, org].filter(Boolean).join(" · ");
}

export function pageTitle(page?: string): string {
  return [page, BRAND.product].filter(Boolean).join(" · ");
}
