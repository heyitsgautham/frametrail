import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

// pnpm hero
// The README's picture, docs/hero.png: the timeline after the wiped disk is carved, the
// hole filled and both cameras playing the same moment. Run it against a build made
// without apps/web/.env.local, so the image carries the neutral names; it refuses to
// write the image if a private name is on the page.
//
//   pnpm build && pnpm start
//   pnpm hero

const { values } = parseArgs({ options: { url: { type: "string", default: "http://localhost:3150" } } });
const base = new URL(values.url ?? "http://localhost:3150");
const root = path.dirname(new URL(import.meta.url).pathname);
const png = path.join(root, "../docs/hero.png");
const env = path.join(root, "../apps/web/.env.local");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, locale: "en-IN", timezoneId: "Asia/Kolkata", colorScheme: "dark" });
await page.goto(new URL("/timeline?done", base).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.mouse.move(4, 4);
await page.waitForTimeout(3600);

if (existsSync(env)) {
  process.loadEnvFile(env);
  const text = (await page.content()).toLowerCase();
  const names = Object.entries(process.env).filter(([k, v]) => k.startsWith("NEXT_PUBLIC_") && v);
  const leaks = names.map(([, v]) => v!).filter((v) => text.includes(v.toLowerCase()));
  if (leaks.length) throw new Error(`the page shows ${leaks.join(", ")}; serve a build made without apps/web/.env.local`);
}
await page.screenshot({ path: png });
await browser.close();
console.log(`wrote ${path.relative(path.join(root, ".."), png)}`);
