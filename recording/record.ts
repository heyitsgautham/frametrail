import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { chromium } from "playwright";
import { VOICEOVER } from "./brand";
import { overlay } from "./overlay";
import { DURATION, type Director, START, scenes } from "./storyboard";
import { writeSrt, writeVoiceover } from "./voiceover";

// pnpm record
// Plays the storyboard against a running production build and records it at 1920x1080.
// Frames come from Chromium's own screencast with their paint timestamps, so the cut is
// sharp and each frame lands exactly where the page painted it. ffmpeg then lays them on a
// constant 30 fps timeline as H.264. The same script, data and timings give the same video.
//
//   pnpm build && pnpm start      in one terminal
//   pnpm record                   in another, writes recording/out/demo.mp4

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3150" },
    keep: { type: "boolean", default: false },
    // Re-encode the frames of the last take without recording again.
    encode: { type: "boolean", default: false },
  },
});

const root = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(root, "..");
const out = path.join(root, "out");
const frames = path.join(out, "frames");
const base = new URL(values.url ?? "http://localhost:3150");
// The page is laid out at 1600x900 and rendered at 2x, and the video is exported at
// 1920x1080, so text is supersampled rather than scaled up.
const VW = 1600;
const VH = 900;
const W = 1920;
const H = 1080;

interface Frame {
  file: string;
  at: number;
}

const MP4 = path.join(out, "frametrail.mp4");
const LIST = path.join(out, "frames.txt");

