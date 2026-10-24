import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

// pnpm take
// Stills of every screen in its finished state, for the deck and the README, against a
// running build. It fails if the page asks for anything outside its own origin.
//
//   pnpm take                      1920x1080 into recording/shots
//   pnpm take --size 1440x900      the laptop check

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3150" },
    size: { type: "string", default: "1920x1080" },
  },
});

const [width, height] = (values.size ?? "1920x1080").split("x").map(Number) as [number, number];
const base = new URL(values.url ?? "http://localhost:3150");
const root = path.dirname(new URL(import.meta.url).pathname);
const shots = path.join(root, "shots");
mkdirSync(shots, { recursive: true });
const suffix = `${width}x${height}`;
const offOrigin: string[] = [];
const errors: string[] = [];

async function shot(page: Page, name: string, settleMs = 1800) {
  await page.mouse.move(4, 4);
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: path.join(shots, `${name}-${suffix}.png`) });
}

async function main() {
  for (const f of readdirSync(shots)) if (f.endsWith(`-${suffix}.png`)) rmSync(path.join(shots, f));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    colorScheme: "dark",
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base.origin && u.protocol !== "data:" && u.protocol !== "blob:") {
      offOrigin.push(u.href);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const go = async (p: string) => {
    await page.goto(new URL(p, base).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
  };

  await go("/intake");
  await shot(page, "00-intake-before", 800);
  await go("/intake?done");
  await shot(page, "01-intake");
  await go("/timeline");
  await page.getByTestId("align").click();
  await page.getByTestId("play-both").click();
  await shot(page, "02-timeline-hole", 3200);
  await go("/recovery");
  await shot(page, "03-recovery-wipe", 2400);
  await go("/recovery?done");
  await shot(page, "04-recovery-carved", 2600);
  await go("/timeline?done");
  await shot(page, "05-timeline-filled", 3600);
  await go("/triage");
  await shot(page, "06-triage", 1600);
  await go("/provenance?done");
  await shot(page, "07-provenance", 2000);
  await go("/custody");
  await page.getByTestId("tamper").click();
  await shot(page, "08-custody-broken", 3000);
  await go("/report?done");
  await shot(page, "09-report", 2600);
  await go("/vendors");
  await shot(page, "10-vendors", 800);
  await go("/research");
  await shot(page, "11-research", 800);
  await go("/title");
  await shot(page, "12-title-card", 800);

  await browser.close();
  if (offOrigin.length || errors.length) {
    console.error([...offOrigin.map((u) => `left the origin: ${u}`), ...errors].join("\n"));
    process.exit(1);
  }
  console.log(`take ok at ${suffix}, no request left ${base.origin}, shots in ${path.relative(process.cwd(), shots)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
