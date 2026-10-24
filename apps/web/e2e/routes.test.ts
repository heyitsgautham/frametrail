import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type Browser, chromium } from "playwright";

// Smoke test against a running build (pnpm build && pnpm start): every screen renders its
// key element with no page error and no request outside the app.
const BASE = process.env.FT_URL ?? "http://localhost:3150";
const ROUTES: [string, string][] = [
  ["/intake", "disk-map"],
  ["/timeline", "lanes"],
  ["/recovery", "time-reversal"],
  ["/triage", "markers"],
  ["/provenance", "graph"],
  ["/custody", "custody-log"],
  ["/report", "certificate"],
  ["/vendors", "vendor-matrix"],
  ["/research", "method-footage"],
  ["/title", "title-card"],
];

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

for (const [route, testId] of ROUTES) {
  test(`${route} renders`, async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    const away: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) away.push(r.url());
    });
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.getByTestId(testId).first().waitFor({ timeout: 10_000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(away, []);
    await page.close();
  });
}

test("custody tamper breaks the chain", async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/custody`, { waitUntil: "networkidle" });
  await page.getByTestId("tamper").click();
  await page.getByText(/Chain broken at entry/).waitFor({ timeout: 10_000 });
  await page.close();
});

test("health reports the case the screens read", async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; case: string; segments: number };
  assert.equal(body.status, "ok");
  assert.ok(body.case);
  assert.ok(body.segments > 0);
});
