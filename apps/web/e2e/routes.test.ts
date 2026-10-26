import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type Browser, chromium } from "playwright";

// Smoke test against a running build (pnpm build && pnpm start): every screen renders its
// key element with no page error, no request outside the app, and nothing the content
// security policy had to block.
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
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) errors.push(m.text());
    });
    page.on("request", (r) => {
      if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) away.push(r.url());
    });
    const res = await page.goto(BASE + route, { waitUntil: "networkidle" });
    assert.match(res?.headers()["content-security-policy"] ?? "", /default-src 'self'/);
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

// A 1280 px laptop leaves the triage notice too narrow for its text and model line on one row.
// The icon must keep its 20 px and the model line must stay on one line, not wrap mid-name.
test("triage notice keeps its icon and model line whole at 1280 px", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/triage`, { waitUntil: "networkidle" });
  const notice = page.getByTestId("ai-notice");
  const icon = await notice.locator("svg").first().boundingBox();
  assert.equal(Math.round(icon?.width ?? 0), 20);
  const model = page.getByTestId("ai-model");
  const box = await model.boundingBox();
  const lineHeight = await model.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  assert.ok((box?.height ?? 0) < lineHeight * 1.5, `model line wraps to ${box?.height} px`);
  await page.close();
});

// The provenance chain shares one row between four cards and three arrows. Each card must
// get the same width, and nothing in a card may run past its border, down to 1280 px.
for (const width of [1280, 1440, 1920]) {
  test(`provenance cards are equal and hold their content at ${width} px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    // ?done opens the screen with the first carved clip already traced.
    await page.goto(`${BASE}/provenance?done`, { waitUntil: "networkidle" });
    const cards = page.getByTestId("chain-card");
    await cards.nth(3).waitFor();
    const measured = await cards.evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const spill = Math.max(...Array.from(el.querySelectorAll("*")).map((c) => c.getBoundingClientRect().right - box.right));
        return { width: box.width, spill };
      }),
    );
    const widths = measured.map((m) => m.width);
    assert.ok(Math.max(...widths) - Math.min(...widths) < 1, `card widths ${widths.map(Math.round).join(", ")}`);
    for (const m of measured) assert.ok(m.spill <= 0, `content runs ${Math.round(m.spill)} px past a card`);
    await page.close();
  });
}

test("every adapter step on the vendors screen stays on one line at 1280 px", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/vendors`, { waitUntil: "networkidle" });
  const wrapped = await page
    .getByTestId("adapter-step")
    .evaluateAll((els) =>
      els
        .filter((el) => el.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(el).lineHeight) * 1.5 + 6)
        .map((el) => el.textContent),
    );
  assert.deepEqual(wrapped, []);
  await page.close();
});

test("the seizure clocks fit their half of the card at 1280 px", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  const spill = await page.getByTestId("clock-value").evaluateAll((els) =>
    els.map((el) => {
      const text = document.createRange();
      text.selectNodeContents(el);
      return Math.round(text.getBoundingClientRect().right - el.getBoundingClientRect().right);
    }),
  );
  assert.equal(spill.length, 4);
  for (const px of spill) assert.ok(px <= 0, `a time runs ${px} px past its half of the card`);
  await page.close();
});

test("the vendor signature shows whole, without scrolling, at 1280 px", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/intake`, { waitUntil: "networkidle" });
  const hidden = await page
    .getByTestId("hex-strip")
    .evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => el.scrollWidth - el.clientWidth));
  assert.deepEqual(hidden, [0]);
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