// ffmpeg ships inside node_modules, so the encode needs nothing installed on the machine.
function encode() {
  execFileSync(
    ffmpeg.path,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      LIST,
      "-vf",
      `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "16",
      "-r",
      "30",
      "-t",
      String(DURATION),
      "-movflags",
      "+faststart",
      MP4,
    ],
    { stdio: "inherit" },
  );
}

async function main() {
  if (values.encode) {
    encode();
    writeVoiceover(VOICEOVER);
    console.log(`re-encoded ${path.relative(repo, MP4)}`);
    return;
  }
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    colorScheme: "dark",
  });
  const offOrigin: string[] = [];
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base.origin && u.protocol !== "data:" && u.protocol !== "blob:") {
      offOrigin.push(u.href);
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(overlay());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Warm the server so the first navigation in the take is as quick as the rest.
  for (const p of [START, "/timeline", "/recovery", "/triage", "/provenance", "/custody", "/report", "/vendors", "/research", "/title"]) {
    await page.goto(new URL(p, base).href, { waitUntil: "networkidle" });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.setContent('<html><body style="margin:0;background:#0e1012"></body></html>');
  await page.evaluate(() => sessionStorage.clear());

  const cdp = await context.newCDPSession(page);
  const shots: Frame[] = [];
  const pending: Promise<void>[] = [];
  let n = 0;
  let t0 = 0;
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(frames, `f${String(++n).padStart(5, "0")}.jpg`);
    pending.push(writeFile(file, Buffer.from(f.data, "base64")));
    shots.push({ file, at: f.metadata.timestamp ?? Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  let start = Date.now();
  // Rectangles in the page's own, unzoomed coordinates, so zooms and rings land where the
  // element is laid out whatever the camera is doing.
  const rect = async (testId: string) => {
    const r = await page
      .getByTestId(testId)
      .first()
      .evaluate((el) => {
        const b = el.getBoundingClientRect();
        const t = getComputedStyle(document.body).transform;
        const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
        const inv = m.inverse();
        const p1 = inv.transformPoint(new DOMPoint(b.left, b.top));
        const p2 = inv.transformPoint(new DOMPoint(b.right, b.bottom));
        return { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y };
      });
    return r;
  };
  const director: Director = {
    page,
    async at(seconds) {
      const wait = start + seconds * 1000 - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      else if (wait < -250) console.warn(`running ${(-wait / 1000).toFixed(2)} s late at ${seconds} s`);
    },
    async moveTo(testId, opts = {}) {
      const box = await page.getByTestId(testId).first().boundingBox();
      if (!box) throw new Error(`no element ${testId}`);
      const x = box.x + box.width * (0.5 + (opts.dx ?? 0));
      const y = box.y + box.height * (0.5 + (opts.dy ?? 0));
      const steps = Math.max(2, Math.round((opts.ms ?? 700) / 16));
      await page.mouse.move(x, y, { steps });
    },
    async click(testId, opts = {}) {
      await director.moveTo(testId, opts);
      await page.waitForTimeout(120);
      await page.mouse.down();
      await page.waitForTimeout(70);
      await page.mouse.up();
    },
    async zoom(testId, scale, ms = 1200, dy = 0) {
      const r = { ...(await rect(testId)) };
      r.y += dy;
      await page.evaluate(([r, s, ms]) => (window as unknown as { __cam: { zoom: (...a: unknown[]) => void } }).__cam.zoom(r, s, ms), [
        r,
        scale,
        ms,
      ] as const);
    },
    async unzoom(ms = 800) {
      await page.evaluate((ms) => (window as unknown as { __cam: { reset: (ms: number) => void } }).__cam.reset(ms), ms);
      await page.waitForTimeout(ms);
    },
    async ring(testId, ms = 3000, tone = "ink") {
      const r = await rect(testId);
      await page.evaluate(
        ([r, ms, tone]) => (window as unknown as { __cam: { ring: (...a: unknown[]) => void } }).__cam.ring(r, ms, tone),
        [r, ms, tone] as const,
      );
    },
    async reveal(testId, ms = 700) {
      await page
        .getByTestId(testId)
        .first()
        .evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await page.waitForTimeout(ms);
    },
    async hideCursor() {
      await page.waitForFunction(() => !!document.getElementById("__rec_cursor"));
      await page.evaluate(() => {
        document.getElementById("__rec_cursor")!.style.display = "none";
      });
    },
    async scrollTo(testId, ms = 1200, at = 0.3) {
      await page.evaluate(`window.__cam.scroll(${JSON.stringify(testId)}, ${ms}, ${at})`);
      await page.waitForTimeout(ms);
    },
    async lowerThird(show) {
      await page.waitForFunction(() => !!document.getElementById("__rec_lower") && document.fonts.status === "loaded");
      await page.evaluate((show) => (window as unknown as { __cam: { lower: (s: boolean) => void } }).__cam.lower(show), show);
    },
  };

  await page.mouse.move(1250, 620);
  start = Date.now();
  t0 = start / 1000;
  await page.goto(new URL(START, base).href, { waitUntil: "commit" });
  // Each scene times its own actions, which may start a beat before its line does.
  for (const scene of scenes()) await scene.play(director);
  await director.at(DURATION);
  await cdp.send("Page.stopScreencast");
  await Promise.all(pending);
  await context.close();
  await browser.close();

  if (offOrigin.length) throw new Error(`requests left the origin:\n${offOrigin.join("\n")}`);
  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);

  // Lay the frames on the timeline. Screencast timestamps are wall-clock seconds, and the
  // video starts at the moment the take started. The last frame painted before then opens it.
  const before = shots.filter((s) => s.at < t0).at(-1);
  const timeline = [...(before ? [{ ...before, at: t0 }] : []), ...shots.filter((s) => s.at >= t0)];
  const offset = t0;
  const lines: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const from = i === 0 ? 0 : timeline[i]!.at - offset;
    const to = i + 1 < timeline.length ? timeline[i + 1]!.at - offset : DURATION;
    const d = Math.max(0.001, Math.min(to, DURATION) - from);
    if (from >= DURATION) break;
    lines.push(`file '${timeline[i]!.file}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${timeline.at(-1)!.file}'`);
  writeFileSync(LIST, `${lines.join("\n")}\n`);
  encode();
  if (!values.keep) {
    rmSync(frames, { recursive: true, force: true });
    rmSync(LIST, { force: true });
  }
  writeVoiceover(VOICEOVER);
  writeSrt(path.join(out, "frametrail.srt"));
  console.log(`recorded ${timeline.length} frames into ${path.relative(repo, MP4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
